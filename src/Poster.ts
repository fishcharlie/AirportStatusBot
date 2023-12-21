import { Config, ContentTypeEnum, SocialNetwork, defaultIncludeHashtags } from "./types/Config";
import { S3 } from "@aws-sdk/client-s3";
import TuskMastodon from "tusk-mastodon";
import { BskyAgent, RichText } from "@atproto/api";

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

			const socialMessage = this.#formatMessage(message, socialNetwork);

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
						returnObject[socialNetwork.uuid] = blueskyResult;
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

	#formatMessage(message: string, config: SocialNetwork): string {
		let returnMessage = `${message}`;
		const includeHashtags: boolean = config.settings?.includeHashtags ?? defaultIncludeHashtags(config.type);

		if (includeHashtags) {
			returnMessage += " #AirportStatusBot";
		} else {
			returnMessage = returnMessage.replaceAll(/#(\w+)/gmu, "$1");
		}

		return returnMessage;
	}
}
