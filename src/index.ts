import * as fs from "fs";
import * as path from "path";
import { XMLParser } from "fast-xml-parser";
import { Status, TypeEnum } from "./types/Status";
import { Listener, Poster } from "./Poster";
import { Config, ContentTypeEnum } from "./types/Config";
import * as objectUtils from "js-object-utilities";
import * as rimraf from "rimraf";
import { OurAirportsDataManager } from "./OurAirportsDataManager";
import { NaturalEarthDataManager } from "./NaturalEarthDataManager";
import { ImageGenerator } from "./ImageGenerator";
import express from "express";
import { minutesToDurationString } from "./utils/minutesToDurationString";
import { S3 } from "@aws-sdk/client-s3";

const packageJSON = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
let config: Config;
try {
	config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"));
} catch (e) {
	console.error("There was an error parsing the config file. Using default config. ", e);
	config = {"socialNetworks": [], "refreshInterval": 60};
}

let lastSuccessfulRun = Date.now();

if (config.webServer) {
	const app = express();
	app.get("/", (_req, res) => {
		res.status(302).redirect(packageJSON.homepage);
	});
	app.get("/api/service/status", (_req, res) => {
		res.send({
			lastSuccessfulRun
		});
	});

	app.get("/assets/images/logo.png", (_req, res, next) => {
		if (fs.existsSync(path.join(__dirname, "..", "Logo.png"))) {
			res.sendFile(path.join(__dirname, "..", "Logo.png"));
		} else {
			next();
		}
	});

	if (config.webServer.s3ImageCredentials) {
		const s3ImageCredentials = config.webServer.s3ImageCredentials;
		const client = new S3({
			"credentials": {
				"accessKeyId": s3ImageCredentials.accessKeyId,
				"secretAccessKey": s3ImageCredentials.secretAccessKey
			},
			"region": s3ImageCredentials.region
		});
		app.get("/assets/images/:key", async (req, res, next) => {
			const key = req.params.key;
			const bucket = s3ImageCredentials.bucket;
			const params = {
				"Bucket": bucket,
				"Key": key
			};
			try {
				const data = await client.getObject(params);
				if (data.Body) {
					if (data.ContentType) {
						res.setHeader("Content-Type", data.ContentType);
					}
					if (data.ContentLength) {
						res.setHeader("Content-Length", data.ContentLength);
					}

					res.send(Buffer.from(await data.Body.transformToByteArray()));
				} else {
					console.warn(`No body for S3 object: ${key}`, data);
					next();
				}
			} catch (e) {
				console.error("Failed to get image from S3: ", e);
				next();
			}
		});
	}

	app.use((req, _res, next) => {
		console.log(`404: ${req.url}`);
		next();
	});

	app.listen(config.webServer.port, () => {
		console.log(`Web server listening on port ${config.webServer?.port}`);
	});
}

const ENDPOINT = "https://nasstatus.faa.gov/api/airport-status-information";
const USER_AGENT = `AirportStatusBot/${packageJSON.version} (+${packageJSON.homepage})`;

const ourAirportsDataManager = new OurAirportsDataManager(USER_AGENT);
const naturalEarthDataManager = new NaturalEarthDataManager(USER_AGENT);

const poster = new Poster(config);

let currentDelays: Status[] | null = null;

