import { ImageType } from "../ImageGenerator";

enum ParentType {
	WEATHER = "WX",
	TRAFFIC_MANAGEMENT = "TM Initiatives",
	RUNWAY = "RWY",
	TAXIWAY = "TWY",
	VOLUME = "VOL",
	STAFF = "STAFF",
	// NOT 100% on this one. See the comment in src/types/Reason.test.ts above the `EQ:RWY08R LGTG OTS` test for more info.
	EQUIPMENT = "EQ",
	VIP_MOVEMENT = "VIPM", // I'm pretty sure the "M" stands for "Movement" but I'm not 100% sure. The entire example string was `VIPM:VIP Movement` so that would make sense.
	OTHER = "OTHER",
}

// Sometimes for ground delays & ground stops the FAA API returns reasons that don't match the style of other reasons in the API...
// This map maps the reason that doesn't match the standard (ground delay & ground stop reasons) to the reason that does match the standard they use elsewhere.
// Not sure why they couldn't have just made it consistent...
const customReasonMaps: { [key: string]: string } = {
	// Weather
	"wind": "WX:Wind",
	"low ceilings": "WX:Low Ceilings",
	"snow or ice": "WX:Snow/Ice",
	"snow/ice": "WX:Snow/Ice",
	"snow or ice mitigation or treatment": "WX:Snow/Ice",
	"thunderstorms": "WX:Thunderstorms",
	"fog": "WX:Fog",
	"low visibility": "WX:Low Visibility",
	"WX VIS": "WX:Low Visibility",
	"rain": "WX:Rain",
	"TORNADO/HURRICANE": "WX:Tornado/Hurricane",
	"tornado or hurricane": "WX:Tornado/Hurricane",

	// Runway
	"runway configuration change": "RWY:Rwy Change - Operational Necessity",
	"runway construction": "RWY:Construction",
	"disabled aircraft on the runway": "RWY:Disabled Aircraft",
	"runway maintenance": "RWY:Maintenance",
	"runway obstruction": "RWY:Obstruction",

	// Volume
	"airport volume": "VOL:Volume",
	"VOLUME": "VOL:Volume",
	"airspace volume": "VOL:Volume",

	// Equipment
	"equipment outage": "EQ",
	"EQUIPMENT": "EQ",

	// Staff
	"STAFFING": "STAFF:Staffing",

	// Other
	"air show": "OTHER:Air Show",
	"MILITARY": "OTHER:Military OPS",
	"military operations": "OTHER:Military OPS",
	"bird strike": "OTHER:Bird Strike",
	"aircraft emergency": "OTHER:Aircraft Emergency"

	// Unknown (we don't know how to translate these yet)
	/////////////////////////////////////////////////////
	// "security": ""
	// "runway": "" // Not sure if this means "runway construction" or "runway maintenance" or something else...
	// "OTHER:IND RELEASES": "" // Not sure what "IND RELEASES" is...
	// "RWY: CONVERGING RWY OPS": "" // Not sure what "CONVERGING RWY OPS" is...
	// "OTHER:ZDC STOP": "" // Not sure what "ZDC STOP" is...
};


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

	get raw(): string {
		return this.#raw;
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
			return this.#raw.split("/")[1].split(":").map((part: string) => part.trim());
		} else {
			return this.#raw.split(":").map((part: string) => part.trim());
		}
	}

	parentType(): ParentType | undefined {
		const values = Object.values(ParentType);

		if (values.includes(this.parts()[0] as ParentType)) {
			return this.parts()[0] as ParentType;
		} else if (values.map((v) => v.toLowerCase()).includes(this.parts()[0].toLowerCase() as ParentType)) {
			return values.find((v) => v.toLowerCase() === this.parts()[0].toLowerCase()) as ParentType;
		} else {
			return undefined;
		}
	}

	imageType(): ImageType[] {
		const subParts = this.parts().slice(1);
		const subPartsStr = subParts.join(":");

		switch (this.parentType()) {
			case ParentType.WEATHER:
				switch(subPartsStr.toLowerCase()) {
					case "thunderstorms":
					case "tornado/hurricane":
					case "rain":
						return [ImageType.radar];
				}
		}

		return [];
	}

	/**
	 * This returns a human friendly readable string for the given reason. If the reason is unable to be parsed into a human friendly string, this returns undefined.
	 *
	 * It is assumed that this string will be proceeded by `due to` in the final output.
	 */
	toString(): string | undefined {
		const subParts: string[] = this.parts().slice(1);
		const subPartsStr: string = subParts.join(":");

		switch (this.parentType()) {
			case ParentType.WEATHER:
				switch(subPartsStr.toLowerCase()) {
					case "fog":
						return "fog";
					case "low ceilings":
						return "low ceilings";
					case "thunderstorms":
						return "thunderstorms";
					case "wind":
						return "wind";
					case "snow/ice":
						return "snow/ice";
					case "windshear/microburst":
						return "wind shear/microburst";
					case "microbursts":
						return "microbursts";
					case "wind shear":
						return "wind shear";
					case "tornado/hurricane":
						return "a tornado/hurricane";
					case "rain":
						return "rain";
					case "low visibility":
						return "low visibility";
					case "sev turb":
						return "severe turbulence";
					default:
						return "weather";
				}
			case ParentType.TRAFFIC_MANAGEMENT:
				switch(subPartsStr) {
					case "MIT:VOL":
					case "MINIT:VOL":
					case "DSP:VOL":
					case "STOP:VOL":
					case "Other:VOL":
						return "heavy traffic volume";
					case "MIT:WX":
					case "STOP:WX":
						return "weather";
					case "Other:STAFFING":
					case "STOP:STAFFING":
					case "MIT:STAFFING":
					case "MINIT:STAFFING":
					case "MINIT:STAFF":
					case "MIT:STAFF":
						return "staffing constraints";
					default:
						return "traffic management initiatives";
				}
			case ParentType.RUNWAY:
				switch(subPartsStr.toLowerCase()) {
					case "noise abatement":
						return "noise reduction measures";
					case "maintenance":
						return "runway maintenance";
					case "construction":
						return "runway construction";
					case "rwy change - operational necessity":
					case "rwy change - operational advantage":
						return "a runway change";
					case "disabled aircraft":
						return "a disabled aircraft";
					case "obstruction":
						return "runway obstruction";
					default:
						return undefined;
				}
			case ParentType.TAXIWAY:
				switch (subPartsStr.toLowerCase()) {
					case "construction":
						return "taxiway construction";
					default:
						return undefined;
				}
			case ParentType.VOLUME:
				switch(subPartsStr.toLowerCase()) {
					case "compacted demand":
					case "multi-taxi":
						return "traffic management initiatives";
					case "volume":
					default:
						return "high traffic volume";
				}
			case ParentType.STAFF:
				switch(subPartsStr.toLowerCase()) {
					default:
						return "staffing constraints";
				}
			case ParentType.EQUIPMENT:
				switch (subPartsStr.toLowerCase()) {
					case "radar outage":
					case "radar":
						return "a radar equipment outage";
					default:
						return "an equipment outage";
				}
			case ParentType.OTHER:
				switch(subPartsStr.toLowerCase()) {
					case "air show":
						return "an air show";
					case "aircraft emergency":
						return "an aircraft emergency";
					case "bird strike":
						return "a bird strike";
					case "military ops":
						return "military operations";
					case "disabled aircraft":
						return "a disabled aircraft";
					case "facility environmental issue":
						return "a facility environmental issue";
					case "dog on runways":
						return "a dog on the runway";
					case "s&r ops":
						return "search and rescue operations";
					default:
						return undefined;
				}
			case ParentType.VIP_MOVEMENT:
				switch (subPartsStr.toLowerCase()) {
					case "vip movement":
						return "VIP movement";
					default:
						return undefined;
				}
			default:
				return undefined;
		}
	}
}
