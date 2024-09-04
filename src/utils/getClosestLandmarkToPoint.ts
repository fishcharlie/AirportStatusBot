import * as turf from "@turf/turf";
import bearingToString from "./bearingToString";

export default function (point: GeoJSON.Feature<GeoJSON.Point, GeoJSON.GeoJsonProperties>, landmarks: GeoJSON.FeatureCollection<GeoJSON.Point, GeoJSON.GeoJsonProperties>): {
	"item": GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>,
	"direction": "north" | "northeast" | "northwest" | "east" | "west" | "south" | "southeast" | "southwest" | undefined,
	"bearing": number
} | undefined {
	const closestLandmark: [string, GeoJSON.Feature<GeoJSON.Point>] | undefined = Object.entries(landmarks.features).reduce((closest: [string, GeoJSON.Feature<GeoJSON.Point>] | undefined, currentEntry: [string, GeoJSON.Feature<GeoJSON.Point>]) => {
		if (!closest) {
			return currentEntry;
		}

		const [landmarkName, landmark] = currentEntry;
		const currentEntryDistance: number = turf.distance(point, landmark);
		const closestDistance: number = turf.distance(point, closest[1]);
		if (currentEntryDistance < closestDistance) {
			return [landmarkName, landmark];
		} else {
			return closest;
		}
	}, undefined);
	if (!closestLandmark) {
		return undefined;
	}

	const directionFromLandmark = turf.bearing(closestLandmark[1], point);
	const directionFromLandmarkString: "north" | "northeast" | "northwest" | "east" | "west" | "south" | "southeast" | "southwest" | undefined = bearingToString(directionFromLandmark);

	return {
		"item": closestLandmark[1],
		"direction": directionFromLandmarkString,
		"bearing": directionFromLandmark
	};
}
