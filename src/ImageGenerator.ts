import { mapToImage } from "maptoimage";
import { Status } from "./types/Status";
import Jimp from "jimp";

const SIZE = {
	"width": 1280,
	"height": 720
};
const ZOOM = 9;

export enum ImageType {
	"radar"
}

export class ImageGenerator {
	#status: Status;

	constructor(status: Status) {
		this.#status = status;
	}

	get type(): ImageType | undefined {
		return this.#status.reason.imageType();
	}

	async toBuffer(): Promise<Buffer | undefined> {
		if (this.type === undefined) {
			return undefined;
		}

		const airport = await this.#status.airport();
		if (!airport) {
			return undefined;
		}

		let layers: (string | {"url": string, "opacity": number})[] = [
			"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
		];
		let attribution = "Map data from OpenStreetMap contributors.\nhttps://openstreetmap.org/copyright";

		switch (this.type) {
			case ImageType.radar:
				layers.push({
					"url": "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-0/{z}/{x}/{y}.png",
					"opacity": 0.6
				});
				attribution += "\nRadar data from Iowa Environmental Mesonet.";
				break;
		}

		const img = await mapToImage({
			"image": {
				"dimensions": {
					"height": SIZE.height,
					"width": SIZE.width
				}
			},
			"map": {
				"center": {
					"lat": airport.latitude_deg,
					"lng": airport.longitude_deg
				},
				"zoom": ZOOM,
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
		return await jimp.getBufferAsync(Jimp.MIME_PNG);
	}
}
