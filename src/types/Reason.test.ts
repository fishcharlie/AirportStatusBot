import { Reason } from "./Reason";

describe("parts()", () => {
	const tests = [
		["WX:Fog", ["WX", "Fog"]],
		["WX:Low Ceilings", ["WX", "Low Ceilings"]],
		["WX:Thunderstorms", ["WX", "Thunderstorms"]],
		["RWY:Noise Abatement", ["RWY", "Noise Abatement"]],
		["RWY:Maintenance", ["RWY", "Maintenance"]],
		["RWY:Construction", ["RWY", "Construction"]],
		["TM Initiatives:MIT:VOL", ["TM Initiatives", "MIT", "VOL"]],
		["TM Initiatives:DSP:VOL", ["TM Initiatives", "DSP", "VOL"]],
		["TM Initiatives:MIT:WX", ["TM Initiatives", "MIT", "WX"]],
		["VOL:Compacted Demand", ["VOL", "Compacted Demand"]],
		["VOL:Multi-taxi", ["VOL", "Multi-taxi"]],
		["VOL:Volume", ["VOL", "Volume"]],
		["STAFF:ZNY STAFFING", ["STAFF", "ZNY STAFFING"]]
	];

	test.each(tests)("parts(%p) === %p", (input, expected) => {
		const reason = new Reason(input as string);
		expect(reason.parts()).toStrictEqual(expected);
	});
});

describe("parentType()", () => {
	const tests = [
		["WX:Fog", "WX"],
		["WX:Low Ceilings", "WX"],
		["WX:Thunderstorms", "WX"],
		["RWY:Noise Abatement", "RWY"],
		["RWY:Maintenance", "RWY"],
		["RWY:Construction", "RWY"],
		["TM Initiatives:MIT:VOL", "TM Initiatives"],
		["TM Initiatives:DSP:VOL", "TM Initiatives"],
		["TM Initiatives:MIT:WX", "TM Initiatives"],
		["VOL:Compacted Demand", "VOL"],
		["VOL:Multi-taxi", "VOL"],
		["VOL:Volume", "VOL"],
		["STAFF:ZNY STAFFING", "STAFF"]
	];

	test.each(tests)("parts(%p) === %p", (input, expected) => {
		const reason = new Reason(input as string);
		expect(reason.parentType()).toStrictEqual(expected);
	});
});

describe("toString()", () => {
	const tests = [
		["WX:Fog", "fog"],
		["WX:Low Ceilings", "low ceilings"],
		["WX:Thunderstorms", "thunderstorms"],
		["RWY:Noise Abatement", "noise reduction measures"],
		["RWY:Maintenance", "runway maintenance"],
		["RWY:Construction", "runway construction"],
		["TM Initiatives:MIT:VOL", "traffic management initiatives"],
		["TM Initiatives:DSP:VOL", "traffic management initiatives"],
		["TM Initiatives:MIT:WX", "weather"],
		["VOL:Compacted Demand", "traffic management initiatives"],
		["VOL:Multi-taxi", "traffic management initiatives"],
		["VOL:Volume", "high traffic volume"],
		["STAFF:ZNY STAFFING", "staffing constraints"]
	];

	test.each(tests)("parts(%p) === %p", (input, expected) => {
		const reason = new Reason(input as string);
		expect(reason.toString()).toStrictEqual(expected);
	});
});
