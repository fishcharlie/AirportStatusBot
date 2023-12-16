import { Config, ContentTypeEnum } from "./types/Config";
import TuskMastodon from "tusk-mastodon";
import { S3 } from "@aws-sdk/client-s3";

export class Poster {
	#config: Config;

	constructor(config: Config) {
		this.#config = config;
	}

	async post(message: string, rawXML: string, contentTypes: ContentTypeEnum[]) {
		await Promise.all(this.#config.socialNetworks.map(async (socialNetwork) => {
			if (!contentTypes.includes(socialNetwork.contentType)) {
				console.log(`Skipping ${socialNetwork.name} for post ('${message}') because it doesn't support ${contentTypes.join(", ")}.`);
				return;
			}

			try {
				switch (socialNetwork.type) {
					case "mastodon":
						const mastodon = new TuskMastodon({
							"api_url": socialNetwork.credentials.endpoint,
							"access_token": socialNetwork.credentials.password,
						});
						await mastodon.post("statuses", {
							"status": message
						});
						break;
					case "s3":
						const client = new S3({
							"credentials": {
								"accessKeyId": socialNetwork.credentials.accessKeyId,
								"secretAccessKey": socialNetwork.credentials.secretAccessKey
							},
							"region": "us-west-2"
						});
						await client.putObject({
							"Bucket": socialNetwork.credentials.bucket,
							"Body": `${message}${socialNetwork.settings?.includeRAWXML ? `\n\n---\n\n${rawXML}` : ""}`,
							"Key": `${Date.now()}.txt`
						});
					default:
						throw new Error(`Unknown social network (${socialNetwork.name}): ${socialNetwork.type}`);
				}
			} catch (e) {
				console.error(e);
			}
		}));
	}
}
