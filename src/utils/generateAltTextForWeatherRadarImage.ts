import * as Jimp from "jimp";
import * as fs from "fs";
import path from "path";
import bearingToString from "./bearingToString";

export default async function (buffer: Buffer): Promise<string> {
	const jimpImg = await Jimp.read(buffer);
	const width = jimpImg.getWidth();
	const height = jimpImg.getHeight();

	const radarColorIndex = convertCSVToJSONWithHeaders(fs.readFileSync(path.join(__dirname, "..", "..", "radarColorIndex.csv"), "utf-8"));

	const scanIterator = jimpImg.scanIterator(0, 0, jimpImg.getWidth(), jimpImg.getHeight());
	let radarDbzPerPixel = [];
	for (const { idx, x, y } of scanIterator) {
		const r = jimpImg.bitmap.data[idx + 0];
		const g = jimpImg.bitmap.data[idx + 1];
		const b = jimpImg.bitmap.data[idx + 2];
		const a = jimpImg.bitmap.data[idx + 3];

		if (a === 0) {
			radarDbzPerPixel.push(null);
		} else {
			const colorIndex = radarColorIndex.find((obj, i) => {
				return obj.Red === r && obj.Green === g && obj.Blue === b;
			});
			if (!colorIndex) {
				throw new Error(`No color index found for color ${r}, ${g}, ${b}, ${idx}, ${x}, ${y}`);
			}
			radarDbzPerPixel.push(colorIndex["Value (dBZ)"]);
		}
	}

	const reflectivityPerPixel = radarDbzPerPixel.map((dbz) => {
		if (dbz === null) {
			return null;
		} else if (dbz < 0) {
			return ReflectivityIntensity.extremelyLight;
		} else if (dbz < 20) {
			return ReflectivityIntensity.veryLight;
		} else if (dbz < 40) {
			return ReflectivityIntensity.light;
		} else if (dbz < 50) {
			return ReflectivityIntensity.moderate;
		} else if (dbz < 65) {
			return ReflectivityIntensity.heavy;
		} else {
			return ReflectivityIntensity.extremelyHeavy;
		}
	});

	const center = { x: width / 2, y: height / 2 };
	const res = reflectivityPerPixel.reduce((previousValue: any, reflectivity, i) => {
		const x = i % width;
		const y = Math.floor(i / width);
		const bearing = Math.atan2(y - center.y, x - center.x) * 180 / Math.PI;

		const bearingStr = bearingToString(bearing, true);
		if (!bearingStr) {
			return previousValue;
		}

		if (!previousValue[bearingStr]) {
			previousValue[bearingStr] = {
				[reflectivity ?? -1]: 1
			};
		} else if (previousValue[bearingStr] && !previousValue[bearingStr][reflectivity ?? -1]) {
			previousValue[bearingStr][reflectivity ?? -1] = 1;
		} else {
			previousValue[bearingStr][reflectivity ?? -1]++;
		}

		return previousValue;
	}, {});

	const data = Object.entries(res).reduce((previousValue: any, currentValue: any) => {
		const noReflectivity = currentValue[1]["-1"] ?? 0;
		const total: number = Object.values(currentValue[1]).reduce(((prev: number, curr: number) => prev + curr) as any, 0) as any;
		// Don't include directions with no radar data in >95% of the pixels
		if (noReflectivity / total > .95) {
			return previousValue;
		}
		previousValue[currentValue[0]] = {
			"%NoReflectivity": noReflectivity / total,
			"highestIntensity": Object.entries(currentValue[1]).reduce((prev: any, curr: any) => {
				if (curr[0] === "-1") {
					return prev;
				}
				if (prev[1] < curr[1]) {
					return curr;
				}
				return prev;
			})
		};
		return previousValue;
	}, {});

	if (Object.keys(data).length === 0) {
		return "The map shows no storms based on weather radar.";
	}

	let intensityObj: {[key: string]: string[]} = {};
	for (const [key, value] of Object.entries(data)) {
		const intensityString = reflectivityIntensityToString((value as any)["highestIntensity"][0]);
		intensityObj[intensityString] = Array.isArray(intensityObj[intensityString]) ? [...intensityObj[intensityString], key] : [key];
	}

	let returnArray: string[] = [];
	Object.entries(intensityObj).forEach(([intensity, directions]) => {
		returnArray.push(`${intensity} perception to the ${directions.join(" and ")}`);
	});

	return `The map has a weather radar layer showing ${returnArray.join(" and ")}.`;
}

function convertCSVToJSONWithHeaders(string: string): {[key: string]: any}[] {
	const lines = string.split("\n");
	const headers = lines[0].split(",");
	return lines.slice(1).map((line) => {
		const values = line.split(",");
		const obj: {[key: string]: any} = {};
		headers.forEach((header, i) => {
			const parsedValue = parseFloat(values[i]);
			obj[header] = isNaN(parsedValue) ? values[i] : parsedValue;
		});
		return obj;
	});
}

// https://www.noaa.gov/jetstream/reflectivity
enum ReflectivityIntensity {
	extremelyLight, // -35 to 0 dBZ
	veryLight, // 0 to 20 dBZ
	light, // 20 to 40 dBZ
	moderate, // 40 to 50 dBZ
	heavy, // 50 to 65 dBZ
	extremelyHeavy, // >65 dBZ
}

function reflectivityIntensityToString(intensity: ReflectivityIntensity): string {
	switch (intensity) {
		case ReflectivityIntensity.extremelyLight:
			return "extremely light";
		case ReflectivityIntensity.veryLight:
			return "light";
		case ReflectivityIntensity.light:
			return "light";
		case ReflectivityIntensity.moderate:
			return "heavy";
		case ReflectivityIntensity.heavy:
			return "heavy";
		case ReflectivityIntensity.extremelyHeavy:
			return "heavy";
	}
}
