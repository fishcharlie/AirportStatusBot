import * as fs from "fs";
import * as path from "path";
import { XMLParser } from "fast-xml-parser";
import { Status, TypeEnum } from "./types/Status";
import { Poster } from "./Poster";
import { Config, ContentTypeEnum } from "./types/Config";
import * as objectUtils from "js-object-utilities";
import * as rimraf from "rimraf";
import { OurAirportsDataManager } from "./OurAirportsDataManager";
import { ImageGenerator } from "./ImageGenerator";

const packageJSON = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
let config: Config;
try {
	config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"));
} catch (e) {
	config = {"socialNetworks": [], "refreshInterval": 60};
}

const ENDPOINT = "https://nasstatus.faa.gov/api/airport-status-information";
const USER_AGENT = `AirportStatusBot/${packageJSON.version} (+${packageJSON.homepage})`;

const ourAirportsDataManager = new OurAirportsDataManager(USER_AGENT);

const poster = new Poster(config);

async function run (firstRun: boolean) {
	await ourAirportsDataManager.updateCache();

	let xmlResult: string;
	try {
		xmlResult = await (await fetch(ENDPOINT, {
			"method": "GET",
			"headers": {
				"User-Agent": USER_AGENT
			}
		})).text();
	} catch (e) {
		console.error("Failed to get XML");
		console.error(e);
		return;
	}

	console.time("Run Parse");
	const previousPath = path.join(__dirname, "..", "cache", "previous.xml");
	let previousXML: string | undefined;
	let previous: { [key: string]: any } | undefined;
	if (fs.existsSync(previousPath)) {
		previousXML = fs.readFileSync(previousPath, "utf8");
		previous = new XMLParser({
			"ignoreAttributes": false,
		}).parse(previousXML);
	}

	const jsonResult = new XMLParser({
		"ignoreAttributes": false,
	}).parse(xmlResult);

	if (!firstRun || process.env.NODE_ENV !== "production") {
		let delaysRaw: { [key: string]: any }[] = jsonResult.AIRPORT_STATUS_INFORMATION.Delay_type ?? [];
		if (typeof delaysRaw === "object" && !Array.isArray(delaysRaw)) {
			delaysRaw = [delaysRaw];
		}
		const delays: Status[] = delaysRaw.flatMap((delay) => Status.fromRaw(delay, ourAirportsDataManager)).filter((delay) => delay !== undefined) as Status[];

		let previousDelaysRaw: { [key: string]: any }[] = previous?.AIRPORT_STATUS_INFORMATION.Delay_type ?? [];
		if (typeof previousDelaysRaw === "object" && !Array.isArray(previousDelaysRaw)) {
			previousDelaysRaw = [previousDelaysRaw];
		}
		const previousDelays: Status[] = previousDelaysRaw.flatMap((delay) => Status.fromRaw(delay, ourAirportsDataManager)).filter((delay) => delay !== undefined) as Status[];

		const newDelays = delays.filter((delay) => !previousDelays.find((previousDelay) => previousDelay.comparisonHash === delay.comparisonHash));

		const removedDelays = previousDelays.filter((previousDelay) => !delays.find((delay) => delay.comparisonHash === previousDelay.comparisonHash));

		const updatedDelays: Status[] = (await Promise.all(delays.map(async (delay) => {
			const previousDelay = previousDelays.find((previousDelay) => previousDelay.comparisonHash === delay.comparisonHash);
			if (previousDelay) {
				const previousText: string | undefined = await previousDelay.toPost();
				const newText: string | undefined = await delay.toPost();

				if (previousText !== newText) {
					return delay
				}
			}
			return undefined;
		}))).filter((delay) => delay !== undefined) as Status[];

		console.log("\n\nAll delays:");
		console.log((await Promise.all(delays.map((delay) => delay.toPost()))).filter(Boolean));

		console.log("New delays:");
		console.log((await Promise.all(newDelays.map((delay) => delay.toPost()))).filter(Boolean));

		console.log("Removed delays:");
		console.log((await Promise.all(removedDelays.map((delay) => delay.toPost()))).filter(Boolean));

		console.log("Updated delays:");
		console.log((await Promise.all(updatedDelays.map(async (delay) => {
			const previousDelay = previousDelays.find((previousDelay) => previousDelay.comparisonHash === delay.comparisonHash);

			if (!previousDelay) {
				return undefined;
			}

			const newDelayText: string | undefined = await delay.toPost();
			const previousText: string | undefined = await previousDelay.toPost();

			if (!newDelayText || !newDelayText) {
				return undefined;
			}

			return {
				"previous": previousText,
				"new": newDelayText
			};
		}))).filter(Boolean));
		console.timeEnd("Run Parse");

		for (const delay of newDelays) {
			if (delay.type.type === TypeEnum.CLOSURE) {
				// Currently an airport closure isn't really a complete airport closure.
				// For example:
				// <Delay_type><Name>Airport Closures</Name><Airport_Closure_List><Airport><ARPT>LAS</ARPT><Reason>!LAS 12/067 LAS AD AP CLSD TO NON SKED TRANSIENT GA ACFT EXC PPR 702-261-7775 2312132300-2403132300</Reason><Start>Dec 13 at 18:00 UTC.</Start><Reopen>Mar 13 at 19:00 UTC.</Reopen></Airport></Airport_Closure_List></Delay_type>
				// ^ is a closure that is only for non-scheduled transient GA aircraft.
				// If we were to post this, many people would be confused.
				// @TODO: fix this so that the `toPost` method returns a closure post that is more accurate to the actual closure, and doesn't mislead or confuse people.
				continue;
			}
			const post = await delay.toPost();
			let image;
			try {
				image = await new ImageGenerator(delay).toBuffer();
			} catch (e) {
				console.error("Failed to generate image:");
				console.error(e);
			}
			if (post) {
				if (process.env.NODE_ENV === "production") {
					const postResponse = await poster.post({
						"message": post,
						image
					}, xmlResult, [ContentTypeEnum.ALL_FAA]);
					console.log(`Posted: '${post}'`);

					const comparisonHash = delay.comparisonHash;
					await fs.promises.mkdir(path.join(__dirname, "..", "cache", "posts", comparisonHash), { "recursive": true });
					console.log("Post response: \n", postResponse);

					const newPostResponse = {...postResponse};
					objectUtils.circularKeys(newPostResponse).forEach((key) => {
						objectUtils.set(newPostResponse, key, "[Circular]");
					});
					await fs.promises.writeFile(path.join(__dirname, "..", "cache", "posts", comparisonHash, "postResponse.json"), JSON.stringify(newPostResponse));
				} else {
					console.warn(`Not posting: '${post}' due to NODE_ENV not being production.`);
				}
			}
		}
		for (const delay of removedDelays) {
			const post = await delay.toEndedPost();
			const comparisonHash = delay.comparisonHash;
			if (post) {
				if (process.env.NODE_ENV === "production") {
					if (fs.existsSync(path.join(__dirname, "..", "cache", "posts", comparisonHash, "postResponse.json"))) {
						const postResponseText = await fs.promises.readFile(path.join(__dirname, "..", "cache", "posts", comparisonHash, "postResponse.json"), "utf8");
						const oldPostResponse = JSON.parse(postResponseText);

						let newPostResponse: objectUtils.GeneralObject<any> = {};
						const entries = Object.entries(oldPostResponse);
						for (const entry of entries) {
							const socialNetworkUUID: string = entry[0];
							const value: any = entry[1];

							const postResponse = await poster.reply(socialNetworkUUID, value, {
								"message": post
							}, xmlResult);
							if (Object.keys(postResponse).length > 0) {
								newPostResponse[socialNetworkUUID] = postResponse;
								console.log(`[${socialNetworkUUID}] Replied: '${post}'`);
							} else {
								newPostResponse[socialNetworkUUID] = oldPostResponse[socialNetworkUUID];
								console.warn(`[${socialNetworkUUID}] Failed to reply: '${post}'.`);
							}
						}
						console.log(`Post response: \n`, newPostResponse);

						const newPostResponseClean = {...newPostResponse};
						objectUtils.circularKeys(newPostResponseClean).forEach((key) => {
							objectUtils.set(newPostResponseClean, key, "[Circular]");
						});
						await fs.promises.writeFile(path.join(__dirname, "..", "cache", "posts", comparisonHash, "postResponse.json"), JSON.stringify(newPostResponseClean));
					} else {
						console.warn(`Not replying: '${post}' due to no previous postResponse.json file.`);
					}
				} else {
					console.warn(`Not posting: '${post}' due to NODE_ENV not being production.`);
				}
			}

			rimraf.rimrafSync(path.join(__dirname, "..", "cache", "posts", comparisonHash));
		}
	}

	await fs.promises.writeFile(previousPath, xmlResult);
}

(async () => {
	let firstRun = true;
	while (true) {
		await run(firstRun);
		await new Promise((resolve) => setTimeout(resolve, config.refreshInterval * 1000));
		firstRun = false;
	}
})();

// On SIGINT, SIGTERM, etc. exit gracefully
process.on("SIGINT", exitHandler);
process.on("SIGTERM", exitHandler);

async function exitHandler() {
	console.log("Exiting gracefully...");
	await ourAirportsDataManager.close();
	console.log("Done. Exiting.");
	process.exit(0);
}
