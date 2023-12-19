import { minutesToDurationString } from "./minutesToDurationString";

const tests = [
	[1, "1 minute"],
	[5, "5 minutes"],
	[15, "15 minutes"],
	[59, "59 minutes"],
	[100, "1 hour and 40 minutes"],
	[0, "0 minutes"],
	[60, "1 hour"],
	[61, "1 hour and 1 minute"],
	[65, "1 hour and 5 minutes"],
	[300, "5 hours"],
	[301, "5 hours and 1 minute"],
	[330, "5 hours and 30 minutes"],
];

test.each(tests)("minutesToDurationString(%p) === %p", (input, expected) => {
	expect(minutesToDurationString(input as number)).toStrictEqual(expected);
});
