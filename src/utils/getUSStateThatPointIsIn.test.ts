import { NaturalEarthDataManager } from "../NaturalEarthDataManager";
import getUSStateThatPointIsIn from "./getUSStateThatPointIsIn";
import * as turf from "@turf/turf";

const tests = [
	[turf.point([-122, 37]), "California"],
	[turf.point([-74, 41]), "New Jersey"],
	[turf.point([-96, 37]), "Kansas"],
	[turf.point([-105, 40]), "Colorado"],
	[turf.point([-86, 40]), "Indiana"],
	[turf.point([-87, 34]), "Alabama"],
	[turf.point([-84, 39]), "Ohio"],
	[turf.point([-98, 30]), "Texas"],
	[turf.point([-112, 33]), "Arizona"],
	[turf.point([-93, 45]), "Minnesota"],
	[turf.point([-71, 42]), "Massachusetts"],
	[turf.point([-77, 38.9]), "District of Columbia"],
];

test.each(tests)("getUSStateThatPointIsIn(%p) === %p", async (input, expected) => {
	const result = await getUSStateThatPointIsIn(input as any, new NaturalEarthDataManager("Test"));
	expect(result?.properties?.name).toStrictEqual(expected);
});
