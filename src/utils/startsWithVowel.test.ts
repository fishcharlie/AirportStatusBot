import { startsWithVowel } from "./startsWithVowel";

const tests = [
	["apple", true],
	["Apple", true],
	["APPLE", true],
	[" apple", true],
	["banana", false],
	["Banana", false],
	["elephant", true],
	["important", true],
	["orange", true],
	["umbrella", true],
	["", false],
	[" ", false]
];

test.each(tests)("startsWithVowel(%p) === %p", (input, expected) => {
	expect(startsWithVowel(input as string)).toStrictEqual(expected);
});
