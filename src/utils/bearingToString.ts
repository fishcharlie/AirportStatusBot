export default function bearingToString(bearing: number, simple: boolean): "north" | "northeast" | "northwest" | "east" | "west" | "south" | "southeast" | "southwest" | undefined {
	const totalDegrees = 360;
	const degreesPerDirection = totalDegrees / 8; // 45
	const halfDegreesPerDirection = degreesPerDirection / 2; // 22.5

	if (bearing < 0 || bearing >= totalDegrees) {
		bearing = ((bearing % totalDegrees) + totalDegrees) % totalDegrees;
	}

	// Only return "north" "south" "east" "west" if simple mode
	if (simple) {
		// North = 315 - 45
		// East = 45 - 135
		// South = 135 - 225
		// West = 225 - 315
		if (bearing >= 315 || bearing < 45) {
			return "north";
		} else if (bearing >= 45 && bearing < 135) {
			return "east";
		} else if (bearing >= 135 && bearing < 225) {
			return "south";
		} else if (bearing >= 225 && bearing < 315) {
			return "west";
		}
	} else {
		if (bearing >= totalDegrees - halfDegreesPerDirection || bearing < halfDegreesPerDirection) {
			return "north";
		} else if (bearing >= halfDegreesPerDirection && bearing < (90 - halfDegreesPerDirection)) {
			return "northeast";
		} else if (bearing >= (90 - halfDegreesPerDirection) && bearing < (90 + halfDegreesPerDirection)) {
			return "east";
		} else if (bearing >= (90 + halfDegreesPerDirection) && bearing < (180 - halfDegreesPerDirection)) {
			return "southeast";
		} else if (bearing >= (180 - halfDegreesPerDirection) && bearing < (180 + halfDegreesPerDirection)) {
			return "south";
		} else if (bearing >= (180 + halfDegreesPerDirection) && bearing < (270 - halfDegreesPerDirection)) {
			return "southwest";
		} else if (bearing >= (270 - halfDegreesPerDirection) && bearing < (270 + halfDegreesPerDirection)) {
			return "west";
		} else if (bearing >= (270 + halfDegreesPerDirection) && bearing < (360 - halfDegreesPerDirection)) {
			return "northwest";
		}
	}

	return undefined;
}
