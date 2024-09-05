import * as fs from "fs";
import * as path from "path";
import { XMLParser } from "fast-xml-parser";
import { Status, TypeEnum } from "./types/Status";
import { OurAirportsDataManager } from "./OurAirportsDataManager";
import { NaturalEarthDataManager } from "./NaturalEarthDataManager";
import { Reason } from "./types/Reason";

const USER_AGENT = `AirportStatusBot/${"0.1.0-dev"} (+${"https://mastodon.social/@AirportStatusBot"})`;

const ourAirportsDataManager = new OurAirportsDataManager(USER_AGENT);
const naturalEarthDataManager = new NaturalEarthDataManager(USER_AGENT);

(async () => {
	const listOfFiles = (await fs.promises.readdir(path.join(__dirname, "..", "tmpXML"))).filter((file) => file.endsWith(".txt"));
	const filesContents = await Promise.all(listOfFiles.map((file) => fs.promises.readFile(path.join(__dirname, "..", "tmpXML", file), "utf-8")));
	const parsedFileContents = filesContents.map((content) => content.split("\n")[4].trim());

	const delays = parsedFileContents.flatMap((content) => {
		const jsonResult = new XMLParser({
			"ignoreAttributes": false,
		}).parse(content);

		let delaysRaw: { [key: string]: any }[] = jsonResult.AIRPORT_STATUS_INFORMATION.Delay_type ?? [];
		if (typeof delaysRaw === "object" && !Array.isArray(delaysRaw)) {
			delaysRaw = [delaysRaw];
		}
		const delays: Status[] = delaysRaw.flatMap((delay) => Status.fromRaw(delay, ourAirportsDataManager, naturalEarthDataManager)).filter((delay) => delay !== undefined) as Status[];

		return delays;
	});
	const allNonClosureDelays = delays.filter((delay) => delay.type.type !== TypeEnum.CLOSURE);

	const allRawDelays = [...new Set(allNonClosureDelays.map((delay) => delay.reason.raw))];
	const allDelays = allRawDelays.map((rawDelay) => {
		return [rawDelay, new Reason(rawDelay).toString()];
	}).sort((a, b) => {
		// Sort where if the second element is undefined, it goes to the beginning
		if (a[1] === undefined && b[1] === undefined) {
			return 0;
		} else if (a[1] === undefined) {
			return -1;
		} else if (b[1] === undefined) {
			return 1;
		} else {
			return a[1].localeCompare(b[1]);
		}
	});

	// console.log(allDelays.map((delay) => JSON.stringify(delay)).join("\n"));

	// [...new Set(delays.filter((delay) => delay.type.type === TypeEnum.CLOSURE).map((delay) => delay.reason.raw))].forEach((v) => console.log(v));
})();
