import { Config, ContentTypeEnum, SocialNetwork, defaultIncludeHashtags } from "./types/Config";
import { S3 } from "@aws-sdk/client-s3";
import TuskMastodon from "tusk-mastodon";
import { BskyAgent, RichText, AppBskyFeedPost } from "@atproto/api";
import { GeneralObject } from "js-object-utilities";

const hashtagWords = [
	"weather",
	"airport",
	"thunderstorms",
];

export class Poster {
	#config: Config;

	constructor(config: Config) {
		this.#config = config;
	}

	/**
	 * Post a message to social networks.
	 * @param message The message to post
	 * @param rawXML The raw XML to include in S3 objects. This is useful for debugging issues and being able to reproduce using the raw FAA XML data.
	 * @param contentTypes The content types to post to. This will be used in the future to filter out airport specific accounts.
	 * @returns An object with the key as the UUID of the social network in the configuration and the value set to the result of the post response.
	 */
	async post(message: string, rawXML: string, contentTypes: ContentTypeEnum[]): Promise<{ [key: string]: any }> {
		let returnObject: { [key: string]: any } = {};

		await Promise.all(this.#config.socialNetworks.map(async (socialNetwork) => {
			if (!contentTypes.includes(socialNetwork.contentType)) {
				console.log(`Skipping ${socialNetwork.name} for post ('${message}') because it doesn't support ${contentTypes.join(", ")}.`);
				return;
			}

			const socialMessage = this.formatMessage(message, socialNetwork);

			try {
				switch (socialNetwork.type) {
					case "mastodon":
						const mastodon = new TuskMastodon({
							"api_url": `${socialNetwork.credentials.endpoint}/api/v1/`,
							"access_token": socialNetwork.credentials.password,
							"timeout_ms": 60 * 1000,
						});
						const mastodonResult = await mastodon.post("statuses", {
							"status": socialMessage
						});
						returnObject[socialNetwork.uuid] = mastodonResult;
						break;
					case "bluesky":
						const bluesky = new BskyAgent({
							"service": socialNetwork.credentials.endpoint
						});

						await bluesky.login({
							"identifier": socialNetwork.credentials.username ?? "",
							"password": socialNetwork.credentials.password ?? ""
						});

						const rt = new RichText({
							"text": socialMessage
						});
						await rt.detectFacets(bluesky);
						const postRecord = {
							"text": rt.text,
							"facets": rt.facets
						};
						const blueskyResult = await bluesky.post(postRecord);
						returnObject[socialNetwork.uuid] = {
							"root": blueskyResult,
							"parent": blueskyResult
						};
						break;
					case "s3":
						const client = new S3({
							"credentials": {
								"accessKeyId": socialNetwork.credentials.accessKeyId,
								"secretAccessKey": socialNetwork.credentials.secretAccessKey
							},
							"region": "us-west-2"
						});
						const key = `${Date.now()}.txt`;
						await client.putObject({
							"Bucket": socialNetwork.credentials.bucket,
							"Body": `${socialMessage}${socialNetwork.settings?.includeRAWXML ? `\n\n---\n\n${rawXML}` : ""}`,
							"Key": key
						});
						returnObject[socialNetwork.uuid] = {
							key
						};
						break;
					default:
						throw new Error(`Unknown social network (${socialNetwork.name}): ${socialNetwork.type}`);
				}
			} catch (e) {
				console.error(e);
			}
		}));

		return returnObject;
	}

	async reply(socialNetworkUUID: string, replyTo: GeneralObject<any>, message: string, rawXML: string): Promise<{ [key: string]: any }> {
		let returnObject: { [key: string]: any } = {};

		const socialNetwork = this.#config.socialNetworks.find((socialNetwork) => socialNetwork.uuid === socialNetworkUUID);

		if (!socialNetwork) {
			throw `Unknown social network UUID: ${socialNetworkUUID}`;
		}

		const socialMessage = this.formatMessage(message, socialNetwork);

		try {
			switch (socialNetwork.type) {
				case "mastodon":
					const mastodon = new TuskMastodon({
						"api_url": `${socialNetwork.credentials.endpoint}/api/v1/`,
						"access_token": socialNetwork.credentials.password,
						"timeout_ms": 60 * 1000,
					});
					const mastodonResult = await mastodon.post("statuses", {
						"status": socialMessage,
						"in_reply_to_id": replyTo.data.id,
					});
					returnObject = mastodonResult;
					break;
				case "bluesky":
					console.log("Not currently replying to Bluesky posts.");
					// const bluesky = new BskyAgent({
					// 	"service": socialNetwork.credentials.endpoint
					// });

					// await bluesky.login({
					// 	"identifier": socialNetwork.credentials.username ?? "",
					// 	"password": socialNetwork.credentials.password ?? ""
					// });

					// const rt = new RichText({
					// 	"text": socialMessage
					// });
					// await rt.detectFacets(bluesky);
					// const postRecord: Partial<AppBskyFeedPost.Record> & Omit<AppBskyFeedPost.Record, "createdAt"> = {
					// 	"text": rt.text,
					// 	"facets": rt.facets,
					// 	"reply": {
					// 		"root": {
					// 			"uri": replyTo.root.uri,
					// 			"cid": replyTo.root.cid
					// 		},
					// 		"parent": {
					// 			"uri": replyTo.parent.uri,
					// 			"cid": replyTo.parent.cid
					// 		}
					// 	}
					// };
					// const blueskyResult = await bluesky.post(postRecord);
					// returnObject = {
					// 	"root": replyTo.root,
					// 	"parent": blueskyResult
					// };
					break;
				case "s3":
					const client = new S3({
						"credentials": {
							"accessKeyId": socialNetwork.credentials.accessKeyId,
							"secretAccessKey": socialNetwork.credentials.secretAccessKey
						},
						"region": "us-west-2"
					});
					const key = replyTo.key;

					const existingContent = await client.getObject({
						"Bucket": socialNetwork.credentials.bucket,
						"Key": key
					});
					const existingContentString = await existingContent.Body?.transformToString();
					await client.putObject({
						"Bucket": socialNetwork.credentials.bucket,
						"Body": `${existingContentString}\n\n\n\n\n\n<><><><><>\n\n\n\n\n\n` + `${socialMessage}${socialNetwork.settings?.includeRAWXML ? `\n\n---\n\n${rawXML}` : ""}`,
						"Key": key
					});
					returnObject = {
						key
					};
					break;
				default:
					throw new Error(`Unknown social network (${socialNetwork.name}): ${socialNetwork.type}`);
			}
		} catch (e) {
			console.error(e);
		}

		return returnObject;
	}

	formatMessage(message: string, config: SocialNetwork): string {
		let returnMessage = `${message}`;
		const includeHashtags: boolean = config.settings?.includeHashtags ?? defaultIncludeHashtags(config.type);

		if (includeHashtags) {
			returnMessage += " #AirportStatusBot";
			returnMessage = returnMessage.split(" ").map((word) => {
				if (hashtagWords.includes(word.replaceAll(".", "").toLowerCase())) {
					return `#${word}`;
				} else {
					return word;
				}
			}).join(" ");
		} else {
			returnMessage = returnMessage.replaceAll(/#(\w+)/gmu, "$1");
		}

		return returnMessage;
	}
}
