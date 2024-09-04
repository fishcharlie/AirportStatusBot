import getClosestLandmarkToPoint from "./getClosestLandmarkToPoint";
import * as turf from "@turf/turf";

const landmarks = turf.featureCollection([
	turf.feature(turf.geometry("Point", [-122, 37]), { "name": "Golden Gate Bridge" }),
]);

const tests = [
	[[turf.point([-121, 38]), landmarks], {
		"item": landmarks.features[0],
		"bearing": 38.12350859046693,
		"direction": "northeast"
	}],
];

test.each(tests)("getClosestLandmarkToPoint(%p) === %p", (input, expected) => {
	expect(getClosestLandmarkToPoint((input as any)[0], (input as any)[1])).toStrictEqual(expected);
});
