import { resizeImage } from "./resizeImage";
import Jimp from "jimp";

test("resizeImage() scales image", async () => {
	const img = await new Jimp(10, 20, 0xffffffff);
	const buffer = await img.getBufferAsync(Jimp.MIME_PNG);
	const resized = await resizeImage(buffer, 50);
	const out = await Jimp.read(resized);
	expect({"width": out.getWidth(), "height": out.getHeight()}).toStrictEqual({"width": 5, "height": 10});
});
