export function minutesToDurationString(minutes: number): string {
	if (minutes < 1 && minutes !== 0) {
		const seconds = Math.floor(minutes * 60);
		return `${seconds} second${seconds === 1 ? "" : "s"}`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	if (hours === 0) {
		return `${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`;
	} else if (remainingMinutes === 0) {
		return `${hours} hour${hours === 1 ? "" : "s"}`;
	} else {
		return `${hours} hour${hours === 1 ? "" : "s"} and ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`;
	}
}
