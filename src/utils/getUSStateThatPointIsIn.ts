import { NaturalEarthDataManager } from "../NaturalEarthDataManager";
import * as turf from "@turf/turf";

export default async function (point: GeoJSON.Feature<GeoJSON.Point, GeoJSON.GeoJsonProperties>, naturalEarthDataManager: NaturalEarthDataManager): Promise<GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties> | undefined> {
	const statesGeoJSON = await naturalEarthDataManager.geoJSON("ne_110m_admin_1_states_provinces");
	if (!statesGeoJSON) {
		return undefined;
	}

	// Find the state that the center point is in
	const state = statesGeoJSON.features.find((feature) => {
		if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
			return turf.booleanPointInPolygon(point, feature.geometry);
		}
	});
	return state;
}
