import "websocket-polyfill";
import { Config, ContentTypeEnum, SocialNetwork, SocialNetworkType, defaultIncludeHashtags } from "./types/Config";
import { S3 } from "@aws-sdk/client-s3";
import TuskMastodon from "tusk-mastodon";
import { BskyAgent, RichText, AppBskyFeedPost } from "@atproto/api";
import { GeneralObject } from "js-object-utilities";
import * as nostrtools from "nostr-tools";
import { parseHashtags } from "./utils/parseHashtags";

const hashtagWords = [
	"weather",
	"airport",
	"thunderstorms",
];

interface PostContent {
	message: string;
	image?: Buffer;
}

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
	async post(content: PostContent, rawXML: string, contentTypes: ContentTypeEnum[]): Promise<{ [key: string]: any }> {
		let returnObject: { [key: string]: any } = {};

		await Promise.all(this.#config.socialNetworks.map(async (socialNetwork) => {
			if (!contentTypes.includes(socialNetwork.contentType)) {
				console.log(`Skipping ${socialNetwork.name} for post ('${content.message}') because it doesn't support ${contentTypes.join(", ")}.`);
				return;
			}

			const socialMessage = this.formatMessage(content.message, socialNetwork);

			try {
				switch (socialNetwork.type) {
					case "mastodon":
						const mastodon = new TuskMastodon({
							"api_url": `${socialNetwork.credentials.endpoint}/api/v1/`,
							"access_token": socialNetwork.credentials.password,
							"timeout_ms": 60 * 1000,
						});
						let imageId: string | undefined;
						try {
							if (content.image) {
								imageId = (await mastodon.post("media", {
									"file": content.image
								})).data.id;
							}
						} catch (e) {
							console.error(e);
						}
						const mastodonPost: {[key: string]: any} = {
							"status": socialMessage
						};
						if (imageId) {
							mastodonPost.media_ids = [imageId];
						}
						const mastodonResult = await mastodon.post("statuses", mastodonPost);
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
						const ts = Date.now();
						const key = `${ts}.txt`;
						await client.putObject({
							"Bucket": socialNetwork.credentials.bucket,
							"Body": `${socialMessage}${socialNetwork.settings?.includeRAWXML ? `\n\n---\n\n${rawXML}` : ""}`,
							"Key": key
						});
						returnObject[socialNetwork.uuid] = {
							key
						};

						if (content.image) {
							await client.putObject({
								"Bucket": socialNetwork.credentials.bucket,
								"Body": content.image,
								"Key": `${ts}.png`
							});
						}
						break;
					case "nostr":
						const pool = new nostrtools.SimplePool();
						const privateKey = nostrtools.nip19.decode(socialNetwork.credentials.privateKey);
						if (privateKey.type !== "nsec") {
							console.error(`Invalid private key type: ${privateKey.type}`);
							break;
						}
						let tags: string[][] = [];
						const includeHashtags: boolean = socialNetwork.settings?.includeHashtags ?? defaultIncludeHashtags(socialNetwork.type);
						if (includeHashtags) {
							tags = parseHashtags(socialMessage).map((tag) => ["t", tag.toLowerCase()]);
						}
						const event = nostrtools.finalizeEvent({
							"kind": 1,
							"created_at": Math.floor(Date.now() / 1000),
							"tags": tags,
							"content": socialMessage
						}, privateKey.data);
						try {
							await Promise.all(pool.publish(socialNetwork.credentials.relays, event));
						} catch (e) {}
						returnObject[socialNetwork.uuid] = {
							event
						};
						break;
				}
			} catch (e) {
				console.error(e);
			}
		}));

		return returnObject;
	}

	async reply(socialNetworkUUID: string, replyTo: GeneralObject<any>, content: PostContent, rawXML: string): Promise<{ [key: string]: any }> {
		let returnObject: { [key: string]: any } = {};

		const socialNetwork = this.#config.socialNetworks.find((socialNetwork) => socialNetwork.uuid === socialNetworkUUID);

		if (!socialNetwork) {
			throw `Unknown social network UUID: ${socialNetworkUUID}`;
		}

		const socialMessage = this.formatMessage(content.message, socialNetwork);

		try {
			switch (socialNetwork.type) {
				case SocialNetworkType.mastodon:
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
				case SocialNetworkType.bluesky:
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
					const postRecord: Partial<AppBskyFeedPost.Record> & Omit<AppBskyFeedPost.Record, "createdAt"> = {
						"text": rt.text,
						"facets": rt.facets,
						"reply": {
							"root": {
								"uri": replyTo.root.uri,
								"cid": replyTo.root.cid
							},
							"parent": {
								"uri": replyTo.parent.uri,
								"cid": replyTo.parent.cid
							}
						}
					};
					const blueskyResult = await bluesky.post(postRecord);
					returnObject = {
						"root": replyTo.root,
						"parent": blueskyResult
					};
					break;
				case SocialNetworkType.s3:
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
				case SocialNetworkType.nostr:
					const pool = new nostrtools.SimplePool();
					const privateKey = nostrtools.nip19.decode(socialNetwork.credentials.privateKey);
					if (privateKey.type !== "nsec") {
						console.error(`Invalid private key type: ${privateKey.type}`);
						break;
					}
					const existingPostTags = replyTo.event.tags.filter((tag: string[]) => tag[0] === "e");
					let tags: string[][] = [
						...existingPostTags,
						["e", replyTo.event.id, "wss://nostrrelay.win", existingPostTags.length === 0 ? "root" : "reply"]
					];
					const includeHashtags: boolean = socialNetwork.settings?.includeHashtags ?? defaultIncludeHashtags(socialNetwork.type);
					if (includeHashtags) {
						tags = [...tags, ...parseHashtags(socialMessage).map((tag) => ["t", tag.toLowerCase()])];
					}
					const event = nostrtools.finalizeEvent({
						"kind": 1,
						"created_at": Math.floor(Date.now() / 1000),
						"tags": tags,
						"content": socialMessage
					}, privateKey.data);
					try {
						await Promise.all(pool.publish(socialNetwork.credentials.relays, event));
					} catch (e) {}
					returnObject[socialNetwork.uuid] = {
						event
					};
					break;
			}
		} catch (e) {
			console.error(e);
		}

		return returnObject;
	}

	async updateProfile(): Promise<void> {
		await Promise.all(this.#config.socialNetworks.map(async (socialNetwork) => {
			switch (socialNetwork.type) {
				case SocialNetworkType.mastodon:
					break;
				case SocialNetworkType.s3:
					break;
				case SocialNetworkType.bluesky:
					break;
				case SocialNetworkType.nostr:
					if (!socialNetwork.profile) {
						break;
					}

					const pool = new nostrtools.SimplePool();

					const privateKey = nostrtools.nip19.decode(socialNetwork.credentials.privateKey);
					if (privateKey.type !== "nsec") {
						console.error(`Invalid private key type: ${privateKey.type}`);
						break;
					}

					const publicKey = nostrtools.nip19.decode(socialNetwork.credentials.publicKey);
					if (publicKey.type !== "npub") {
						console.error(`Invalid private key type: ${publicKey.type}`);
						break;
					}

					const metadataEvent = nostrtools.finalizeEvent({
						"kind": 0,
						"created_at": Math.floor(Date.now() / 1000),
						"content": JSON.stringify(socialNetwork.profile),
						"tags": []
					}, privateKey.data);
					const relayListMetadataEvent = nostrtools.finalizeEvent({
						"kind": 10002,
						"created_at": Math.floor(Date.now() / 1000),
						"content": "",
						"tags": socialNetwork.credentials.relays.map((relay) => ["r", relay]),
					}, privateKey.data);
					try {
						await Promise.all(pool.publish(socialNetwork.credentials.relays, metadataEvent));
					} catch (e) {
						console.error("Error posting nostr profile metadata", e);
					}
					try {
						await Promise.all(pool.publish(socialNetwork.credentials.relays, relayListMetadataEvent));
					} catch (e) {
						console.error("Error posting nostr profile relays", e);
					}

					break;
			}
		}));
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