async function run (firstRun: boolean) {
	console.log(`Start run: ${Date.now()}`);

	try {
		await ourAirportsDataManager.updateCache();
	} catch (e) {
		console.error("Failed to update OurAirports cache.");
		console.error(e);
	}
	try {
		await naturalEarthDataManager.updateCache();
	} catch (e) {
		console.error("Failed to update Natural Earth cache.");
		console.error(e);
	}

	let xmlResult: string;
	try {
		xmlResult = await (await fetch(ENDPOINT, {
			"method": "GET",
			"headers": {
				"User-Agent": USER_AGENT
			}
		})).text();
		console.log("Got XML", xmlResult);
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
		const delays: Status[] = delaysRaw.flatMap((delay) => Status.fromRaw(delay, ourAirportsDataManager, naturalEarthDataManager)).filter((delay) => delay !== undefined).filter((delay, index, array) => {
			return array.findIndex((d) => d?.comparisonHash === delay?.comparisonHash) === index;
		}).filter((v) => v?.isValid) as Status[];
		currentDelays = delays;

		let previousDelaysRaw: { [key: string]: any }[] = previous?.AIRPORT_STATUS_INFORMATION.Delay_type ?? [];
		if (typeof previousDelaysRaw === "object" && !Array.isArray(previousDelaysRaw)) {
			previousDelaysRaw = [previousDelaysRaw];
		}
		const previousDelays: Status[] = previousDelaysRaw.flatMap((delay) => Status.fromRaw(delay, ourAirportsDataManager, naturalEarthDataManager)).filter((delay) => delay !== undefined).filter((delay, index, array) => {
			return array.findIndex((d) => d?.comparisonHash === delay?.comparisonHash) === index;
		}).filter((v) => v?.isValid) as Status[];

		const newDelays = delays.filter((delay) => !previousDelays.find((previousDelay) => previousDelay.comparisonHash === delay.comparisonHash));

		const removedDelays = previousDelays.filter((previousDelay) => !delays.find((delay) => delay.comparisonHash === previousDelay.comparisonHash));

		const updatedDelaysObjects: {"previous": Status; "new": Status;}[] = (await Promise.all(delays.map(async (delay) => {
			const previousDelay = previousDelays.find((previousDelay) => previousDelay.comparisonHash === delay.comparisonHash);
			if (previousDelay) {
				const previousText: string | undefined = await previousDelay.toPost();
				const newText: string | undefined = await delay.toPost();

				if (previousText !== newText) {
					return {
						"previous": previousDelay,
						"new": delay
					};
				}
			}
			return undefined;
		}))).filter((v) => v !== undefined) as {"previous": Status; "new": Status;}[];
		const updatedDelays: Status[] = updatedDelaysObjects.map((v) => v.new);

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
			const updateText: string | undefined = await Status.updatedPost(previousDelay, delay);

			if (!newDelayText || !newDelayText) {
				return undefined;
			}

			let returnObject: objectUtils.GeneralObject<string | undefined> = {
				"previous": previousText,
				"new": newDelayText
			};

			if (updateText) {
				returnObject = {
					...returnObject,
					"update": updateText
				};
			}

			return returnObject;
		}))).filter(Boolean));
		console.timeEnd("Run Parse");

		console.log(`Posting ${removedDelays.length} removed delays.`);
		for (const delay of removedDelays) {
			const post = await delay.toEndedPost();
			const comparisonHash = delay.comparisonHash;
			if (post) {
				if (process.env.NODE_ENV === "production") {
					if (delay.isBeta === true) {
						// Delay is in beta
						// Only direct message it to me so I can see it and make any fixes if needed.
						const mastodonAccount = config.socialNetworks.find((socialNetwork) => socialNetwork.type === "mastodon");
						if (mastodonAccount) {
							poster.directMessage(mastodonAccount.uuid, "@fishcharlie@mstdn-social.com", undefined, {
								"message": post
							});
						}
						continue;
					} else if (fs.existsSync(path.join(__dirname, "..", "cache", "posts", comparisonHash, "postResponse.json"))) {
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

								// Crosspost to airport specific accounts
								try {
									await Promise.all(Object.entries(postResponse).map(async ([key, value]) => {
										const socialNetworkAlreadyPostedTo = config.socialNetworks.find((socialNetwork) => socialNetwork.uuid === key);

										if (!socialNetworkAlreadyPostedTo) {
											return;
										}

										const socialNetworksToCrosspostTo = config.socialNetworks.filter((socialNetwork) => socialNetwork.type === socialNetworkAlreadyPostedTo.type && socialNetwork.uuid !== key && socialNetwork.contentType === `FAA_${delay.airportCode}`);
										console.log(`Crossposting to: ${socialNetworksToCrosspostTo.map((socialNetwork) => socialNetwork.uuid).join(", ")}`);

										return Promise.all(socialNetworksToCrosspostTo.map(async (socialNetwork) => {
											await poster.repost(value, socialNetwork.uuid);
											console.log(`Crossposted to ${socialNetwork.uuid}.`);
										}));
									}));
									console.log("Done crossposting.");
								} catch (e) {
									console.error(e);
								}
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
		console.log(`Posting ${newDelays.length} new delays.`);
		for (const delay of newDelays) {
			const post = await delay.toPost();
			let image;
			try {
				image = await new ImageGenerator(delay, naturalEarthDataManager).generate();
			} catch (e) {
				console.error("Failed to generate image:");
				console.error(e);
			}
			if (post) {
				if (process.env.NODE_ENV === "production") {
					if (delay.isBeta === true) {
						// Delay is in beta
						// Only direct message it to me so I can see it and make any fixes if needed.
						const mastodonAccount = config.socialNetworks.find((socialNetwork) => socialNetwork.type === "mastodon");
						if (mastodonAccount) {
							poster.directMessage(mastodonAccount.uuid, "@fishcharlie@mstdn-social.com", undefined, {
								"message": post,
								"image": image
							});
						}
						continue;
					} else {
						// Delay not in beta
						// Continue posting as normal
						const postResponse = await poster.post({
							"message": post,
							"image": image
						}, xmlResult, [ContentTypeEnum.ALL_FAA]);
						console.log(`Posted: '${post}'`);

						// Crosspost to airport specific accounts
						try {
							await Promise.all(Object.entries(postResponse).map(async ([key, value]) => {
								const socialNetworkAlreadyPostedTo = config.socialNetworks.find((socialNetwork) => socialNetwork.uuid === key);

								if (!socialNetworkAlreadyPostedTo) {
									return;
								}

								const socialNetworksToCrosspostTo = config.socialNetworks.filter((socialNetwork) => socialNetwork.type === socialNetworkAlreadyPostedTo.type && socialNetwork.uuid !== key && socialNetwork.contentType === `FAA_${delay.airportCode}`);
								console.log(`Crossposting to: ${socialNetworksToCrosspostTo.map((socialNetwork) => socialNetwork.uuid).join(", ")}`);

								return Promise.all(socialNetworksToCrosspostTo.map(async (socialNetwork) => {
									await poster.repost(value, socialNetwork.uuid);
									console.log(`Crossposted to ${socialNetwork.uuid}.`);
								}));
							}));
							console.log("Done crossposting.");
						} catch (e) {
							console.error(e);
						}

						const comparisonHash = delay.comparisonHash;
						await fs.promises.mkdir(path.join(__dirname, "..", "cache", "posts", comparisonHash), { "recursive": true });
						console.log("Post response: \n", postResponse);

						const newPostResponse = {...postResponse};
						objectUtils.circularKeys(newPostResponse).forEach((key) => {
							objectUtils.set(newPostResponse, key, "[Circular]");
						});
						await fs.promises.writeFile(path.join(__dirname, "..", "cache", "posts", comparisonHash, "postResponse.json"), JSON.stringify(newPostResponse));
					}
				} else {
					console.warn(`Not posting: '${post}' due to NODE_ENV not being production.`);
				}
			}
		}
		console.log(`Posting ${updatedDelays.length} updated delays.`);
		for (const delay of updatedDelaysObjects) {
			const post = await Status.updatedPost(delay.previous, delay.new);
			const comparisonHash = delay.previous.comparisonHash;
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
								newPostResponse[socialNetworkUUID] = postResponse[socialNetworkUUID];
								console.log(`[${socialNetworkUUID}] Replied: '${post}'`);
							} else {
								newPostResponse[socialNetworkUUID] = oldPostResponse[socialNetworkUUID];
								console.warn(`[${socialNetworkUUID}] Failed to reply: '${post}'.`);
							}
						}
						console.log(`Post response: \n`, newPostResponse);

						// Crosspost to airport specific accounts
						try {
							await Promise.all(Object.entries(newPostResponse).map(async ([key, value]) => {
								const socialNetworkAlreadyPostedTo = config.socialNetworks.find((socialNetwork) => socialNetwork.uuid === key);

								if (!socialNetworkAlreadyPostedTo) {
									return;
								}

								const socialNetworksToCrosspostTo = config.socialNetworks.filter((socialNetwork) => socialNetwork.type === socialNetworkAlreadyPostedTo.type && socialNetwork.uuid !== key && socialNetwork.contentType === `FAA_${delay.new.airportCode}`);
								console.log(`Crossposting to: ${socialNetworksToCrosspostTo.map((socialNetwork) => socialNetwork.uuid).join(", ")}`);

								return Promise.all(socialNetworksToCrosspostTo.map(async (socialNetwork) => {
									await poster.repost(value, socialNetwork.uuid);
									console.log(`Crossposted to ${socialNetwork.uuid}.`);
								}));
							}));
							console.log("Done crossposting.");
						} catch (e) {
							console.error(e);
						}

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
		}
		console.log("Done posting social messages.");
	}

	await fs.promises.writeFile(previousPath, xmlResult);

	lastSuccessfulRun = Date.now();
	console.log(`Done running: ${lastSuccessfulRun}`);
}

