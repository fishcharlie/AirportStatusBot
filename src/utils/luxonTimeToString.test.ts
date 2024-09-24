import * as luxon from "luxon";
import { luxonTimeToString } from "./luxonTimeToString";

const tests = [
	[luxon.DateTime.fromISO("2021-01-01T00:00:00.000Z").setZone("utc"), "midnight"],
	[luxon.DateTime.fromISO("2021-01-01T12:00:00.000Z").setZone("utc"), "noon"],
	[luxon.DateTime.fromISO("2021-01-01T06:00:00.000Z").setZone("utc"), "6:00 AM"],
	[luxon.DateTime.fromISO("2021-01-01T18:00:00.000Z").setZone("utc"), "6:00 PM"],
	[luxon.DateTime.fromISO("2021-01-01T07:30:00.000Z").setZone("utc"), "7:30 AM"],
	[luxon.DateTime.fromISO("2021-01-01T19:30:00.000Z").setZone("utc"), "7:30 PM"]
];

test.each(tests)("luxonTimeToString(%p) === %p", (input, expected) => {
	expect(luxonTimeToString(input as any)).toStrictEqual(expected);
});
