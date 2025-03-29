import { handleExtraBlueskyFacets } from "./PosterV2";
import { BskyAgent, RichText } from "@atproto/api";

describe("handleExtraBlueskyFacets", () => {
	const tests = [
		{
			"input": "Testing",
			"output": undefined
		},
		{
			"input": "(#hashtag)",
			"output": [{
				"features": [{
					"$type": "app.bsky.richtext.facet#tag",
					"tag": "hashtag"
				}],
				"index": {
					"byteEnd": 9,
					"byteStart": 1
				}
			}]
		},
		{
			"input": "#Testing",
			"output": undefined
		},
		{
			"input": "(#hashtag)",
			"output": undefined,
			"inputFacets": [{
				"features": [{
					"$type": "app.bsky.richtext.facet#tag",
					"tag": "hashtag"
				}],
				"index": {
					"byteEnd": 9,
					"byteStart": 1
				}
			}]
		},
		{
			"input": "(#hashtag) testing",
			"output": [{
				"features": [{
					"$type": "app.bsky.richtext.facet#tag",
					"tag": "hashtag"
				}],
				"index": {
					"byteEnd": 9,
					"byteStart": 1
				}
			}]
		},
		{
			"input": "A departure delay has been issued for Minneapolis–Saint Paul International #Airport / Wold–Chamberlain Field (#MSP) due to #thunderstorms. Current delays are 31-45 minutes and increasing. #AirportStatusBot",
			"output": [{
				"features": [{
					"$type": "app.bsky.richtext.facet#tag",
					"tag": "MSP"
				}],
				"index": {
					"byteEnd": 118,
					"byteStart": 114
				}
			}]
		}
	];

	test.each(tests)("handleExtraBlueskyFacets(%p) === %p", async (testObject) => {
		const bluesky = new BskyAgent({
			"service": "https://bsky.social"
		});

		const rt = new RichText({
			"text": testObject.input
		});
		await rt.detectFacets(bluesky);

		let inputFacets = rt.facets;
		if (testObject.inputFacets) {
			if (inputFacets) {
				inputFacets = inputFacets.concat(testObject.inputFacets);
			} else {
				inputFacets = testObject.inputFacets;
			}
		}

		expect(handleExtraBlueskyFacets(rt.text, inputFacets)).toStrictEqual(testObject.output);
	});
});
