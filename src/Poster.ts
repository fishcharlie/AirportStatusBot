import "websocket-polyfill";

import { Config, ContentTypeEnum, SocialNetwork, SocialNetworkType, defaultIncludeHashtags } from "./types/Config";
import { S3 } from "@aws-sdk/client-s3";
import { BskyAgent, RichText, AppBskyFeedPost, BlobRef } from "@atproto/api";
import { GeneralObject } from "js-object-utilities";
import * as nostrtools from "nostr-tools";
import { parseHashtags } from "./utils/parseHashtags";
import { createRestAPIClient as Masto, createStreamingAPIClient as MastoStream } from "masto";
import * as htmlToText from "html-to-text";
import { resizeImage } from "./utils/resizeImage";
import * as fs from "fs";
import * as path from "path";
import { randomUUID, UUID, createHash } from "crypto";
import Jimp from "jimp";
import * as blurhash from "blurhash";
import PosterV2, { PostContent } from "./PosterV2";

const hashtagWords = [
	"weather",
	"airport",
	"thunderstorms",
];

interface Post {
	id: string;
	content: PostContent;
	/**
	 * Ex. `@fishcharlie@mstdn-social.com` for mastodon
	 */
	user: string;
	visibility: "public" | "direct";
	metadata?: GeneralObject<string>;
}

export class Poster {
	#config: Config;

