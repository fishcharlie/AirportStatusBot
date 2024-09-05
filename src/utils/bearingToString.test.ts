import bearingToString from "./bearingToString";

const tests = [
	[-320, "northeast"],
	[-315, "northeast"],
	[-275, "east"],
	[-270, "east"],
	[-230, "southeast"],
	[-225, "southeast"],
	[-185, "south"],
	[-180, "south"],
	[-140, "southwest"],
	[-135, "southwest"],
	[-95, "west"],
	[-90, "west"],
	[-50, "northwest"],
	[-45, "northwest"],
	[-5, "north"],
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

test.each(tests)("bearingToString(%p, false) === %p", (input, expected) => {
	expect(bearingToString(input as number, false)).toStrictEqual(expected);
});


const testsSimple = [
	[0, "north"],
	[5, "north"],
	[45, "east"],
	[50, "east"],
	[90, "east"],
	[95, "east"],
	[130, "east"],
	[140, "south"],
	[180, "south"],
	[185, "south"],
	[225, "west"],
	[230, "west"],
	[270, "west"],
	[275, "west"],
	[315, "north"],
	[320, "north"]
];

test.each(testsSimple)("bearingToString(%p, true) === %p", (input, expected) => {
	expect(bearingToString(input as number, true)).toStrictEqual(expected);
});
