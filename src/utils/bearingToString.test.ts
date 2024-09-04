import bearingToString from "./bearingToString";

const tests = [
	[0, "north"],
	[5, "north"],
	[45, "northeast"],
	[50, "northeast"],
	[90, "east"],
	[95, "east"],
	[135, "southeast"],
	[140, "southeast"],
	[180, "south"],
	[185, "south"],
	[225, "southwest"],
	[230, "southwest"],
	[270, "west"],
	[275, "west"],
	[315, "northwest"],
	[320, "northwest"]
];

test.each(tests)("bearingToString(%p) === %p", (input, expected) => {
	expect(bearingToString(input as number)).toStrictEqual(expected);
});
