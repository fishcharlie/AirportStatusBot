import formatNumber from "./formatNumber";

const tests = [
	[0, "0"],
	[100, "100"],
	[1000, "1,000"],
	[1000000, "1,000,000"],
	[1000000000, "1,000,000,000"],
];

test.each(tests)("formatNumber(%p) === %p", (input, expected) => {
	expect(formatNumber(input as number)).toStrictEqual(expected);
});
