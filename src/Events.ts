enum EventType {
	"NFL_SUPER_BOWL"
};

interface EventObject {
	airportCode: string;
	event: EventType;
	active: {
		start: Date;
		end: Date;
	};
	hashtags: string[];
}

export class Events {
	private static events: EventObject[] = [
		{
			"airportCode": "MSY",
			"event": EventType.NFL_SUPER_BOWL,
			"active": {
				"start": new Date("2025-02-03T08:00:00Z"), // Monday, February 3, 2025 2:00:00 AM local time
				"end": new Date("2025-02-10T06:59:59Z") // Monday, February 10, 2025 12:59:59 AM local time
			},
			"hashtags": [
				"SuperBowl",
				"LIX",
				"NFL"
			]
		},
		{
			"airportCode": "SFO",
			"event": EventType.NFL_SUPER_BOWL,
			"active": {
				"start": new Date("2026-02-02T10:00:00Z"), // Monday, February 2, 2026 2:00:00 AM local time
				"end": new Date("2026-02-09T08:59:59Z") // Monday, February 9, 2026 12:59:59 AM local time
			},
			"hashtags": [
				"SuperBowl",
				"LX",
				"NFL"
			]
		},
		{
			"airportCode": "OAK",
			"event": EventType.NFL_SUPER_BOWL,
			"active": {
				"start": new Date("2026-02-02T10:00:00Z"), // Monday, February 2, 2026 2:00:00 AM local time
				"end": new Date("2026-02-09T08:59:59Z") // Monday, February 9, 2026 12:59:59 AM local time
			},
			"hashtags": [
				"SuperBowl",
				"LX",
				"NFL"
			]
		},
		{
			"airportCode": "SJC",
			"event": EventType.NFL_SUPER_BOWL,
			"active": {
				"start": new Date("2026-02-02T10:00:00Z"), // Monday, February 2, 2026 2:00:00 AM local time
				"end": new Date("2026-02-09T08:59:59Z") // Monday, February 9, 2026 12:59:59 AM local time
			},
			"hashtags": [
				"SuperBowl",
				"LX",
				"NFL"
			]
		}
	];

	static activeEvents(airportCode: string | undefined = undefined): EventObject[] {
		return this.events.filter((event: EventObject) => {
			const isActive = event.active.start <= new Date() && event.active.end >= new Date();

			if (airportCode) {
				return event.airportCode === airportCode && isActive;
			} else {
				return isActive;
			}
		});
	}
}
