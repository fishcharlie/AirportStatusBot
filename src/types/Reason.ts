import { ImageType } from "../ImageGenerator";

enum ParentType {
	WEATHER = "WX",
	TRAFFIC_MANAGEMENT = "TM Initiatives",
	RUNWAY = "RWY",
	VOLUME = "VOL",
	STAFF = "STAFF",
	// NOT 100% on this one. See the comment in src/types/Reason.test.ts above the `EQ:RWY08R LGTG OTS` test for more info.
	EQUIPMENT = "EQ",
	OTHER = "OTHER",
}

// Sometimes for ground delays & ground stops the FAA API returns reasons that don't match the style of other reasons in the API...
// This map maps the reason that doesn't match the standard (ground delay & ground stop reasons) to the reason that does match the standard they use elsewhere.
// Not sure why they couldn't have just made it consistent...
const customReasonMaps: { [key: string]: string } = {
	"wind": "WX:Wind",
	"low ceilings": "WX:Low Ceilings",
	"snow or ice": "WX:Snow/Ice",
	"snow/ice": "WX:Snow/Ice",
	"snow or ice mitigation or treatment": "WX:Snow/Ice",
	"thunderstorms": "WX:Thunderstorms",
	"runway configuration change": "RWY:Rwy Change - Operational Necessity",
	"runway construction": "RWY:Construction",
	"airport volume": "VOL:Volume",
	"VOLUME": "VOL:Volume",
	"equipment outage": "EQ",
	"EQUIPMENT": "EQ",
	"air show": "OTHER:Air Show",
	"airspace volume": "VOL:Volume",
	"disabled aircraft on the runway": "RWY:Disabled Aircraft"
	// "low visibility": ""
	// "runway": ""
	// "RAIN": ""
	// "OTHER:IND RELEASES": "" // Not sure what "IND RELEASES" is...
}

export class Reason {
	#raw: string;

	constructor(raw: string) {
		if (customReasonMaps[raw.toLowerCase()]) {
			raw = customReasonMaps[raw.toLowerCase()];
		}
		if (customReasonMaps[raw]) {
			raw = customReasonMaps[raw];
		}

		this.#raw = raw;
	}

	zone(): string | undefined {
		const slashIndex = this.#raw.indexOf("/");
		const colonIndex = this.#raw.indexOf(":");
		if (slashIndex > -1 && colonIndex > -1 && slashIndex < colonIndex) {
			return this.#raw.split("/")[0];
		} else {
			return undefined;
		}
	}

	parts(): string[] {
		if (this.zone()) {
			return this.#raw.split("/")[1].split(":");
		} else {
			return this.#raw.split(":");
		}
	}

	parentType(): ParentType | undefined {
		const values = Object.values(ParentType);

		if (values.includes(this.parts()[0] as ParentType)) {
			return this.parts()[0] as ParentType;
		} else {
			return undefined;
		}
	}

	imageType(): ImageType | undefined {
		const subParts = this.parts().slice(1);
		const subPartsStr = subParts.join(":");

		switch (this.parentType()) {
			case ParentType.WEATHER:
				switch(subPartsStr) {
					case "Thunderstorms":
						return ImageType.radar;
				}
		}

		return undefined;
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
					case "Wind":
						return "wind";
					case "Snow/Ice":
						return "snow/ice";
					default:
						return "weather";
				}
			case ParentType.TRAFFIC_MANAGEMENT:
				switch(subPartsStr) {
					case "MIT:VOL":
						return "traffic management initiatives";
					case "MIT:WX":
					case "STOP:WX":
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
					case "Rwy Change - Operational Necessity":
						return "runway change";
					case "Disabled Aircraft":
						return "disabled aircraft";
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
			case ParentType.EQUIPMENT:
				return "equipment failure";
			case ParentType.OTHER:
				switch(subPartsStr) {
					case "Air Show":
						return "air show";
					default:
						return undefined;
				}
			default:
				return undefined;
		}
	}
}
