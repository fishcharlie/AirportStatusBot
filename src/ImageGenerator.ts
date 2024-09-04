import { mapToImage } from "maptoimage";
import { Status } from "./types/Status";
import Jimp from "jimp";
import GeoJSONToTileImages from "geojson-to-tile-images";
import * as turf from "@turf/turf";

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

	return Math.min(latZoom, lngZoom, ZOOM_MAX);
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

	constructor(status: Status) {
		this.#status = status;
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

		if (this.types.includes(ImageType.radar)) {
			layers.push({
				"url": "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-0/{z}/{x}/{y}.png",
				"opacity": 0.6
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
							"properties": {
								"stroke": "black",
								"stroke-width": 5,
								"stroke-opacity": 0.75
							},
							"geometry": geojson
						}
					]
				}, [z, x, y]);
			});
		}

		const mapCenter = (() => {
			if (airport) {
				return {
					"lat": airport.latitude_deg,
					"lng": airport.longitude_deg
				};
			} else if (this.#status.geoJSON) {
				const centerPoint = turf.center(this.#status.geoJSON);
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
		let returnValue = {
			"content": await jimp.getBufferAsync(Jimp.MIME_PNG)
		};
		return returnValue;
	}
}
