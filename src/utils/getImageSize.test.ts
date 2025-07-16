import { getImageSize } from "./getImageSize";
import Jimp from "jimp";

test("getImageSize() returns image dimensions", async () => {
	const img = await new Jimp(8, 6, 0xffffffff);
	const buffer = await img.getBufferAsync(Jimp.MIME_PNG);
	expect(await getImageSize(buffer)).toStrictEqual({"width": 8, "height": 6});
});
