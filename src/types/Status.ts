import * as objectUtilities from "js-object-utilities";
import { startsWithVowel } from "../utils/startsWithVowel";
import { Airport } from "./Airport";
import * as luxon from "luxon";
import { find as findTZ } from "geo-tz";

export class Status {
	airportCode: string;
	type: Type;
	reason: Reason;
	timing: {
		"start"?: Date;
		"end"?: Date;
	}
	length: {
		"min"?: number;
		"max"?: number;
		"trend"?: "increasing" | "decreasing";
	}

	get comparisonHash(): string {
		return `${this.airportCode}-${this.type.type}`;
	}

	constructor(airportCode: string, type: Type, reason: Reason, timing: { "start"?: Date, "end"?: Date } = {}, length: { "min"?: number, "max"?: number, "trend"?: "increasing" | "decreasing" } = {}) {
		this.airportCode = airportCode;
		this.type = type;
		this.reason = reason;
		this.timing = timing;
		this.length = length;
	}

	static fromRaw(raw: { [key: string]: any }): Status | Status[] | undefined {
		const tmpType = new Type(raw.Name);

		const detailsObjectPath = tmpType.detailsObjectPath();
		if (!detailsObjectPath) {
			return undefined;
		}

		const detailsObject = objectUtilities.get(raw, detailsObjectPath);

		if (Array.isArray(detailsObject)) {
			const returnArray: Status[] = detailsObject.flatMap((detailsObject) => {
				let newRaw = {
					...raw
				};
				objectUtilities.set(newRaw, detailsObjectPath, detailsObject);
				return Status.fromRaw(newRaw);
			}) as Status[];
			return returnArray;
		}

		const airportCode = detailsObject.ARPT;
		const reason = new Reason(detailsObject.Reason);

		const type = new Type(raw.Name, detailsObject["Arrival_Departure"]?.["@_Type"]);
		let timing: { "start"?: Date, "end"?: Date } = {};
		const formatString = "MMM dd 'at' HH:mm 'UTC.'";
		if (detailsObject["Start"]) {
			timing["start"] = luxon.DateTime.fromFormat(detailsObject["Start"], formatString, {
				"zone": "utc"
			}).toJSDate();
		}
		if (detailsObject["Reopen"]) {
			timing["end"] = luxon.DateTime.fromFormat(detailsObject["Reopen"], formatString, {
				"zone": "utc"
			}).toJSDate();
		}

		let length: { "min"?: number, "max"?: number, "trend"?: "increasing" | "decreasing" } = {};
		if (detailsObject.Arrival_Departure) {
			if (/^([0-9]+) minutes?$/.test(detailsObject.Arrival_Departure.Min) && /^([0-9]+) minutes?$/.test(detailsObject.Arrival_Departure.Max)) {
				length.min = parseInt(/^([0-9]+) minutes?$/.exec(detailsObject.Arrival_Departure.Min)![1]);
				length.max = parseInt(/^([0-9]+) minutes?$/.exec(detailsObject.Arrival_Departure.Max)![1]);
			}
			length.trend = detailsObject.Arrival_Departure.Trend.toLowerCase() as "increasing" | "decreasing";
			if (length.trend !== "increasing" && length.trend !== "decreasing") {
				length.trend = undefined;
			}
		}

		return new Status(airportCode, type, reason, timing, length);
	}

	#cachedAirport?: Airport;
	get airport(): Airport | undefined {
		if (this.#cachedAirport) {
			return this.#cachedAirport;
		}

		let airport: Airport | undefined = Airport.fromFAACode(this.airportCode);
		if (airport) {
			this.#cachedAirport = airport;
			return airport;
		} else {
			return undefined;
		}
	}

	toPost(): string | undefined {
		const typeString = this.type.toString();
		const reasonString = this.reason.toString();

		if (!typeString) {
			return undefined
		}

		const airportString = this.airport ? `${this.airport.name} (#${this.airportCode})` : this.airportCode;

		let sentences: string[] = [
			`A${startsWithVowel(typeString) ? "n" : ""} ${typeString} has been issued for ${airportString}${reasonString ? ` due to ${reasonString}` : ""}`
		];
		if (this.type.type === TypeEnum.DELAY) {
			if (this.length.min && this.length.max && this.length.trend) {
				if (this.length.min === this.length.max) {
					sentences.push(`Current delays are ${this.length.min} minutes and ${this.length.trend}`);
				} else {
					sentences.push(`Current delays are ${this.length.min}-${this.length.max} minutes and ${this.length.trend}`);
				}
			}
		}
		if (this.type.type === TypeEnum.CLOSURE) {
			if (this.timing.end) {
				let hadToFallbackTZ = false;
				let tz: string = "UTC";
				if (this.airport) {
					const tmptz = findTZ(this.airport.latitude_deg, this.airport.longitude_deg)[0];

					if (!tmptz) {
						hadToFallbackTZ = true;
					} else {
						tz = tmptz;
					}
				} else {
					hadToFallbackTZ = true;
				}

				const luxonDate = luxon.DateTime.fromJSDate(this.timing.end).setZone(tz);
				const currentLuxonDate = luxon.DateTime.local({
					"zone": tz
				});
				const isToday = luxonDate.hasSame(currentLuxonDate, "day");
				const isSameWeek = luxonDate.hasSame(currentLuxonDate, "week");
				const isSameYear = luxonDate.hasSame(currentLuxonDate, "year");

				if (isToday) {
					sentences.push(`The airport is expected to reopen at ${luxonDate.toFormat("t")}${hadToFallbackTZ ? ` ${tz}` : ""}`);
				} else if (isSameWeek) {
					sentences.push(`The airport is expected to reopen ${luxonDate.toFormat("cccc")} at ${luxonDate.toFormat("t")}${hadToFallbackTZ ? ` ${tz}` : ""}`);
				} else if (isSameYear) {
					sentences.push(`The airport is expected to reopen ${luxonDate.toFormat("LLLL L")} at ${luxonDate.toFormat("t")}${hadToFallbackTZ ? ` ${tz}` : ""}`);
				}
			} else {
				sentences.push(`It is currently unknown when the airport will reopen`);
			}
		}
		return sentences.join(". ") + ". #AirportStatusBot";
	}
}

export enum TypeEnum {
	GROUND_STOP = "Ground Stop Programs",
	CLOSURE = "Airport Closures",
	DELAY = "General Arrival/Departure Delay Info"
}
class Type {
	type: TypeEnum;
	#direction?: "arrival" | "departure";

	constructor(type: TypeEnum, direction?: "Departure") {
		this.type = type;
		this.#direction = direction === "Departure" ? "departure" : undefined;
	}

	toString(): string | undefined {
		switch (this.type) {
			case TypeEnum.GROUND_STOP:
				return "ground stop";
			case TypeEnum.CLOSURE:
				return "airport closure";
			case TypeEnum.DELAY:
				return `${this.#direction ? `${this.#direction} ` : ""}delay`;
			default:
				return undefined;
		}
	}

	detailsObjectPath(): string | undefined {
		switch (this.type) {
			case TypeEnum.GROUND_STOP:
				return undefined;
			case TypeEnum.CLOSURE:
				return "Airport_Closure_List.Airport";
			case TypeEnum.DELAY:
				return "Arrival_Departure_Delay_List.Delay";
			default:
				return undefined;
		}
	}
}

class Reason {
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
