import { Listener, Poster } from "./Poster";
import { ContentTypeEnum, SocialNetworkType } from "./types/Config";

jest.mock("masto", () => ({
	"createRestAPIClient": jest.fn(),
	"createStreamingAPIClient": jest.fn(() => ({
		"direct": {
			"subscribe": jest.fn(() => ({
				"values": jest.fn(() => ({
					[Symbol.asyncIterator]: jest.fn(() => ({
						"next": jest.fn().mockResolvedValue({ "done": true, "value": undefined })
					}))
				}))
			}))
		}
	}))
}));

describe("formatMessage", () => {
	const tests = [
		[
			{
				"message": "A departure delay has been issued for Test Airport A (#AAA) due to weather. Current delays are 16-30 minutes and increasing.",
				"includeHashtags": true
			},
			"A departure delay has been issued for Test #Airport A (#AAA) due to #weather. Current delays are 16-30 minutes and increasing. #AirportStatusBot"
		],
		[
			{
				"message": "A departure delay has been issued for Test Airport A (#AAA) due to weather. Current delays are 16-30 minutes and increasing.",
				"includeHashtags": false
			},
			"A departure delay has been issued for Test Airport A (AAA) due to weather. Current delays are 16-30 minutes and increasing."
		],
		[
			{
				"message": "A departure delay has been issued for Test Airport A (#AAA) due to thunderstorms. Current delays are 16-30 minutes and increasing.",
				"includeHashtags": true
			},
			"A departure delay has been issued for Test #Airport A (#AAA) due to #thunderstorms. Current delays are 16-30 minutes and increasing. #AirportStatusBot"
		],
		[
			{
				"message": "A departure delay has been issued for Test Airport A (#AAA) due to thunderstorms. Current delays are 16-30 minutes and increasing.",
				"includeHashtags": false
			},
			"A departure delay has been issued for Test Airport A (AAA) due to thunderstorms. Current delays are 16-30 minutes and increasing."
		]
	];

	test.each(tests)("formatMessage(%p) === %p", (input: any, expected) => {
		const poster = new Poster({"socialNetworks": [], "refreshInterval": 1});
		expect(poster.formatMessage((input as any).message, {
			"settings": {
				"includeHashtags": (input as any).includeHashtags
			},
			"contentType": ContentTypeEnum.ALL_FAA,
			"type": SocialNetworkType.mastodon,
			"uuid": "00000000-0000-0000-0000-000000000000",
			"name": "Test Account",
			"credentials": {
				"endpoint": "https://example.com",
				"password": "password",
			},
			"listen": false
		})).toStrictEqual(expected);
	});
});

describe("Listener.listen", () => {
	const { createStreamingAPIClient } = require("masto");

	beforeEach(() => {
		jest.clearAllMocks();
	});

	test("listen() with listen: false does not set up streaming", async () => {
		const listener = new Listener({
			"socialNetworks": [
				{
					"uuid": "00000000-0000-0000-0000-000000000000",
					"name": "Test Mastodon",
					"type": SocialNetworkType.mastodon,
					"credentials": {
						"endpoint": "https://example.com",
						"password": "password",
					},
					"contentType": ContentTypeEnum.ALL_FAA,
					"listen": false
				}
			],
			"refreshInterval": 1
		}, jest.fn());

		await listener.listen();
		expect(createStreamingAPIClient).not.toHaveBeenCalled();
	});

	test("listen() with s3 network type resolves without calling mastodon streaming", async () => {
		const listener = new Listener({
			"socialNetworks": [
				{
					"uuid": "00000000-0000-0000-0000-000000000001",
					"name": "Test S3",
					"type": SocialNetworkType.s3,
					"credentials": {
						"region": "us-east-1",
						"accessKeyId": "key",
						"secretAccessKey": "secret",
						"bucket": "bucket"
					},
					"contentType": ContentTypeEnum.ALL_FAA,
					"listen": true
				}
			],
			"refreshInterval": 1
		}, jest.fn());

		await listener.listen();
		expect(createStreamingAPIClient).not.toHaveBeenCalled();
	});

	test("listen() with bluesky network type resolves without calling mastodon streaming", async () => {
		const listener = new Listener({
			"socialNetworks": [
				{
					"uuid": "00000000-0000-0000-0000-000000000002",
					"name": "Test Bluesky",
					"type": SocialNetworkType.bluesky,
					"credentials": {
						"endpoint": "https://bsky.social",
						"username": "user",
						"password": "password"
					},
					"contentType": ContentTypeEnum.ALL_FAA,
					"listen": true
				}
			],
			"refreshInterval": 1
		}, jest.fn());

		await listener.listen();
		expect(createStreamingAPIClient).not.toHaveBeenCalled();
	});

	test("listen() with mastodon network type calls createStreamingAPIClient exactly once", async () => {
		const listener = new Listener({
			"socialNetworks": [
				{
					"uuid": "00000000-0000-0000-0000-000000000000",
					"name": "Test Mastodon",
					"type": SocialNetworkType.mastodon,
					"credentials": {
						"endpoint": "https://example.com",
						"password": "password",
					},
					"contentType": ContentTypeEnum.ALL_FAA,
					"listen": true
				}
			],
			"refreshInterval": 1
		}, jest.fn());

		await listener.listen();
		expect(createStreamingAPIClient).toHaveBeenCalledTimes(1);
	});

	test("listen() with mastodon and s3 networks calls createStreamingAPIClient exactly once (only for mastodon)", async () => {
		const listener = new Listener({
			"socialNetworks": [
				{
					"uuid": "00000000-0000-0000-0000-000000000000",
					"name": "Test Mastodon",
					"type": SocialNetworkType.mastodon,
					"credentials": {
						"endpoint": "https://example.com",
						"password": "password",
					},
					"contentType": ContentTypeEnum.ALL_FAA,
					"listen": true
				},
				{
					"uuid": "00000000-0000-0000-0000-000000000001",
					"name": "Test S3",
					"type": SocialNetworkType.s3,
					"credentials": {
						"region": "us-east-1",
						"accessKeyId": "key",
						"secretAccessKey": "secret",
						"bucket": "bucket"
					},
					"contentType": ContentTypeEnum.ALL_FAA,
					"listen": true
				}
			],
			"refreshInterval": 1
		}, jest.fn());

		await listener.listen();
		expect(createStreamingAPIClient).toHaveBeenCalledTimes(1);
	});
});
