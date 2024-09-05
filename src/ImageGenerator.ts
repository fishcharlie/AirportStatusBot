import { mapToImage } from "maptoimage";
import { Status } from "./types/Status";
import Jimp from "jimp";
import GeoJSONToTileImages from "geojson-to-tile-images";
import * as turf from "@turf/turf";
import getClosestLandmarkToPoint from "./utils/getClosestLandmarkToPoint";
import { NaturalEarthDataManager } from "./NaturalEarthDataManager";
import generateAltTextForWeatherRadarImage from "./utils/generateAltTextForWeatherRadarImage";

const SIZE = {
	"width": 1280,
	"height": 720
};
const ZOOM = 9;

function getZoomLevel(bbox: any, mapWidth: number, mapHeight: number): number {
	const WORLD_DIM = { width: 256, height: 256 }; // Base tile size
	const ZOOM_MAX = 21;

	function latRad(lat: number): number {
		const sin = Math.sin(lat * Math.PI / 180);
		const radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
		return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
	}

	function zoom(mapPx: number, worldPx: number, fraction: number): number {
		return Math.floor(Math.log(mapPx / worldPx / fraction) / Math.LN2);
	}

	const latFraction = (latRad(bbox[3]) - latRad(bbox[1])) / Math.PI;
	const lngDiff = bbox[2] - bbox[0];
	const lngFraction = ((lngDiff < 0) ? (lngDiff + 360) : lngDiff) / 360;

	const latZoom = zoom(mapHeight, WORLD_DIM.height, latFraction);
	const lngZoom = zoom(mapWidth, WORLD_DIM.width, lngFraction);

	// Ensure the bbox is contained within the zoom level
	const zoomLevel = Math.min(latZoom, lngZoom, ZOOM_MAX);

	// Adjust zoom level to ensure bbox is fully contained
	const adjustedZoomLevel = Math.max(zoomLevel - 1, 0);

	return adjustedZoomLevel;
}


export enum ImageType {
	"radar",
	"geojson"
}

interface ImageOutput {
	"content": Buffer;
	"alt"?: string;
}

export class ImageGenerator {
	#status: Status;
	#naturalEarthDataManager: NaturalEarthDataManager;

	constructor(status: Status, naturalEarthDataManager: NaturalEarthDataManager) {
		this.#status = status;
		this.#naturalEarthDataManager = naturalEarthDataManager;
	}

	get types(): ImageType[] {
		return [
			...this.#status.reason.imageType(),
			...this.#status.imageType()
		];
	}