let runCounter = 0;
(async () => {
	let firstRun = true;
	while (true) {
		if (firstRun) {
			console.log("First run.");
			// const mastodonAccount = config.socialNetworks.find((socialNetwork) => socialNetwork.type === "mastodon");
			// if (mastodonAccount) {
			// 	poster.directMessage(mastodonAccount.uuid, "@fishcharlie@mstdn-social.com", undefined, {
			// 		"message": "The @AirportStatusBot@mastodon.social has started."
			// 	});
			// }

			// const nostrAccount = config.socialNetworks.find((socialNetwork) => socialNetwork.type === "nostr");
			// if (nostrAccount) {
			// 	poster.directMessage(nostrAccount.uuid, "d77637850017cffa7a61c7032db0f28be947d5487f9d504aabe4449a91b53cff", undefined, {
			// 		"message": "The AirportStatusBot has started."
			// 	});
			// }
		}
		// If it's the first run or every 15 runs, update the profiles
		if (firstRun || runCounter % 15 === 0) {
			try {
				poster.updateProfile();
			} catch (e) {}
		}
		await run(firstRun);
		await new Promise((resolve) => setTimeout(resolve, config.refreshInterval * 1000));
		firstRun = false;
		runCounter += 1;
	}
})();


interface ReplyOption {
	inputs: string[];
	reply: string | {
		"type": "random"
		"messages": string[]
	} | ((platform: string) => Promise<string>) | ((platform: string) => string);
}
const getAuthorUsername = (platform: string): string => {
	if (platform === "mastodon") {
		return "@fishcharlie@mstdn-social.com";
	} else if (platform === "nostr") {
		return "npub16amr0pgqzl8l57npcupjmv8j3055042g07w4qj4tu3zf4yd48nlsh96569";
	} else {
		return "https://charlie.fish/contact";
	}
}
const replyOptions: ReplyOption[] = [
	{
		"inputs": ["list", "delays"],
		"reply": async (): Promise<string> => {
			let runs = 0;
			while (currentDelays === null && runs < 30) {
				runs += 1;
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			if (currentDelays === null) {
				console.error("Still can't get current delays...");
				return "I'm sorry, there is a temporary glitch retrieving the current list of delays. Please try again later.";
			}

			return (await Promise.all(currentDelays.filter((delay) => delay.type.type !== TypeEnum.CLOSURE).map(async (delay) => {
				return delay.toPost();
			}))).join("\n");
		}
	},
	{
		"inputs": ["is my flight delayed?", "is my flight on time?", "is my flight on schedule?", "will my flight be on time?", "will my flight be delayed?"],
		"reply": "Sadly I can't check on individual flights. While the information I provide can give you a general sense of delays you might expect, it's always best to check with your airline for flight specific information."
	},
	{
		"inputs": ["where do you get your data?", "data source"],
		"reply": "I get the majority of my data from the FAA's Airport Status API. Some airport name & location information comes from OurAirports. US State boundary data comes from Natural Earth. And finally, some of the map imagery comes from OpenStreetMap & Iowa Environmental Mesonet of Iowa State University."
	},
	{
		"inputs": ["how often do you check for delays?", "refresh rate", "update rate", "refresh frequency", "update frequency", "how often do you update?"],
		"reply": `I check for delays every ${minutesToDurationString(config.refreshInterval / 60)}.`
	},
	{
		"inputs": ["when do you include images in your posts?"],
		"reply": (platform) => `I include images in my posts when there is a delay that I think would benefit from a visual representation. For example, seeing a weather radar map for thunderstorms, rain, tornadoes, hurricanes, and more. If you believe a delay would benefit from an image, please let ${getAuthorUsername(platform)} know.`
	},
	{
		"inputs": ["what timezone do you use?", "what time zone do you use?"],
		"reply": "Unless otherwise specified, all times are in the local time for the given airport."
	},
	{
		"inputs": ["help", "commands", "what can i ask you?", "what can you do?"],
		"reply": (platform) => `You can ask me many things! Here are some examples:\n\`List all delays\` - This will list all current delays at airports in the United States.\n\`Where do you get your data?\` - This will tell you where the bot gets its data from.\n\`Who created you?\` - This will tell you who created the bot.\n\nThere are a few other things not listed here to increase the conversational nature of this bot. Along with a few hidden easter eggs.\nAdditionally, the bot is intended to be able to respond to a wide variety of the commands listed above. If you find a variation of a command that doesn't work, please let ${getAuthorUsername(platform)} know.`
	},
	{
		"inputs": ["contact", "human", "representative", "talk to a person", "support"],
		"reply": (platform) => `Please reach out to ${getAuthorUsername(platform)}. Since I'm a bot, I can't provide help directly, but he can help you with any questions, feedback, or suggestions you have.`
	},
	{
		"inputs": ["who made you?", "who created you?", "who built you?", "who is your creator?", "who is your developer?"],
		"reply": (platform) => `I was created by ${getAuthorUsername(platform)}.`
	},
	{
		"inputs": ["tell me a joke", "tell a joke"],
		"reply": {
			"type": "random",
			// Ok yes... I did use ChatGPT to come up with these... I'm not a comedian...
			"messages": [
				"Why did the airplane join the band?\n\nIt had the perfect pitch.",
				"How do pilots like their coffee?\n\nPlane.",
				"Why did the airplane break up with the airport?\n\nBecause it found another terminal.",
				"How does the ocean say hello to the airplane?\n\nIt waves. 🌊"
			]
		}
	},
	{
		"inputs": ["hello", "hi", "hey", "yo", "sup", "👋"],
		"reply": {
			"type": "random",
			"messages": ["Hello", "Hi", "Hey", "👋"]
		}
	},
	{
		"inputs": ["shall we play a game?"],
		"reply": `Love to. How about Global Thermonuclear War?\n\n- from the 1983 movie WarGames: https://en.wikipedia.org/wiki/WarGames`
	},
	{
		"inputs": ["test"],
		"reply": {
			"type": "random",
			"messages": ["Loud and clear.", "Read you five by five."]
		}
	},
	{
		"inputs": [],
		"reply": (platform) => `I'm sorry, I don't understand. If you think this is something I should know, please reach out to ${getAuthorUsername(platform)} to submit a feature request.`
	}
];
new Listener(config, async (post) => {
	if (!post.metadata?.socialNetworkUUID) {
		console.log("No socialNetworkUUID in post metadata.");
		return;
	}
	const socialNetwork = config.socialNetworks.find((socialNetwork) => socialNetwork.uuid === post.metadata?.socialNetworkUUID);
	if (!socialNetwork) {
		console.log(`No social network found for: "${post.metadata.socialNetworkUUID}"`);
		return;
	}

	const replyOption = replyOptions.find((replyOption) => {
		if (replyOption.inputs.length === 0) {
			return true;
		} else {
			return replyOption.inputs.some((input) => {
				return post.content.message.toLowerCase().includes(input);
			});
		}
	});
	if (!replyOption) {
		console.log(`No reply option found for: "${post.content.message}"`);
		return;
	}
	const reply: string = await (async (): Promise<string> => {
		if (typeof replyOption.reply === "string") {
			return replyOption.reply;
		} else if (typeof replyOption.reply === "function") {
			return replyOption.reply(socialNetwork.type);
		} else if (typeof replyOption.reply === "object") {
			if (replyOption.reply.type === "random") {
				return replyOption.reply.messages[Math.floor(Math.random() * replyOption.reply.messages.length)];
			}
		}

		return "";
	})();
	if (reply.length === 0) {
		console.log(`Empty reply for: "${post.content.message}"`);
		return;
	}
	// if (reply.length > 500) {
	// 	console.log(`Reply too long: ${reply}`);
	// 	return;
	// }
	console.log(`Replying to: "${post.content.message}" with: "${reply}"`);
	poster.directMessage(post.metadata.socialNetworkUUID, post.user, post, {
		"message": reply
	});
}).listen();

// On SIGINT, SIGTERM, etc. exit gracefully
process.on("SIGINT", exitHandler("SIGINT"));
process.on("SIGTERM", exitHandler("SIGTERM"));

function exitHandler(type: string) {
	return async (): Promise<void> => {
		console.log(`[${Date.now()}] Exiting gracefully (${type})...`);
		await ourAirportsDataManager.close();
		console.log("Done. Exiting.");
		process.exit(0);
	};
}
