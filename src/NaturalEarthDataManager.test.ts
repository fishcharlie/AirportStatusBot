import * as path from "path";
import { NaturalEarthDataManager } from "./NaturalEarthDataManager";

const fs = require("fs") as typeof import("fs");
const statesGeoJSONPath = path.join("naturalearth", "ne_110m_admin_1_states_provinces.geojson");

function countStateGeoJSONReads(readSpy: jest.SpyInstance): number {
	return readSpy.mock.calls.filter((call) => String(call[0]).endsWith(statesGeoJSONPath)).length;
}

test("geoJSON() reuses parsed Natural Earth data", async () => {
	const manager = new NaturalEarthDataManager("Test");
	const readSpy = jest.spyOn(fs, "readFileSync");

	try {
		const first = await manager.geoJSON("ne_110m_admin_1_states_provinces");
		const second = await manager.geoJSON("ne_110m_admin_1_states_provinces");

		expect(second).toBe(first);
		expect(countStateGeoJSONReads(readSpy)).toBe(1);
	} finally {
		readSpy.mockRestore();
	}
});

test("clearGeoJSONCache() drops parsed Natural Earth data", async () => {
	const manager = new NaturalEarthDataManager("Test");
	const readSpy = jest.spyOn(fs, "readFileSync");

	try {
		const first = await manager.geoJSON("ne_110m_admin_1_states_provinces");
		manager.clearGeoJSONCache();
		const second = await manager.geoJSON("ne_110m_admin_1_states_provinces");

		expect(second).not.toBe(first);
		expect(countStateGeoJSONReads(readSpy)).toBe(2);
	} finally {
		readSpy.mockRestore();
	}
});