	async generate(): Promise<ImageOutput | undefined> {
		if (this.types.length === 0) {
			return undefined;
		}

		const airport = await this.#status.airport();
		if (!airport && !this.types.includes(ImageType.geojson)) {
			return undefined;
		}

		let layers: (string | {"url": string, "opacity": number} | ((z: number, x: number, y: number) => Buffer | Promise<Buffer>))[] = [
			"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
		];
		let attribution = "Map data from OpenStreetMap contributors.\nhttps://openstreetmap.org/copyright";

		let radarBuffers: { [key: string]: Buffer } = {};
		async function fetchRadarTile(z: number, x: number, y: number): Promise<Buffer> {
			const url = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-0/${z}/${x}/${y}.png`;
			console.log(`Fetching tile: ${url}`);
			const img = await fetch(url);
			const arrayBuffer = await img.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);
			return buffer;
		}
		if (this.types.includes(ImageType.radar)) {
			layers.push(async (z: number, x: number, y: number): Promise<Buffer> => {
				const buffer = await fetchRadarTile(z, x, y);
				radarBuffers[`${z}/${x}/${y}`] = buffer;
				return (await Jimp.read(buffer)).opacity(0.6).getBufferAsync(Jimp.MIME_PNG);
			});
			attribution += "\nRadar data from Iowa Environmental Mesonet.";
		}
		if (this.types.includes(ImageType.geojson) && this.#status.geoJSON !== undefined) {
			const geojson = this.#status.geoJSON;
			layers.push(async (z: number, x: number, y: number): Promise<Buffer> => {
				return await GeoJSONToTileImages({
					"type": "FeatureCollection",
					"features": [
						{
							"type": "Feature",
							"properties": geojson.type === "LineString" ? {
								"stroke": "black",
								"stroke-width": 5,
								"stroke-opacity": 0.75
							} : {
								"fill": "black",
								"fill-opacity": 0.6
							},
							"geometry": geojson
						}
					]
				}, [z, x, y]);
			});
		}

		let centerText: string | undefined = undefined;
		const mapCenter = await (async () => {
			if (airport) {
				centerText = `at ${airport.name}`;
				return {
					"lat": airport.latitude_deg,
					"lng": airport.longitude_deg
				};
			} else if (this.#status.geoJSON) {
				const centerPoint = turf.center(this.#status.geoJSON);
				const states = await this.#naturalEarthDataManager.geoJSON("ne_110m_admin_1_states_provinces");
				const statesCenterPoints = states ? turf.featureCollection(states.features.map((feature) => {
					return turf.centroid(feature, {
						"properties": feature.properties ?? {}
					});
				})) : undefined;
				if (statesCenterPoints) {
					const nearestPopulatedArea = getClosestLandmarkToPoint(centerPoint, statesCenterPoints as any);
					if (nearestPopulatedArea && nearestPopulatedArea.item.properties?.name) {
						centerText = `to the ${nearestPopulatedArea.direction} of ${nearestPopulatedArea.item.properties.name}`;
					}
				}
				return {
					"lat": centerPoint.geometry.coordinates[1],
					"lng": centerPoint.geometry.coordinates[0]
				};
			} else {
				throw new Error("No center point available.");
			}
		})();
		const img = await mapToImage({
			"image": {
				"dimensions": {
					"height": SIZE.height,
					"width": SIZE.width
				}
			},
			"map": {
				"center": mapCenter,
				"zoom": this.types.includes(ImageType.geojson) ? getZoomLevel(turf.bbox(this.#status.geoJSON!), SIZE.width, SIZE.height) : ZOOM,
				layers
			}
		});
		const buffer = await img.png().toBuffer();

		let radarAltText: string | undefined = undefined;
		if (this.types.includes(ImageType.radar)) {
			try {
				const radarOnlyImg = await mapToImage({
					"image": {
						"dimensions": {
							"height": Math.max(SIZE.height, SIZE.height),
							"width": Math.max(SIZE.height, SIZE.height)
						}
					},
					"map": {
						"center": mapCenter,
						"zoom": ZOOM,
						"layers": [
							async (z: number, x: number, y: number): Promise<Buffer> => {
								return radarBuffers[`${z}/${x}/${y}`] ?? await fetchRadarTile(z, x, y);
							}
						]
					}
				});
				const radarOnlyBuffer = await radarOnlyImg.png().toBuffer();
				radarAltText = await generateAltTextForWeatherRadarImage(radarOnlyBuffer);
			} catch (error) {
				console.error("Error creating radar only img", error);
			}
		}

		const font = await Jimp.loadFont(Jimp.FONT_SANS_10_BLACK);
		let jimp = (await Jimp.read(buffer));
		let existingHeight = 0;
		const linePadding = 2;
		let maxWidth = 0;
		for (const line of attribution.split("\n")) {
			const height = Jimp.measureTextHeight(font, line, SIZE.width);
			const width = Jimp.measureText(font, line);
			jimp = jimp.print(font, 0, existingHeight, line);
			existingHeight += height + linePadding;
			maxWidth = Math.max(maxWidth, width);
		}
		let returnValue: ImageOutput = {
			"content": await jimp.getBufferAsync(Jimp.MIME_PNG)
		};

		if (centerText) {
			console.log(`A map centered ${centerText}.${radarAltText ? ` ${radarAltText}` : ""}\n\nPlease note that this alt text is in beta for AirportStatusBot and may not be fully accurate. If you notice any problems with the alt text, or have any suggestions, please contact the author.`);
		}

		return returnValue;
	}
}
