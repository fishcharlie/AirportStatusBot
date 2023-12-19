import * as fs from "fs";
import * as path from "path";
import { XMLParser } from "fast-xml-parser";
import { Status, TypeEnum } from "./types/Status";
import { Poster } from "./Poster";
import { Config, ContentTypeEnum } from "./types/Config";

const packageJSON = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
let config: Config;
try {
	config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"));
} catch (e) {
	config = {"socialNetworks": [], "refreshInterval": 60};
}

const ENDPOINT = "https://nasstatus.faa.gov/api/airport-status-information";
const USER_AGENT = `AirportStatusBot/${packageJSON.version} (+${packageJSON.homepage})`;

let lastUpdatedCache: Date | undefined = undefined;
async function updateCache () {
	const cachePath = path.join(__dirname, "..", "cache", "ourairports", "airports.csv");
	const cacheExists = fs.existsSync(cachePath);

	// Only run if the cache is older than 1 day
	if (cacheExists && lastUpdatedCache && lastUpdatedCache.getTime() > Date.now() - 24 * 60 * 60 * 1000) {
		return;
	}

	try {
		console.log("Updating cache");
		const csvResult = await (await fetch("https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv", {
			"method": "GET",
			"headers": {
				"User-Agent": USER_AGENT
			}
		})).text();
		await fs.promises.mkdir(path.join(__dirname, "..", "cache", "ourairports"), {
			"recursive": true
		});
		await fs.promises.writeFile(cachePath, csvResult);
		lastUpdatedCache = new Date();
	} catch (e) {
		console.error("Failed to update cache");
		console.error(e);
	}
}

async function run (firstRun: boolean) {
	await updateCache();

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
		const delays: Status[] = delaysRaw.flatMap((delay) => Status.fromRaw(delay)).filter((delay) => delay !== undefined) as Status[];

		let previousDelaysRaw: { [key: string]: any }[] = previous?.AIRPORT_STATUS_INFORMATION.Delay_type ?? [];
		if (typeof previousDelaysRaw === "object" && !Array.isArray(previousDelaysRaw)) {
			previousDelaysRaw = [previousDelaysRaw];
		}
		const previousDelays: Status[] = previousDelaysRaw.flatMap((delay) => Status.fromRaw(delay)).filter((delay) => delay !== undefined) as Status[];

		const newDelays = delays.filter((delay) => !previousDelays.find((previousDelay) => previousDelay.comparisonHash === delay.comparisonHash));

		const removedDelays = previousDelays.filter((previousDelay) => !delays.find((delay) => delay.comparisonHash === previousDelay.comparisonHash));

		const updatedDelays = delays.filter((delay) => {
			const previousDelay = previousDelays.find((previousDelay) => previousDelay.comparisonHash === delay.comparisonHash);
			if (previousDelay) {
				const previousText = previousDelay.toPost();
				const newText = delay.toPost();

				if (previousText !== newText) {
					return true;
				}
			}
		});

		console.log("\n\nAll delays:");
		console.log(delays.map((delay) => delay.toPost()).filter(Boolean));

		console.log("New delays:");
		console.log(newDelays.map((delay) => delay.toPost()).filter(Boolean));

		console.log("Removed delays:");
		console.log(removedDelays.map((delay) => delay.toPost()).filter(Boolean));

		console.log("Updated delays:");
		console.log(updatedDelays.map((delay) => {
			const previousDelay = previousDelays.find((previousDelay) => previousDelay.comparisonHash === delay.comparisonHash);

			if (!previousDelay) {
				return undefined;
			}

			const newDelayText = delay.toPost();
			const previousText = previousDelay.toPost();

			if (!newDelayText || !newDelayText) {
				return undefined;
			}

			return {
				"previous": previousText,
				"new": newDelayText
			};
		}).filter(Boolean));

		const poster = new Poster(config);
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
			const post = delay.toPost();
			if (post) {
				if (process.env.NODE_ENV === "production") {
					const postResponse = await poster.post(post, xmlResult, [ContentTypeEnum.ALL_FAA]);
					console.log(`Posted: '${post}'`);

					const comparisonHash = delay.comparisonHash;
					await fs.promises.mkdir(path.join(__dirname, "..", "cache", "posts", comparisonHash), { "recursive": true });
					console.log("Post response: \n", postResponse);
					// @TODO: `postResponse` is currently a circular reference. So we can't `JSON.stringify` it.
					// await fs.promises.writeFile(path.join(__dirname, "..", "cache", "posts", comparisonHash, "postResponse.json"), JSON.stringify(postResponse));
				} else {
					console.warn(`Not posting: '${post}' due to NODE_ENV not being production.`);
				}
			}
		}
		for (const delay of removedDelays) {
			const comparisonHash = delay.comparisonHash;
			await fs.promises.rm(path.join(__dirname, "..", "cache", "posts", comparisonHash), { "recursive": true, "force": true });
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
