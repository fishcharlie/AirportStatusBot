import { parseDurationString } from "./parseDurationString";

const tests = [
	["1 minute", 1],
	["5 minutes", 5],
	["15 minutes", 15],
	["59 minutes", 59],
	["100 minutes", 100],
	["0 minutes", 0],
	["1 hour", 60],
	["1 hour and 1 minute", 61],
	["1 hour and 5 minutes", 65],
	["5 hours", 300],
	["5 hours and 1 minute", 301],
	["5 hours and 30 minutes", 330],
];

test.each(tests)("parseDurationString(%p) === %p", (input, expected) => {
	expect(parseDurationString(input as string)).toStrictEqual(expected);
});
