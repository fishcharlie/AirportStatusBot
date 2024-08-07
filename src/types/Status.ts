import * as objectUtilities from "js-object-utilities";
import { startsWithVowel } from "../utils/startsWithVowel";
import { Airport } from "./Airport";
import * as luxon from "luxon";
import { Reason } from "./Reason";
import { parseDurationString } from "../utils/parseDurationString";
import { minutesToDurationString } from "../utils/minutesToDurationString";
import { OurAirportsDataManager } from "../OurAirportsDataManager";

const ianaEquivalents: { [key: string]: string } = {
	"EDT": "America/New_York",
	"CDT": "America/Chicago",
	"MDT": "America/Denver",
	"PDT": "America/Los_Angeles"
};

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
	#ourAirportsDataManager?: OurAirportsDataManager;

	get comparisonHash(): string {
		return `${this.airportCode}-${this.type.type}-${this.type.direction ?? "no_direction"}`;
	}

	constructor(airportCode: string, type: Type, reason: Reason, timing: { "start"?: Date, "end"?: Date } = {}, length: { "min"?: number, "max"?: number, "trend"?: "increasing" | "decreasing" } = {}, ourAirportsDataManager?: OurAirportsDataManager) {
		this.airportCode = airportCode;
		this.type = type;
		this.reason = reason;
		this.timing = timing;
		this.length = length;
		this.#ourAirportsDataManager = ourAirportsDataManager;
	}

	static fromRaw(raw: { [key: string]: any }, ourAirportsDataManager: OurAirportsDataManager): Status | Status[] | undefined {
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
				return Status.fromRaw(newRaw, ourAirportsDataManager);
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
			const [time, period, zone] = detailsObject["End_Time"].split(" ");

			const ianaZone = ianaEquivalents[zone];
			if (ianaZone) {
				timing["end"] = luxon.DateTime.fromFormat(`${time} ${period}`, "h:mm a", {
					"zone": ianaZone
				}).toJSDate();
			} else {
				timing["end"] = luxon.DateTime.fromFormat(detailsObject["End_Time"], "h:mm a z").toJSDate();
			}
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

		return new Status(airportCode, type, reason, timing, length, ourAirportsDataManager);
	}

	#cachedAirport?: Airport;
	async airport(): Promise<Airport | undefined> {
		if (this.#cachedAirport) {
			return this.#cachedAirport;
		}

		if (!this.#ourAirportsDataManager) {
			console.warn("No OurAirportsDataManager provided to Status.airport().");
			return undefined;
		}

		let airport: Airport | undefined = await Airport.fromFAACode(this.airportCode, this.#ourAirportsDataManager);
		if (airport) {
			this.#cachedAirport = airport;
			return airport;
		} else {
			console.warn(`Failed to find airport with code ${this.airportCode}`);
			return undefined;
		}
	}

	async airportString(): Promise<string> {
		const airport = await this.airport();
		return airport ? `${airport.name} (#${this.airportCode})` : this.airportCode;
	}

	/**
	 * When a given status is no longer active, this method will return a string to post to social media.
	 */
	async toEndedPost(): Promise<string | undefined> {
		const typeString = this.type.toString();
		const reasonString = this.reason.toString();

		if (!typeString) {
			return undefined;
		}

		const airport = await this.airport();

		if (!airport) {
			return undefined;
		}

		let sentences: string[] = [];

		if (this.type.type === TypeEnum.GROUND_STOP) {
			sentences.push(`Inbound operations to ${await this.airportString()} have resumed`);
		} else if (this.type.type === TypeEnum.GROUND_DELAY) {
			sentences.push(`Inbound aircraft to ${await this.airportString()} are no longer being delayed`);
		} else if (this.type.type === TypeEnum.CLOSURE) {
			sentences.push(`${await this.airportString()} has reopened`);
		} else if (this.type.type === TypeEnum.DELAY) {
			sentences.push(`The ${typeString} for ${await this.airportString()} is no longer in effect`);
		}

		if (sentences.length === 0) {
			return undefined;
		}
		return sentences.join(". ") + ".";
	}
	/**
	 * This method will return a string to post to social media when this status is newly active.
	 */
	async toPost(): Promise<string | undefined> {
		const typeString = this.type.toString();
		const reasonString = this.reason.toString();

		if (!typeString) {
			return undefined;
		}

		const airport: Airport | undefined = await this.airport();

		if (!airport) {
			return undefined;
		}

		let tz = airport.tz();

		let sentences: string[] = [];

		if (this.type.type === TypeEnum.GROUND_STOP) {
			sentences.push(`Inbound aircraft to ${await this.airportString()} are currently being held at their origin airport${reasonString ? ` due to ${reasonString}` : ""}`);
		} else if (this.type.type === TypeEnum.GROUND_DELAY) {
			sentences.push(`Inbound aircraft to ${await this.airportString()} are currently being delayed at their origin airport${reasonString ? ` due to ${reasonString}` : ""}`);
		} else {
			sentences.push(`A${startsWithVowel(typeString) ? "n" : ""} ${typeString} has been issued for ${await this.airportString()}${reasonString ? ` due to ${reasonString}` : ""}`);
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
		return sentences.join(". ") + ".";
	}

	/**
	 * This function is used when a status has been updated to generate a message for a new post.
	 */
	static async updatedPost(from: Status, to: Status): Promise<string | undefined> {
		if (from.comparisonHash !== to.comparisonHash) {
			return undefined;
		}
		if (from.type.type !== to.type.type || from.type.direction !== to.type.direction) {
			return undefined;
		}

		const airport: Airport | undefined = await to.airport();
		if (!airport) {
			return undefined;
		}

		let tz = airport.tz();

		if (from.timing.end !== undefined && to.timing.end !== undefined) {
			if (from.timing.end.toISOString() !== to.timing.end.toISOString()) {
				const extendedByDuration = luxon.DateTime.fromJSDate(to.timing.end).diff(luxon.DateTime.fromJSDate(from.timing.end), "minutes").minutes;
				const luxonDate = luxon.DateTime.fromJSDate(to.timing.end).setZone(tz ?? "UTC");
				return `The ${from.type.toString()} at ${await to.airportString()} has been extended by ${minutesToDurationString(extendedByDuration)} to ${luxonDate.toFormat("t")}${!Boolean(tz) ? ` UTC` : ""}.`;
			}
		}

		return undefined;
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
	direction?: "arrival" | "departure";

	constructor(type: TypeEnum, direction?: "Departure" | "Arrival") {
		this.type = type;
		this.direction = (() => {
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
				return `${this.direction ? `${this.direction} ` : ""}delay`;
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
