// Returns the number of minutes in a duration string
// Will return undefined if the string is not a valid duration string
export function parseDurationString(str: string): number | undefined {
	const matches = /^(?:([0-9]+) hours?(?: and )?)?(([0-9]+) minutes?)?$/.exec(str);
	if (!matches) {
		return undefined;
	}

	let hours = parseInt(matches[1]);
	let minutes = parseInt(matches[2]);

	if (isNaN(hours) && isNaN(minutes)) {
		return undefined;
	}

	if (isNaN(hours)) {
		hours = 0;
	}
	if (isNaN(minutes)) {
		minutes = 0;
	}

	return hours * 60 + minutes;
}
