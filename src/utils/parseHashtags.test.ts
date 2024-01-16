import { parseHashtags } from "./parseHashtags";

const tests = [
	["#AAA", ["AAA"]],
	["#AAA.", ["AAA"]],
	["#AAA #BBB", ["AAA", "BBB"]],
	["(#AAA)", ["AAA"]],
];

test.each(tests)("parseHashtags(%p) === %p", (input, expected) => {
	expect(parseHashtags(input as string)).toStrictEqual(expected);
});
