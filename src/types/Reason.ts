export class Reason {
	#raw: string;

	constructor(raw: string) {
		this.#raw = raw;
	}

	/**
	 * This returns a human friendly readable string for the given reason. If the reason is unable to be parsed into a human friendly string, this returns undefined.
	 */
	toString(): string | undefined {
		switch (this.#raw) {
			case "WX:Fog":
				return "fog";
			case "WX:Low Ceilings":
				return "weather";
			case "WX:Thunderstorms":
				return "thunderstorms";
			case "RWY:Noise Abatement":
				return "noise reduction measures";
			case "RWY:Maintenance":
				return "runway maintenance";
			case "RWY:Construction":
				return "runway construction";
			case "TM Initiatives:MIT:VOL":
			case "VOL:Compacted Demand":
			case "VOL:Multi-taxi":
				return "traffic management initiatives";
			case "TM Initiatives:MIT:WX":
				return "weather";
			case "VOL:Volume":
				return "high traffic volume";
			default:
				return undefined;
		}
	}
}