	#posterV2: PosterV2 = new PosterV2();

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
	async post(content: PostContent, rawXML: string, contentTypes: string[]): Promise<{ [key: string]: any }> {
		let returnObject: { [key: string]: any } = {};

		await Promise.all(this.#config.socialNetworks.map(async (socialNetwork) => {
			if (!contentTypes.includes(socialNetwork.contentType)) {
				console.log(`Skipping ${socialNetwork.name} for post ('${content.message}') because it doesn't support ${contentTypes.join(", ")}.`);
				return;
			}

			let socialMessage = this.formatMessage(content.message, socialNetwork);

			if (socialNetwork.type === SocialNetworkType.s3) {
				socialMessage = `${socialMessage}${socialNetwork.settings?.includeRAWXML ? `\n\n---\n\n${rawXML}` : ""}`;
			}

			try {
				returnObject[socialNetwork.uuid] = await this.#posterV2.post(socialNetwork, {
					"message": socialMessage,
					"image": content.image
				});
			} catch (e) {
				console.error(e);
			}
		}));

		return returnObject;
	}

	async repost(post: GeneralObject<any>, socialNetworkUUID: string): Promise<{ [key: string]: any } | undefined> {
		const socialNetwork = this.#config.socialNetworks.find((socialNetwork) => socialNetwork.uuid === socialNetworkUUID);

		if (!socialNetwork) {
			throw `Unknown social network UUID: ${socialNetworkUUID}`;
		}

		console.log(`Reposting to ${socialNetwork.uuid}`, post);

		return this.#posterV2.repost(socialNetwork, post);
	}

	async reply(socialNetworkUUID: string, replyTo: GeneralObject<any>, content: PostContent, rawXML: string): Promise<{ [key: string]: any }> {
		let returnObject: { [key: string]: any } = {};

		const socialNetwork = this.#config.socialNetworks.find((v) => v.uuid === socialNetworkUUID);
		if (!socialNetwork) {
			throw `Unknown social network UUID: ${socialNetworkUUID}`;
		}

		let socialMessage = this.formatMessage(content.message, socialNetwork);

		if (socialNetwork.type === SocialNetworkType.s3) {
			socialMessage = `${socialMessage}${socialNetwork.settings?.includeRAWXML ? `\n\n---\n\n${rawXML}` : ""}`;
		}

		if (socialNetwork.type === SocialNetworkType.nostr) {
			if (!replyTo.id) {
				console.log("No id for Nostr reply", replyTo);
			}
		}

		try {
			returnObject[socialNetwork.uuid] = await this.#posterV2.reply(socialNetwork, replyTo, {
				"message": socialMessage,
				"image": content.image
			});
		} catch (e) {
			console.error(e);
		}

		return returnObject;
	}

	async directMessage(socialNetworkUUID: string, userToMessage: string, replyTo: GeneralObject<any> | undefined, content: PostContent): Promise<{ [key: string]: any }> {
		let returnObject: { [key: string]: any } = {};

		const socialNetwork = this.#config.socialNetworks.find((socialNetwork) => socialNetwork.uuid === socialNetworkUUID);

		if (!socialNetwork) {
			throw `Unknown social network UUID: ${socialNetworkUUID}`;
		}

		const socialMessage = this.formatMessage(content.message, socialNetwork, {
			"includeAirportStatusBotHashtagSignature": false
		});

		try {
			switch (socialNetwork.type) {
				case SocialNetworkType.mastodon:
					const masto = Masto({
						"url": `${socialNetwork.credentials.endpoint}`,
						"accessToken": socialNetwork.credentials.password
					});
					let imageId: string | undefined;
					try {
						if (content.image) {
							imageId = (await masto.v1.media.create({
								"file": new Blob([content.image.content]),
								"description": content.image.alt ?? ""
							})).id;
						}
					} catch (e) {
						console.error("Error uploading Mastodon image", e);
					}
					try {
						const mastodonPost: {[key: string]: any} = {
							"status": `${userToMessage} ${socialMessage}`,
							"inReplyToId": replyTo?.id,
							"visibility": "direct"
						};
						if (imageId) {
							mastodonPost.media_ids = [imageId];
						}
						const mastodonResult = await masto.v1.statuses.create(mastodonPost as any);
						returnObject = mastodonResult;
					} catch (e) {
						console.log("Error posting DM: ", JSON.stringify(e));
						throw e;
					}
					break;
				case SocialNetworkType.bluesky:
					break;
				case SocialNetworkType.s3:
					break;
				case SocialNetworkType.nostr:
					const pool = new nostrtools.SimplePool();
					const privateKey = nostrtools.nip19.decode(socialNetwork.credentials.privateKey);
					if (privateKey.type !== "nsec") {
						console.error(`Invalid private key type: ${privateKey.type}`);
						break;
					}
					const existingPostTags = (replyTo?.tags ?? []).filter((tag: string[]) => tag[0] === "e");
					let tags: string[][] = [
						...existingPostTags,
						["p", userToMessage]
					];
					if (replyTo?.id !== undefined) {
						tags.push(["e", replyTo.id, existingPostTags.length === 0 ? "root" : "reply"]);
					}
					const includeHashtags: boolean = socialNetwork.settings?.includeHashtags ?? defaultIncludeHashtags(socialNetwork.type);
					if (includeHashtags) {
						tags = [...tags, ...parseHashtags(socialMessage).map((tag) => ["t", tag.toLowerCase()])];
					}
					const event = nostrtools.finalizeEvent({
						"kind": 4,
						"created_at": Math.floor(Date.now() / 1000),
						"tags": tags,
						"content": await nostrtools.nip04.encrypt(privateKey.data, userToMessage, socialMessage)
					}, privateKey.data);
					try {
						await Promise.all(pool.publish(socialNetwork.credentials.relays, event));
					} catch (e) {}
					returnObject[socialNetwork.uuid] = {
						event
					};
					break;

					// NIP-17 (doesn't currently work)
					// const pool = new nostrtools.SimplePool();
					// const publicKey = nostrtools.nip19.decode(socialNetwork.credentials.publicKey);
					// if (publicKey.type !== "npub") {
					// 	console.error(`Invalid public key type: ${publicKey.type}`);
					// 	break;
					// }
					// const privateKey = nostrtools.nip19.decode(socialNetwork.credentials.privateKey);
					// if (privateKey.type !== "nsec") {
					// 	console.error(`Invalid private key type: ${privateKey.type}`);
					// 	break;
					// }
					// const existingPostTags = replyTo?.tags.filter((tag: string[]) => tag[0] === "e") ?? [];
					// let tags: string[][] = [
					// 	...existingPostTags,
					// 	["p", userToMessage]
					// ];
					// if (replyTo) {
					// 	tags.push(["e", replyTo.id, existingPostTags.length === 0 ? "root" : "reply"]);
					// }
					// const includeHashtags: boolean = socialNetwork.settings?.includeHashtags ?? defaultIncludeHashtags(socialNetwork.type);
					// if (includeHashtags) {
					// 	tags = [...tags, ...parseHashtags(socialMessage).map((tag) => ["t", tag.toLowerCase()])];
					// }
					// let event: GeneralObject<any> = {
					// 	"kind": 14,
					// 	"created_at": Math.floor(Date.now() / 1000),
					// 	"tags": tags,
					// 	"content": socialMessage,
					// 	"pubkey": publicKey.data
					// };
					// event.id = nostrtools.getEventHash(event as nostrtools.UnsignedEvent);

					// const seal = nostrtools.finalizeEvent({
					// 	"created_at": Math.floor(randomTimeUpTo2DaysInThePast() / 1000),
					// 	"kind": 13,
					// 	"tags": [],
					// 	"content": nostrtools.nip44.v2.encrypt(JSON.stringify(event), nostrtools.nip44.v2.utils.getConversationKey(privateKey.data as any, userToMessage))
					// }, privateKey.data);
					// const randomKey = nostrtools.generateSecretKey();
					// const giftWrap = nostrtools.finalizeEvent({
					// 	"created_at": Math.floor(randomTimeUpTo2DaysInThePast() / 1000),
					// 	"kind": 1059,
					// 	"tags": [
					// 		["p", userToMessage]
					// 	],
					// 	"content": nostrtools.nip44.v2.encrypt(JSON.stringify(seal), nostrtools.nip44.v2.utils.getConversationKey(randomKey as any, userToMessage))
					// }, randomKey);
					// try {
					// 	await Promise.all(pool.publish(socialNetwork.credentials.relays, giftWrap));
					// } catch (e) {}
					// returnObject[socialNetwork.uuid] = {
					// 	giftWrap
					// };
					// break;
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

	formatMessage(message: string, config: SocialNetwork, formatSettings: {
		"includeAirportStatusBotHashtagSignature"?: boolean;
	} = {}): string {
		let returnMessage = `${message}`;
		const includeHashtags: boolean = config.settings?.includeHashtags ?? defaultIncludeHashtags(config.type);

		if (includeHashtags) {
			if (formatSettings.includeAirportStatusBotHashtagSignature === true || formatSettings.includeAirportStatusBotHashtagSignature === undefined) {
				returnMessage += " #AirportStatusBot";
			}
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

export class Listener {
	#config: Config;
	#callback: (message: Post) => void;

	constructor(config: Config, callback: (message: Post) => void) {
		this.#config = config;
		this.#callback = callback;
	}

	async listen(): Promise<void> {
		await Promise.all(this.#config.socialNetworks.map(async (socialNetwork) => {
			if (socialNetwork.listen === false) {
				return;
			}

			switch (socialNetwork.type) {
				case SocialNetworkType.mastodon:
					const masto = MastoStream({
						"accessToken": socialNetwork.credentials.password,
						"streamingApiUrl": `${(socialNetwork.credentials.streamingEndpoint ?? socialNetwork.credentials.endpoint).replace("https://", "wss://")}/api/v1/streaming`
					});
					convertAsyncIterableToCallback(masto.direct.subscribe().values(), (err, item) => {
						if (item) {
							if (item.event === "conversation" && item.stream.join(" ") === "direct" && item.payload.lastStatus !== null && item.payload.lastStatus !== undefined && item.payload.lastStatus?.visibility === "direct") {
								const callbackObject: Post = {
									"id": item.payload.lastStatus?.id,
									"user": `@${item.payload.lastStatus?.account?.acct}`,
									"visibility": "direct",
									"content": {
										"message": htmlToText.convert(item.payload.lastStatus?.content)
									},
									"metadata": {
										"socialNetworkUUID": socialNetwork.uuid
									}
								};
								console.log(`Received direct message on Mastodon from ${callbackObject.user}: ${callbackObject.content.message}`);
								try {
									fs.appendFileSync(path.join(__dirname, "..", "cache", "receivedDirectMessages.txt"), `${JSON.stringify({
										"message": callbackObject.content.message,
										"timestamp": new Date().toISOString(),
										"user": callbackObject.user,
										"id": callbackObject.id,
										"socialNetworkType": socialNetwork.type,
										"socialNetworkUUID": socialNetwork.uuid
									})}\n`);
								} catch (e) {
									console.error("Error appending received direct message to file", e);
								}
								this.#callback(callbackObject);
							} else {
								console.log(`Invalid item. Event: ${item.event}. Stream: ${item.stream.join(" ")}. Payload: ${item.payload}.`)
							}
						} else if (err) {
							console.log("Received error for Mastodon listener", err);
						} else {
							console.log("No item or error in Mastodon listener.")
						}
					});
				case SocialNetworkType.s3:
					break;
				case SocialNetworkType.bluesky:
					break;
				case SocialNetworkType.nostr:
					const publicKey = nostrtools.nip19.decode(socialNetwork.credentials.publicKey);
					if (publicKey.type !== "npub") {
						console.error(`Invalid private key type: ${publicKey.type}`);
						break;
					}
					const privateKey = nostrtools.nip19.decode(socialNetwork.credentials.privateKey);
					if (privateKey.type !== "nsec") {
						console.error(`Invalid private key type: ${privateKey.type}`);
						break;
					}
					const pool = new nostrtools.SimplePool();
					pool.subscribeMany(socialNetwork.credentials.relays, [
						{
							"kinds": [4],
							"since": Math.floor(Date.now() / 1000), // Only get events that have been created since now
							"#p": [publicKey.data]
						}
					], {
						"onevent": async (evt) => {
							const callbackObject: Post = {
								"id": evt.id,
								"user": evt.pubkey,
								"visibility": "direct",
								"content": {
									"message": await nostrtools.nip04.decrypt(privateKey.data, evt.pubkey, evt.content)
								},
								"metadata": {
									"socialNetworkUUID": socialNetwork.uuid
								}
							};
							console.log(`Received direct message on Nostr from ${callbackObject.user}: ${callbackObject.content.message}`);
							try {
								fs.appendFileSync(path.join(__dirname, "..", "cache", "receivedDirectMessages.txt"), `${JSON.stringify({
									"message": callbackObject.content.message,
									"timestamp": new Date().toISOString(),
									"user": callbackObject.user,
									"id": callbackObject.id,
									"socialNetworkType": socialNetwork.type,
									"socialNetworkUUID": socialNetwork.uuid
								})}\n`);
							} catch (e) {
								console.error("Error appending received direct message to file", e);
							}
							this.#callback(callbackObject);
						},
						"onclose": (err) => {
							console.log("Nostr listener closed", err);
						}
					});
					break;
			}
		}));
	}
}

type Callback<T> = (err: Error | null, item: T | null) => void;
function convertAsyncIterableToCallback<T>(
	asyncIterable: AsyncIterable<T>,
	callback: Callback<T>
): void {
	(async () => {
		try {
			for await (const item of asyncIterable) {
				callback(null, item);
			}
			callback(null, null); // Signal end of iteration
		} catch (err) {
			callback(err instanceof Error ? err : new Error(String(err)), null);
		}
	})();
}

/**
 * Generate a random time up to 2 days in the past.
 * @returns A random time up to 2 days in the past returned in milliseconds.
 */
function randomTimeUpTo2DaysInThePast(): number {
	const twoDaysInMillis = 172800000; // 2 days * 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
	return Date.now() - Math.floor(Math.random() * twoDaysInMillis);
}
