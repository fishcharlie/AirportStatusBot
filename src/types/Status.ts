import * as objectUtilities from "js-object-utilities";
import { startsWithVowel } from "../utils/startsWithVowel";
import { Airport } from "./Airport";
import * as luxon from "luxon";
import { Reason } from "./Reason";
import { parseDurationString } from "../utils/parseDurationString";
import { minutesToDurationString } from "../utils/minutesToDurationString";

export class Status {
	airportCode: string;
	type: Type;
	reason: Reason;
	timing: {
		"start"?: Date;
		"end"?: Date;
	}
	length: {
		// In minutes
		"min"?: number;
		// In minutes
		"max"?: number;
		// In minutes
		"average"?: number;
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
		} else if (detailsObject["End_Time"]) {
			timing["end"] = luxon.DateTime.fromFormat(detailsObject["End_Time"], "h:mm a z").toJSDate();
		}

		let length: { "min"?: number, "max"?: number, "average"?: number, "trend"?: "increasing" | "decreasing" } = {};
		if (detailsObject.Arrival_Departure) {
			if (parseDurationString(detailsObject.Arrival_Departure.Min)) {
				length.min = parseDurationString(detailsObject.Arrival_Departure.Min);
			}
			if (parseDurationString(detailsObject.Arrival_Departure.Max)) {
				length.max = parseDurationString(detailsObject.Arrival_Departure.Max);
			}

			length.trend = detailsObject.Arrival_Departure.Trend.toLowerCase() as "increasing" | "decreasing";
			if (length.trend !== "increasing" && length.trend !== "decreasing") {
				length.trend = undefined;
			}
		}
		if (detailsObject.Avg) {
			if (parseDurationString(detailsObject.Avg)) {
				length.average = parseDurationString(detailsObject.Avg);
			}
		}
		if (detailsObject.Max) {
			if (parseDurationString(detailsObject.Max)) {
				length.max = parseDurationString(detailsObject.Max);
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
			return undefined;
		}

		const airport = this.airport;

		if (!airport) {
			return undefined;
		}

		const airportString = airport ? `${airport.name} (#${this.airportCode})` : this.airportCode;

		let tz = this.airport?.tz();

		let sentences: string[] = [];

		if (this.type.type === TypeEnum.GROUND_STOP) {
			sentences.push(`Inbound aircraft to ${airportString} are currently being held at their origin airport${reasonString ? ` due to ${reasonString}` : ""}`);
		} else if (this.type.type === TypeEnum.GROUND_DELAY) {
			sentences.push(`Inbound aircraft to ${airportString} are currently being delayed at their origin airport${reasonString ? ` due to ${reasonString}` : ""}`);
		} else {
			sentences.push(`A${startsWithVowel(typeString) ? "n" : ""} ${typeString} has been issued for ${airportString}${reasonString ? ` due to ${reasonString}` : ""}`);
		}

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
				const luxonDate = luxon.DateTime.fromJSDate(this.timing.end).setZone(tz ?? "UTC");
				const currentLuxonDate = luxon.DateTime.local({
					"zone": tz
				});
				const isToday = luxonDate.hasSame(currentLuxonDate, "day");
				const isSameWeek = luxonDate.hasSame(currentLuxonDate, "week");
				const isSameYear = luxonDate.hasSame(currentLuxonDate, "year");

				if (isToday) {
					sentences.push(`The airport is expected to reopen at ${luxonDate.toFormat("t")}${!Boolean(tz) ? ` UTC` : ""}`);
				} else if (isSameWeek) {
					sentences.push(`The airport is expected to reopen ${luxonDate.toFormat("cccc")} at ${luxonDate.toFormat("t")}${!Boolean(tz) ? ` UTC` : ""}`);
				} else if (isSameYear) {
					sentences.push(`The airport is expected to reopen ${luxonDate.toFormat("LLLL L")} at ${luxonDate.toFormat("t")}${!Boolean(tz) ? ` UTC` : ""}`);
				}
			} else {
				sentences.push(`It is currently unknown when the airport will reopen`);
			}
		}
		if (this.type.type === TypeEnum.GROUND_STOP) {
			if (this.timing.end) {
				const luxonDate = luxon.DateTime.fromJSDate(this.timing.end).setZone(tz ?? "UTC");

				sentences.push(`Operations are expected to resume at ${luxonDate.toFormat("t")}${!Boolean(tz) ? ` UTC` : ""}`);
			} else {
				sentences.push(`It is currently unknown when operations will resume`);
			}
		}
		if (this.type.type === TypeEnum.GROUND_DELAY) {
			if (this.length.average && this.length.max) {
				sentences.push(`Delays are currently averaging ${minutesToDurationString(this.length.average)} and are up to ${minutesToDurationString(this.length.max)}`);
			} else if (this.length.average) {
				sentences.push(`Delays are currently averaging ${minutesToDurationString(this.length.average)}`);
			} else if (this.length.max) {
				sentences.push(`Delays are currently up to ${minutesToDurationString(this.length.max)}`);
			} else {
				sentences.push(`It is currently unknown how long the delays are`);
			}
		}
		return sentences.join(". ") + ". #AirportStatusBot";
	}
}

export enum TypeEnum {
	GROUND_STOP = "Ground Stop Programs",
	GROUND_DELAY = "Ground Delay Programs",
	CLOSURE = "Airport Closures",
	DELAY = "General Arrival/Departure Delay Info"
}
class Type {
	type: TypeEnum;
	#direction?: "arrival" | "departure";

	constructor(type: TypeEnum, direction?: "Departure" | "Arrival") {
		this.type = type;
		this.#direction = (() => {
			switch (direction) {
				case "Departure":
					return "departure";
				case "Arrival":
					return "arrival";
				default:
					return undefined;
			}
		})();
	}

	toString(): string | undefined {
		switch (this.type) {
			case TypeEnum.GROUND_STOP:
				return "ground stop";
			case TypeEnum.GROUND_DELAY:
				return "ground delay";
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
				return "Ground_Stop_List.Program";
			case TypeEnum.GROUND_DELAY:
				return "Ground_Delay_List.Ground_Delay";
			case TypeEnum.CLOSURE:
				return "Airport_Closure_List.Airport";
			case TypeEnum.DELAY:
				return "Arrival_Departure_Delay_List.Delay";
			default:
				return undefined;
		}
	}
}
