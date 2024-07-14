import { Poster } from "./Poster";
import { ContentTypeEnum, SocialNetworkType } from "./types/Config";

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
