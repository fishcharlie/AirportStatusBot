import Jimp from "jimp";
import generateAltTextForWeatherRadarImage from "./generateAltTextForWeatherRadarImage";

test("generateAltTextForWeatherRadarImage() reports no storms for transparent radar", async () => {
	const image = await new Jimp(3, 3, 0x00000000);
	const buffer = await image.getBufferAsync(Jimp.MIME_PNG);

	expect(await generateAltTextForWeatherRadarImage(buffer)).toStrictEqual("The map shows no storms based on weather radar.");
});

test("generateAltTextForWeatherRadarImage() scans radar pixels without per-pixel arrays", async () => {
	const image = await new Jimp(3, 3, 0x00000000);
	image.setPixelColor(Jimp.rgbaToInt(170, 0, 0, 255), 2, 2);
	const buffer = await image.getBufferAsync(Jimp.MIME_PNG);

	expect(await generateAltTextForWeatherRadarImage(buffer)).toStrictEqual("The map has a weather radar layer showing heavy precipitation to the east.");
});
