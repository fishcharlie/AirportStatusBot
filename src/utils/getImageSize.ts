import Jimp from "jimp";

export async function getImageSize(image: Buffer): Promise<{"width": number, "height": number}> {
	const img = await Jimp.read(image);
	return {"width": img.getWidth(), "height": img.getHeight()};
}
