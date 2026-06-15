import * as Jimp from "jimp";
import * as fs from "fs";
import path from "path";
import bearingToString from "./bearingToString";

const NO_REFLECTIVITY = -1;
let radarColorIndexCache: Map<string, number> | undefined;

export default async function (buffer: Buffer): Promise<string> {
	const jimpImg = await Jimp.read(buffer);
	const width = jimpImg.getWidth();
	const height = jimpImg.getHeight();

	const radarColorIndex = getRadarColorIndex();
	const scanIterator = jimpImg.scanIterator(0, 0, jimpImg.getWidth(), jimpImg.getHeight());
	const center = { x: width / 2, y: height / 2 };
	const res: {[key: string]: {[key: number]: number}} = {};

	for (const { idx, x, y } of scanIterator) {
		const r = jimpImg.bitmap.data[idx + 0];
		const g = jimpImg.bitmap.data[idx + 1];
		const b = jimpImg.bitmap.data[idx + 2];
		const a = jimpImg.bitmap.data[idx + 3];
		const bearing = Math.atan2(y - center.y, x - center.x) * 180 / Math.PI;
		const bearingStr = bearingToString(bearing, true);
		if (!bearingStr) {
			continue;
		}

		let reflectivity: ReflectivityIntensity | typeof NO_REFLECTIVITY;
		if (a === 0) {
			reflectivity = NO_REFLECTIVITY;
		} else {
			const dbz = radarColorIndex.get(`${r},${g},${b}`);
			if (dbz === undefined) {
				throw new Error(`No color index found for color ${r}, ${g}, ${b}, ${idx}, ${x}, ${y}`);
			}
			reflectivity = reflectivityIntensityForDbz(dbz);
		}

		if (!res[bearingStr]) {
			res[bearingStr] = {
				[reflectivity]: 1
			};
		} else if (!res[bearingStr][reflectivity]) {
			res[bearingStr][reflectivity] = 1;
		} else {
			res[bearingStr][reflectivity]++;
		}
	}

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
		returnArray.push(`${intensity} precipitation to the ${directions.join(" and ")}`);
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

/**
 * Build a reusable lookup table for radar RGB values.
 */
function getRadarColorIndex(): Map<string, number> {
	if (!radarColorIndexCache) {
		const radarColorIndex = convertCSVToJSONWithHeaders(fs.readFileSync(path.join(__dirname, "..", "..", "radarColorIndex.csv"), "utf-8"));
		radarColorIndexCache = new Map(radarColorIndex.map((obj) => [`${obj.Red},${obj.Green},${obj.Blue}`, obj["Value (dBZ)"]]));
	}
	return radarColorIndexCache;
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

/**
 * Convert a radar dBZ value into a coarse intensity bucket.
 */
function reflectivityIntensityForDbz(dbz: number): ReflectivityIntensity {
	if (dbz < 0) {
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
}

function reflectivityIntensityToString(intensity: ReflectivityIntensity | string): string {
	const normalizedIntensity = typeof intensity === "string" ? parseInt(intensity) : intensity;
	switch (normalizedIntensity) {
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
	return "unknown";
}
