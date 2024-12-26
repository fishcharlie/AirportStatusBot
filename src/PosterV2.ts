import "websocket-polyfill";

import { S3 } from "@aws-sdk/client-s3";
import { BskyAgent, RichText, AppBskyFeedPost, BlobRef } from "@atproto/api";
import * as nostrtools from "nostr-tools";
import { createRestAPIClient as Masto } from "masto";

import { resizeImage } from "./utils/resizeImage";
import { parseHashtags } from "./utils/parseHashtags";
import { defaultIncludeHashtags, SocialNetwork, SocialNetworkType } from "./types/Config";

import { createHash, randomUUID, UUID } from "crypto";
import Jimp from "jimp";
import * as blurhash from "blurhash";
import { GeneralObject } from "js-object-utilities";
import { getImageSize } from "./utils/getImageSize";

export interface PostContent {
	message: string;
	image?: {
		/**
		 * The alt text for the image. Used for accessibility.
		 */
		"alt"?: string;
		/**
		 * A buffer of the image to post. Should be in PNG format.
		 */
		"content": Buffer;
	};
}

const BLUESKY_MAX_IMAGE_SIZE_BYTES = 999997; // 976.56KiB is limit. Bluesky states: `but the maximum size is 976.56KB`, but they also convert our bytes to MiB instead of MB while they state it's MB.

type UUIDType = `${string}-${string}-${string}-${string}-${string}`;

export default class PosterV2 {
	#blueskyAgents: Map<UUIDType, BskyAgent> = new Map();

	async #getBlueskyAgent(socialNetwork: SocialNetwork & {"type": SocialNetworkType.bluesky}): Promise<BskyAgent> {
		const existingAgent = this.#blueskyAgents.get(socialNetwork.uuid);
		if (existingAgent) {
			console.log(`Using existing Bluesky agent (${socialNetwork.uuid})`);

			// I'm not completely sure if we need to check if the agent has a session and resume it. But I'm doing it just in case here.
			if (existingAgent.hasSession && existingAgent.session) {
				console.log(`Bluesky agent has session (${socialNetwork.uuid})`);
				await existingAgent.resumeSession(existingAgent.session);

				return existingAgent;
			} else {
				console.log(`Existing Bluesky agent does not have session (${socialNetwork.uuid})`);
			}
		}

