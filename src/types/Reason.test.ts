import { Reason } from "./Reason";

describe("parts()", () => {
	const tests = [
		["WX:Fog", ["WX", "Fog"]],
		["WX:Low Ceilings", ["WX", "Low Ceilings"]],
		["low ceilings", ["WX", "Low Ceilings"]],
		["WX:Thunderstorms", ["WX", "Thunderstorms"]],
		["WX:Wind", ["WX", "Wind"]],
		["wind", ["WX", "Wind"]],
		["RWY:Noise Abatement", ["RWY", "Noise Abatement"]],
		["RWY:Maintenance", ["RWY", "Maintenance"]],
		["RWY:Construction", ["RWY", "Construction"]],
		["TM Initiatives:MIT:VOL", ["TM Initiatives", "MIT", "VOL"]],
		["TM Initiatives:MINIT:VOL", ["TM Initiatives", "MINIT", "VOL"]],
		["TM Initiatives:DSP:VOL", ["TM Initiatives", "DSP", "VOL"]],
		["TM Initiatives:MIT:WX", ["TM Initiatives", "MIT", "WX"]],
		["VOL:Compacted Demand", ["VOL", "Compacted Demand"]],
		["VOL:Multi-taxi", ["VOL", "Multi-taxi"]],
		["VOL:Volume", ["VOL", "Volume"]],
		["airport volume", ["VOL", "Volume"]],
		["ZDC/VOL:Volume", ["VOL", "Volume"]],
		["STAFF:ZNY STAFFING", ["STAFF", "ZNY STAFFING"]],
		["EQ:RWY08R LGTG OTS", ["EQ", "RWY08R LGTG OTS"]]
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
		["low ceilings", "WX"],
		["WX:Thunderstorms", "WX"],
		["WX:Wind", "WX"],
		["wind", "WX"],
		["RWY:Noise Abatement", "RWY"],
		["RWY:Maintenance", "RWY"],
		["RWY:Construction", "RWY"],
		["TM Initiatives:MIT:VOL", "TM Initiatives"],
		["TM Initiatives:MINIT:VOL", "TM Initiatives"],
		["TM Initiatives:DSP:VOL", "TM Initiatives"],
		["TM Initiatives:MIT:WX", "TM Initiatives"],
		["VOL:Compacted Demand", "VOL"],
		["VOL:Multi-taxi", "VOL"],
		["VOL:Volume", "VOL"],
		["airport volume", "VOL"],
		["ZDC/VOL:Volume", "VOL"],
		["STAFF:ZNY STAFFING", "STAFF"],
		["EQ:RWY08R LGTG OTS", "EQ"]
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
		["low ceilings", "low ceilings"],
		["WX:Thunderstorms", "thunderstorms"],
		["WX:Wind", "wind"],
		["wind", "wind"],
		["RWY:Noise Abatement", "noise reduction measures"],
		["RWY:Maintenance", "runway maintenance"],
		["RWY:Construction", "runway construction"],
		["TM Initiatives:MIT:VOL", "traffic management initiatives"],
		["TM Initiatives:MINIT:VOL", "traffic management initiatives"],
		["TM Initiatives:DSP:VOL", "traffic management initiatives"],
		["TM Initiatives:MIT:WX", "weather"],
		["VOL:Compacted Demand", "traffic management initiatives"],
		["VOL:Multi-taxi", "traffic management initiatives"],
		["VOL:Volume", "high traffic volume"],
		["airport volume", "high traffic volume"],
		["ZDC/VOL:Volume", "high traffic volume"],
		["STAFF:ZNY STAFFING", "staffing constraints"],
		// I THINK this means "Equipment: Runway 08R Lighting Out of Service"
		// The FAA Glossary (https://www.fly.faa.gov/Products/Glossary_of_Terms/glossary_of_terms.html) confirms that "OTS" means "Out of Service"
		// It says "EQUIP" is "Equipment", not "EQ"... (so not sure if `EQ` means something different)
		// But for now, we'll go with this until we figure out something different.
		["EQ:RWY08R LGTG OTS", "equipment failure"]
	];

	test.each(tests)("parts(%p) === %p", (input, expected) => {
		const reason = new Reason(input as string);
		expect(reason.toString()).toStrictEqual(expected);
	});
});
