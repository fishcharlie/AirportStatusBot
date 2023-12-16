enum ParentType {
	WEATHER = "WX",
	TRAFFIC_MANAGEMENT = "TM Initiatives",
	RUNWAY = "RWY",
	VOLUME = "VOL",
	STAFF = "STAFF",
}

export class Reason {
	#raw: string;

	constructor(raw: string) {
		this.#raw = raw;
	}

	parts(): string[] {
		return this.#raw.split(":");
	}

	parentType(): ParentType | undefined {
		const values = Object.values(ParentType);

		if (values.includes(this.parts()[0] as ParentType)) {
			return this.parts()[0] as ParentType;
		} else {
			return undefined;
		}
	}

	/**
	 * This returns a human friendly readable string for the given reason. If the reason is unable to be parsed into a human friendly string, this returns undefined.
	 */
	toString(): string | undefined {
		const subParts = this.parts().slice(1);
		const subPartsStr = subParts.join(":");

		switch (this.parentType()) {
			case ParentType.WEATHER:
				switch(subPartsStr) {
					case "Fog":
						return "fog";
					case "Low Ceilings":
						return "low ceilings";
					case "Thunderstorms":
						return "thunderstorms";
					default:
						return "weather";
				}
			case ParentType.TRAFFIC_MANAGEMENT:
				switch(subPartsStr) {
					case "MIT:VOL":
						return "traffic management initiatives";
					case "MIT:WX":
						return "weather";
					default:
						return "traffic management initiatives";
				}
			case ParentType.RUNWAY:
				switch(subPartsStr) {
					case "Noise Abatement":
						return "noise reduction measures";
					case "Maintenance":
						return "runway maintenance";
					case "Construction":
						return "runway construction";
					default:
						return undefined;
				}
			case ParentType.VOLUME:
				switch(subPartsStr) {
					case "Compacted Demand":
					case "Multi-taxi":
						return "traffic management initiatives";
					case "Volume":
					default:
						return "high traffic volume";
				}
			case ParentType.STAFF:
				switch(subPartsStr) {
					default:
						return "staffing constraints";
				}
			default:
				return undefined;
		}
	}
}