		const {username, password, endpoint} = socialNetwork.credentials;
		const bluesky = new BskyAgent({
			"service": endpoint
		});
		if (!username || !password) {
			throw new Error(`Missing username or password for Bluesky (${socialNetwork.uuid})`);
		}
		console.log(`Logging in to Bluesky - ${username} (${socialNetwork.uuid})`);
		await bluesky.login({
			"identifier": username,
			"password": password
		});
		this.#blueskyAgents.set(socialNetwork.uuid, bluesky);
		return bluesky;
	}

	async post(socialNetwork: SocialNetwork, content: PostContent): Promise<{[key: string]: any} | undefined> {
		switch (socialNetwork.type) {
			case "mastodon": {
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
				const mastodonPost: {[key: string]: any} = {
					"status": content.message
				};
				if (imageId) {
					mastodonPost.media_ids = [imageId];
				}
				const mastodonResult = await masto.v1.statuses.create(mastodonPost as any);
				return mastodonResult;
			}
			case "bluesky": {
				const bluesky = await this.#getBlueskyAgent(socialNetwork);

				let resizeTimes = 0;
				let blueskyImage = content.image?.content;
				while (blueskyImage && blueskyImage.byteLength > BLUESKY_MAX_IMAGE_SIZE_BYTES) {
					console.log("Image is too large. Resizing. Current size:", blueskyImage.byteLength);
					if (resizeTimes > 4) {
						console.error("Image is too large and has been resized too many times. Skipping.");
						break;
					}

					blueskyImage = await resizeImage(blueskyImage, 90);
					resizeTimes += 1;
				}

				let image: BlobRef | undefined;
				try {
					if (blueskyImage) {
						image = (await bluesky.uploadBlob(blueskyImage, {
							"encoding": "image/png"
						})).data.blob;
					}
				} catch (e) {
					console.error("Error uploading Bluesky image", e);
				}

				const rt = new RichText({
					"text": content.message
				});
				await rt.detectFacets(bluesky);
				const postRecord: Partial<AppBskyFeedPost.Record> & Omit<AppBskyFeedPost.Record, "createdAt"> = {
					"text": rt.text,
					"facets": rt.facets
				};
				if (image && blueskyImage) {
					const imageSize = await getImageSize(blueskyImage);

					postRecord.embed = {
						"images": [
							{
								"image": image,
								"alt": content.image?.alt ?? "",
								"aspectRatio": imageSize
							}
						],
						"$type": "app.bsky.embed.images"
					};
				}
				const blueskyResult = await bluesky.post(postRecord);
				return {
					"root": blueskyResult,
					"parent": blueskyResult
				};
			}
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
					"Body": content.message,
					"Key": key
				});

				if (content.image) {
					await client.putObject({
						"Bucket": socialNetwork.credentials.bucket,
						"Body": content.image.content,
						"Key": `${ts}.png`,
						"ContentType": "image/png",
						"ContentLength": content.image.content.byteLength
					});
				}

				return {
					key
				};
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
					tags = parseHashtags(content.message).map((tag) => ["t", tag.toLowerCase()]);
				}

				let imageURL: string | undefined;
				if (content.image) {
					if (socialNetwork.imageHandler) {
						if (socialNetwork.imageHandler.type === SocialNetworkType.s3) {
							let imageKey: UUID | undefined;
							const client = new S3({
								"credentials": {
									"accessKeyId": socialNetwork.imageHandler.credentials.accessKeyId,
									"secretAccessKey": socialNetwork.imageHandler.credentials.secretAccessKey
								},
								"region": socialNetwork.imageHandler.credentials.region
							});

							imageKey = randomUUID();
							try {
								await client.putObject({
									"Bucket": socialNetwork.imageHandler.credentials.bucket,
									"Body": content.image.content,
									"Key": `${imageKey}.png`,
									"ContentType": "image/png",
									"ContentLength": content.image.content.byteLength
								});

								if (socialNetwork.imageHandler.postURLRemap) {
									imageURL = socialNetwork.imageHandler.postURLRemap.replace("{{key}}", `${imageKey}.png`);
								} else {
									imageURL = `https://${socialNetwork.imageHandler.credentials.bucket}.s3.${socialNetwork.imageHandler.credentials.region}.amazonaws.com/${imageKey}.png`;
								}

								const jimpImg = await Jimp.read(content.image.content);
								const width = jimpImg.getWidth();
								const height = jimpImg.getHeight();

								const jimpBlurhashImg = jimpImg.resize(width / 4, height / 4);
								const blurhashWidth = jimpBlurhashImg.getWidth();
								const blurhashHeight = jimpBlurhashImg.getHeight();
								const blurhashPixels: any[] = (() => {
									const pixels: any[] = [];
									// Extract RGB pixel data to Uint8ClampedArray
									const scanIterator = jimpBlurhashImg.scanIterator(0, 0, blurhashWidth, blurhashHeight)
									for (const { idx } of scanIterator) {
										pixels.push(jimpBlurhashImg.bitmap.data[idx + 0]);
										pixels.push(jimpBlurhashImg.bitmap.data[idx + 1]);
										pixels.push(jimpBlurhashImg.bitmap.data[idx + 2]);
										pixels.push(jimpBlurhashImg.bitmap.data[idx + 3]);
									}
									return pixels;
								})();

								// https://github.com/nostr-protocol/nips/blob/master/92.md
								tags.push([
									"imeta",
									`url ${imageURL}`,
									"m image/png",
									`x ${((): string => {
										const hash = createHash("sha256");
										hash.update(content.image.content);
										return hash.digest("hex");
									})()}`,
									`alt ${content.image.alt ?? ""}`,
									`size ${content.image.content.byteLength}`,
									`dim ${width}x${height}`,
									`blurhash ${blurhash.encode(new Uint8ClampedArray(blurhashPixels), blurhashWidth, blurhashHeight, 4, 3)}`,
								]);
							} catch (e) {
								console.error("Error uploading image to S3", e);
								imageURL = undefined;
							}
						} else {
							throw new Error("Invalid image handler type");
						}
					}
				}

				const event = nostrtools.finalizeEvent({
					"kind": 1,
					"created_at": Math.floor(Date.now() / 1000),
					"tags": tags,
					"content": imageURL ? `${content.message} ${imageURL}` : content.message
				}, privateKey.data);
				try {
					await Promise.all(pool.publish(socialNetwork.credentials.relays, event));
				} catch (e) {}
				return {
					event
				};
		}
	}

	async repost(socialNetwork: SocialNetwork, repost: GeneralObject<any>): Promise<{[key: string]: any} | undefined> {
		switch (socialNetwork.type) {
			case "mastodon": {
				const masto = Masto({
					"url": `${socialNetwork.credentials.endpoint}`,
					"accessToken": socialNetwork.credentials.password
				});
				const mastodonResult = await masto.v1.statuses.$select(repost.id).reblog();
				return mastodonResult;
			}
			case "bluesky": {
				const bluesky = await this.#getBlueskyAgent(socialNetwork);

				const blueskyResult = await bluesky.repost(repost.root.uri, repost.root.cid);
				return {
					"root": blueskyResult,
					"parent": blueskyResult
				};
			}
			case "nostr": {
				const pool = new nostrtools.SimplePool();
				const privateKey = nostrtools.nip19.decode(socialNetwork.credentials.privateKey);
				if (privateKey.type !== "nsec") {
					console.error(`Invalid private key type: ${privateKey.type}`);
					break;
				}
				let tags: string[][] = [
					// @TODO: put relay URL as the 3rd element of the "e" tag array
					["e", repost.id],
					["p", repost.pubkey]
				];

				const event = nostrtools.finalizeEvent({
					"kind": 6,
					"created_at": Math.floor(Date.now() / 1000),
					"tags": tags,
					"content": JSON.stringify(repost)
				}, privateKey.data);
				try {
					await Promise.all(pool.publish(socialNetwork.credentials.relays, event));
				} catch (e) {}
				return {
					event
				};
			}
		}
	}

	async reply(socialNetwork: SocialNetwork, replyTo: GeneralObject<any>, content: PostContent): Promise<{ [key: string]: any } | undefined> {
		switch (socialNetwork.type) {
			case SocialNetworkType.mastodon:
				const masto = Masto({
					"url": `${socialNetwork.credentials.endpoint}`,
					"accessToken": socialNetwork.credentials.password
				});
				const mastodonResult = await masto.v1.statuses.create({
					"status": content.message,
					"inReplyToId": replyTo.id
				});
				return mastodonResult;
			case SocialNetworkType.bluesky:
				const bluesky = await this.#getBlueskyAgent(socialNetwork);

				const rt = new RichText({
					"text": content.message
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
				return {
					"root": replyTo.root,
					"parent": blueskyResult
				};
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
					"Body": `${existingContentString}\n\n\n\n\n\n<><><><><>\n\n\n\n\n\n` + content.message,
					"Key": key
				});
				return {
					key
				};
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
					tags = [...tags, ...parseHashtags(content.message).map((tag) => ["t", tag.toLowerCase()])];
				}
				const event = nostrtools.finalizeEvent({
					"kind": 1,
					"created_at": Math.floor(Date.now() / 1000),
					"tags": tags,
					"content": content.message
				}, privateKey.data);
				try {
					await Promise.all(pool.publish(socialNetwork.credentials.relays, event));
				} catch (e) {}
				return event;
		}
	}

}
