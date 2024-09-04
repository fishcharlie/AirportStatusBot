export default function bearingToString(bearing: number): "north" | "northeast" | "northwest" | "east" | "west" | "south" | "southeast" | "southwest" | undefined {
	const totalDegrees = 360;
	const degreesPerDirection = totalDegrees / 8; // 45
	const halfDegreesPerDirection = degreesPerDirection / 2; // 22.5

	if (bearing < 0 || bearing >= totalDegrees) {
		return undefined;
	}

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

	return undefined;
}
