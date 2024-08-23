import { Reason } from "./Reason";

describe("parts()", () => {
	const tests = [
		["WX:Fog", ["WX", "Fog"]],
		["WX:Low Ceilings", ["WX", "Low Ceilings"]],
		["low ceilings", ["WX", "Low Ceilings"]],
		["WX:Thunderstorms", ["WX", "Thunderstorms"]],
		["WX: THUNDERSTORMS", ["WX", "THUNDERSTORMS"]],
		["thunderstorms", ["WX", "Thunderstorms"]],
		["WX:Wind", ["WX", "Wind"]],
		["wind", ["WX", "Wind"]],
		["WIND", ["WX", "Wind"]],
		["WX:Snow/Ice", ["WX", "Snow/Ice"]],
		["snow or ice", ["WX", "Snow/Ice"]],
		["SNOW/ICE", ["WX", "Snow/Ice"]],
		["snow or Ice mitigation or treatment", ["WX", "Snow/Ice"]],
		["WX:WINDSHEAR/MICROBURST", ["WX", "WINDSHEAR/MICROBURST"]],
		["RWY:Noise Abatement", ["RWY", "Noise Abatement"]],
		["RWY:Maintenance", ["RWY", "Maintenance"]],
		["RWY:Construction", ["RWY", "Construction"]],
		["runway construction", ["RWY", "Construction"]],
		["RWY:Rwy Change - Operational Necessity", ["RWY", "Rwy Change - Operational Necessity"]],
		["runway configuration change", ["RWY", "Rwy Change - Operational Necessity"]],
		["RWY:Disabled Aircraft", ["RWY", "Disabled Aircraft"]],
		["TM Initiatives:MIT:VOL", ["TM Initiatives", "MIT", "VOL"]],
		["TM Initiatives:MINIT:VOL", ["TM Initiatives", "MINIT", "VOL"]],
		["TM Initiatives:DSP:VOL", ["TM Initiatives", "DSP", "VOL"]],
		["TM Initiatives:MIT:WX", ["TM Initiatives", "MIT", "WX"]],
		["TM Initiatives:STOP:WX", ["TM Initiatives", "STOP", "WX"]],
		["VOL:Compacted Demand", ["VOL", "Compacted Demand"]],
		["VOL:Multi-taxi", ["VOL", "Multi-taxi"]],
		["VOL:Volume", ["VOL", "Volume"]],
		["VOLUME", ["VOL", "Volume"]],
		["airport volume", ["VOL", "Volume"]],
		["ZDC/VOL:Volume", ["VOL", "Volume"]],
		["STAFF:ZNY STAFFING", ["STAFF", "ZNY STAFFING"]],
		["EQ:RWY08R LGTG OTS", ["EQ", "RWY08R LGTG OTS"]],
		["equipment outage", ["EQ"]],
		["EQUIPMENT", ["EQ"]],
		["air show", ["OTHER", "Air Show"]],
		["airspace volume", ["VOL", "Volume"]],
		["disabled aircraft on the runway", ["RWY", "Disabled Aircraft"]],
		["runway maintenance", ["RWY", "Maintenance"]],
		["VIPM:VIP Movement", ["VIPM", "VIP Movement"]],
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
		["WX: THUNDERSTORMS", "WX"],
		["thunderstorms", "WX"],
		["WX:Wind", "WX"],
		["wind", "WX"],
		["WIND", "WX"],
		["WX:Snow/Ice", "WX"],
		["snow or ice", "WX"],
		["SNOW/ICE", "WX"],
		["snow or Ice mitigation or treatment", "WX"],
		["WX:WINDSHEAR/MICROBURST", "WX"],
		["RWY:Noise Abatement", "RWY"],
		["RWY:Maintenance", "RWY"],
		["RWY:Construction", "RWY"],
		["runway construction", "RWY"],
		["RWY:Rwy Change - Operational Necessity", "RWY"],
		["runway configuration change", "RWY"],
		["RWY:Disabled Aircraft", "RWY"],
		["TM Initiatives:MIT:VOL", "TM Initiatives"],
		["TM Initiatives:MINIT:VOL", "TM Initiatives"],
		["TM Initiatives:DSP:VOL", "TM Initiatives"],
		["TM Initiatives:MIT:WX", "TM Initiatives"],
		["TM Initiatives:STOP:WX", "TM Initiatives"],
		["VOL:Compacted Demand", "VOL"],
		["VOL:Multi-taxi", "VOL"],
		["VOL:Volume", "VOL"],
		["VOLUME", "VOL"],
		["airport volume", "VOL"],
		["ZDC/VOL:Volume", "VOL"],
		["STAFF:ZNY STAFFING", "STAFF"],
		["EQ:RWY08R LGTG OTS", "EQ"],
		["equipment outage", "EQ"],
		["EQUIPMENT", "EQ"],
		["air show", "OTHER"],
		["airspace volume", "VOL"],
		["disabled aircraft on the runway", "RWY"],
		["runway maintenance", "RWY"],
		["VIPM:VIP Movement", "VIPM"],
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
		["WX: THUNDERSTORMS", "thunderstorms"],
		["thunderstorms", "thunderstorms"],
		["WX:Wind", "wind"],
		["wind", "wind"],
		["WIND", "wind"],
		["WX:Snow/Ice", "snow/ice"],
		["snow or ice", "snow/ice"],
		["SNOW/ICE", "snow/ice"],
		["snow or Ice mitigation or treatment", "snow/ice"],
		["WX:WINDSHEAR/MICROBURST", "wind shear/microburst"],
		["RWY:Noise Abatement", "noise reduction measures"],
		["RWY:Maintenance", "runway maintenance"],
		["RWY:Construction", "runway construction"],
		["runway construction", "runway construction"],
		["RWY:Rwy Change - Operational Necessity", "runway change"],
		["runway configuration change", "runway change"],
		["RWY:Disabled Aircraft", "disabled aircraft"],
		["TM Initiatives:MIT:VOL", "traffic management initiatives"],
		["TM Initiatives:MINIT:VOL", "traffic management initiatives"],
		["TM Initiatives:DSP:VOL", "traffic management initiatives"],
		["TM Initiatives:MIT:WX", "weather"],
		["TM Initiatives:STOP:WX", "weather"],
		["VOL:Compacted Demand", "traffic management initiatives"],
		["VOL:Multi-taxi", "traffic management initiatives"],
		["VOL:Volume", "high traffic volume"],
		["VOLUME", "high traffic volume"],
		["airport volume", "high traffic volume"],
		["ZDC/VOL:Volume", "high traffic volume"],
		["STAFF:ZNY STAFFING", "staffing constraints"],
		// I THINK this means "Equipment: Runway 08R Lighting Out of Service"
		// The FAA Glossary (https://www.fly.faa.gov/Products/Glossary_of_Terms/glossary_of_terms.html) confirms that "OTS" means "Out of Service"
		// It says "EQUIP" is "Equipment", not "EQ"... (so not sure if `EQ` means something different)
		// But for now, we'll go with this until we figure out something different.
		["EQ:RWY08R LGTG OTS", "equipment failure"],
		["equipment outage", "equipment failure"],
		["EQUIPMENT", "equipment failure"],
		["air show", "air show"],
		["airspace volume", "high traffic volume"],
		["disabled aircraft on the runway", "disabled aircraft"],
		["runway maintenance", "runway maintenance"],
		["VIPM:VIP Movement", "VIP movement"],
	];

	test.each(tests)("parts(%p) === %p", (input, expected) => {
		const reason = new Reason(input as string);
		expect(reason.toString()).toStrictEqual(expected);
	});
});
