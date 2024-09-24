import * as objectUtilities from "js-object-utilities";
import { startsWithVowel } from "../utils/startsWithVowel";
import { Airport } from "./Airport";
import * as luxon from "luxon";
import { Reason } from "./Reason";
import { parseDurationString } from "../utils/parseDurationString";
import { minutesToDurationString } from "../utils/minutesToDurationString";
import { OurAirportsDataManager } from "../OurAirportsDataManager";
import { NaturalEarthDataManager } from "../NaturalEarthDataManager";
import { ImageType } from "../ImageGenerator";
import formatNumber from "../utils/formatNumber";
import * as turf from "@turf/turf";
import bearingToString from "../utils/bearingToString";
import getUSStateThatPointIsIn from "../utils/getUSStateThatPointIsIn";
import getClosestLandmarkToPoint from "../utils/getClosestLandmarkToPoint";
import { luxonTimeToString } from "../utils/luxonTimeToString";

const ianaEquivalents: { [key: string]: string } = {
	"EDT": "America/New_York",
	"CDT": "America/Chicago",
	"MDT": "America/Denver",
	"PDT": "America/Los_Angeles"
};

export class Status {
	airportCode?: string;
	type: Type;
	reason: Reason;
	timing: {
		"start"?: Date;
		"end"?: Date;
	};
	length: {
		// In minutes
		"min"?: number;
		// In minutes
		"max"?: number;
		// In minutes
		"average"?: number;
		"trend"?: "increasing" | "decreasing";
	};
	/**
	 * Object defining the altitude range for the status. This is mostly for airspace flow programs where it only applies to planes at a certain altitude.
	 */
	altitudes?: {
		/**
		 * The bottom of the altitude range in feet. Example: 20000 for 20,000 feet or FL200.
		 */
		"floor"?: number;
		/**
		 * The top of the altitude range in feet. Example: 20000 for 20,000 feet or FL200.
		 */
		"ceiling"?: number;
	};
	/**
	 * The GeoJSON object for the line that represents the status. This is mostly for airspace flow programs.
	 */
	geoJSON?: GeoJSON.LineString | GeoJSON.Polygon;
	#otherData: {[key: string]: any};
	#ourAirportsDataManager?: OurAirportsDataManager;
	#naturalEarthDataManager?: NaturalEarthDataManager;

	get comparisonHash(): string {
		return `${this.airportCode ?? this.#otherData["CTL_Element"]}-${this.type.type}-${this.type.direction ?? "no_direction"}`;
	}

	constructor(airportCode: string, type: Type, reason: Reason, timing: { "start"?: Date, "end"?: Date } = {}, length: { "min"?: number, "max"?: number, "trend"?: "increasing" | "decreasing" } = {}, altitudes: {"floor"?: number; "ceiling"?: number;} = {}, geoJSON: GeoJSON.LineString | GeoJSON.Polygon | undefined = undefined, otherData: {[key: string]: any} = {}, ourAirportsDataManager?: OurAirportsDataManager, naturalEarthDataManager?: NaturalEarthDataManager) {
		this.airportCode = airportCode;
		this.type = type;
		this.reason = reason;
		this.timing = timing;
		this.length = length;
		this.altitudes = altitudes;
		this.geoJSON = geoJSON;
		this.#otherData = otherData;
		this.#ourAirportsDataManager = ourAirportsDataManager;
		this.#naturalEarthDataManager = naturalEarthDataManager;
	}

	static fromRaw(raw: { [key: string]: any }, ourAirportsDataManager: OurAirportsDataManager, naturalEarthDataManager: NaturalEarthDataManager): Status | Status[] | undefined {
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
				return Status.fromRaw(newRaw, ourAirportsDataManager, naturalEarthDataManager);
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

		let altitudes: { "floor"?: number, "ceiling"?: number } = {};
		if (detailsObject.Floor) {
			altitudes.floor = parseInt(detailsObject.Floor) * 100;
		}
		if (detailsObject.Ceiling) {
			altitudes.ceiling = parseInt(detailsObject.Ceiling) * 100;
		}

		const geoJSON: GeoJSON.LineString | GeoJSON.Polygon | undefined = (() => {
			if (detailsObject.Line && detailsObject.Line.Point && Array.isArray(detailsObject.Line.Point)) {
				return {
					"type": "LineString",
					"coordinates": detailsObject.Line.Point.map((point: { "@_Lat": string, "@_Long": string }) => {
						return [parseFloat(point["@_Long"]), parseFloat(point["@_Lat"])];
					})
				}
			} else if (detailsObject.Circle) {
				return turf.circle([parseFloat(detailsObject.Circle.Center["@_Long"]), parseFloat(detailsObject.Circle.Center["@_Lat"])], parseFloat(detailsObject.Circle["@_Radius"]), {
					"steps": 64,
					"units": "miles"
				}).geometry;
			} else {
				return undefined;
			}
		})();

		let otherData: {[key: string]: any} = {};

		if (detailsObject.CTL_Element) {
			otherData["CTL_Element"] = detailsObject.CTL_Element;
		}

		return new Status(airportCode, type, reason, timing, length, altitudes, geoJSON, otherData, ourAirportsDataManager, naturalEarthDataManager);
	}

	#cachedNearestAirport?: {airport: Airport; distance: number;};
	async nearestAirport(): Promise<{airport: Airport; distance: number;} | undefined> {
		if (this.#cachedNearestAirport) {
			return this.#cachedNearestAirport;
		}

		if (!this.airportCode && this.type.type === TypeEnum.AIRSPACE_FLOW && this.geoJSON?.type === "Polygon") {
			const centerPoint = turf.center(this.geoJSON);
			const airports = await this.#ourAirportsDataManager?.getAllAirports();
			const closestAirport = (airports ?? []).reduce((closest: {airport: Airport; distance: number;} | undefined, airport: Airport) => {
				const distance = turf.distance(centerPoint, turf.point([airport.longitude_deg, airport.latitude_deg]), {
					"units": "miles"
				});
				if (!closest || distance < closest.distance) {
					return {
						"airport": airport,
						"distance": distance
					};
				} else {
					return closest;
				}
			}, undefined);

			if (closestAirport) {
				this.#cachedNearestAirport = closestAirport;
			}

			return closestAirport;
		} else {
			return undefined;
		}
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

		if (this.airportCode === undefined) {
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

	async airportString(): Promise<string | undefined> {
		const airport = await this.airport();
		if (!airport) {
			return undefined;
		}
		return airport ? `${airport.name} (#${this.airportCode})` : this.airportCode;
	}

	imageType(): ImageType[] {
		if (this.type.type === TypeEnum.AIRSPACE_FLOW && this.geoJSON !== undefined) {
			return [ImageType.geojson];
		}

		return [];
	}

	get isBeta(): boolean {
		if (this.type.type === TypeEnum.AIRSPACE_FLOW || this.type.type === TypeEnum.CLOSURE) {
			return true;
		} else if (this.airportCode === undefined) {
			return true;
		} else {
			return false;
		}
	}

	/**
	 * If a status is valid and should be posted.
	 */
	get isValid(): boolean {
		if (this.type.type === TypeEnum.CLOSURE) {
			if (!this.reason.raw.match(/^!\w{3,4} \d{2}\/\d{3} \w{3} AD AP CLSD \d{10}-\d{10}$/gu)) {
				// The raw reason string includes a closure that might be limited in nature. We don't want to post something that's not a full closure.
				// ex. `!RDM 01/300 RDM AD AP CLSD EXC COMMERCIAL AIRLINES AND LIFE FLT 2401211633-2401220100`
				return false;
			} else {
				return true;
			}
		} else {
			return true;
		}
	}

	/**
	 * When a given status is no longer active, this method will return a string to post to social media.
	 */
	async toEndedPost(): Promise<string | undefined> {
		if (!this.isValid) {
			return undefined;
		}

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
		if (!this.isValid) {
			return undefined;
		}

		const typeString = this.type.toString();
		const reasonString = this.reason.toString();

		if (!typeString) {
			return undefined;
		}

		const airport: Airport | undefined = await this.airport();

		if (this.type.type === TypeEnum.AIRSPACE_FLOW && this.geoJSON === undefined) {
			return undefined;
		}
		if (!airport && this.type.type !== TypeEnum.AIRSPACE_FLOW) {
			return undefined;
		}

		let tz = airport?.tz();

		let sentences: string[] = [];

		if (this.type.type === TypeEnum.GROUND_STOP) {
			sentences.push(`Inbound aircraft to ${await this.airportString()} are currently being held at their origin airport${reasonString ? ` due to ${reasonString}` : ""}`);
		} else if (this.type.type === TypeEnum.GROUND_DELAY) {
			sentences.push(`Inbound aircraft to ${await this.airportString()} are currently being delayed at their origin airport${reasonString ? ` due to ${reasonString}` : ""}`);
		} else if (this.type.type === TypeEnum.AIRSPACE_FLOW) {
			const state: GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties> | undefined = await (async () => {
				if (!this.geoJSON) {
					return undefined;
				}

				if (!this.#naturalEarthDataManager) {
					return undefined;
				}

				// Find center point of the GeoJSON
				const centerPoint = turf.center(this.geoJSON);

				// Find the state that the center point is in
				return getUSStateThatPointIsIn(centerPoint, this.#naturalEarthDataManager);
			})();
			const region: string = await (async () => {
				const closestAirport = await this.nearestAirport();

				if (closestAirport && closestAirport.distance < 3) {
					return ` ${this.geoJSON?.type === "LineString" ? "near" : "around"} ${closestAirport.airport.airportString}`;
				} else if (state && state.properties) {
					return ` in the #${state.properties?.name} region`;
				} else if (this.geoJSON) {
					const statesGeoJSON = await this.#naturalEarthDataManager?.geoJSON("ne_110m_admin_1_states_provinces");
					if (!statesGeoJSON) {
						return "";
					}

					const centerPoint = turf.center(this.geoJSON);
					const landmarks: GeoJSON.FeatureCollection<GeoJSON.Point, GeoJSON.GeoJsonProperties> = turf.featureCollection([
						turf.feature(turf.geometry("Point", [-97, 38]), {"name": "the contiguous United States"}),
						turf.feature(turf.center(statesGeoJSON.features.find((feature) => feature.properties?.name === "Alaska")!.geometry).geometry, {"name": "Alaska"}),
						turf.feature(turf.center(statesGeoJSON.features.find((feature) => feature.properties?.name === "Hawaii")!.geometry).geometry, {"name": "Hawaii"}),
					]) as any;

					const closestLandmark = getClosestLandmarkToPoint(centerPoint, landmarks);
					if (!closestLandmark) {
						return "";
					}

					if (!closestLandmark.item.properties?.name) {
						return "";
					}

					return ` to the ${closestLandmark.direction} of ${closestLandmark.item.properties.name}`;
				} else {
					return "";
				}
			})();
			sentences.push(`An en route delay is currently in effect${region}${reasonString ? ` due to ${reasonString}` : ""}`);
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
			if (this.timing.start) {
				const startDate = luxon.DateTime.fromJSDate(this.timing.start).setZone(tz ?? "UTC");
				const currentLuxonDate = luxon.DateTime.fromJSDate(new Date()).setZone(tz ?? "UTC");
				const minutesUntilStart = startDate.diff(currentLuxonDate, "minutes").minutes;
				if (minutesUntilStart > 5) {
					const isToday = startDate.hasSame(currentLuxonDate, "day");
					const isSameWeek = startDate.hasSame(currentLuxonDate, "week");
					const isSameYear = startDate.hasSame(currentLuxonDate, "year");

					if (isToday) {
						sentences.push(`This closure is effective as of ${luxonTimeToString(startDate)}${!Boolean(tz) ? ` UTC` : ""}`);
					} else if (isSameWeek) {
						sentences.push(`This closure is effective as of ${startDate.toFormat("cccc")} at ${luxonTimeToString(startDate)}${!Boolean(tz) ? ` UTC` : ""}`);
					} else if (isSameYear) {
						sentences.push(`This closure is effective as of ${startDate.toFormat("LLLL d")} at ${luxonTimeToString(startDate)}${!Boolean(tz) ? ` UTC` : ""}`);
					}
				}
			}
			if (this.timing.end) {
				const luxonDate = luxon.DateTime.fromJSDate(this.timing.end).setZone(tz ?? "UTC");
				const currentLuxonDate = luxon.DateTime.fromJSDate(new Date()).setZone(tz ?? "UTC");
				const isToday = luxonDate.hasSame(currentLuxonDate, "day");
				const isSameWeek = luxonDate.hasSame(currentLuxonDate, "week");
				const isSameYear = luxonDate.hasSame(currentLuxonDate, "year");

				if (isToday) {
					sentences.push(`The airport is expected to reopen at ${luxonTimeToString(luxonDate)}${!Boolean(tz) ? ` UTC` : ""}`);
				} else if (isSameWeek) {
					sentences.push(`The airport is expected to reopen ${luxonDate.toFormat("cccc")} at ${luxonTimeToString(luxonDate)}${!Boolean(tz) ? ` UTC` : ""}`);
				} else if (isSameYear) {
					sentences.push(`The airport is expected to reopen ${luxonDate.toFormat("LLLL d")} at ${luxonTimeToString(luxonDate)}${!Boolean(tz) ? ` UTC` : ""}`);
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
		if (this.type.type === TypeEnum.AIRSPACE_FLOW) {
			if (this.altitudes?.floor && this.altitudes?.ceiling) {
				sentences.push(`This delay applies to aircraft flying between ${formatNumber(this.altitudes.floor)} and ${formatNumber(this.altitudes.ceiling)} feet`);
			} else if (this.altitudes?.ceiling && !this.altitudes?.floor) {
				sentences.push(`This delay applies to aircraft flying below ${formatNumber(this.altitudes.ceiling)} feet`);
			} else if (this.altitudes?.floor && !this.altitudes?.ceiling) {
				sentences.push(`This delay applies to aircraft flying above ${formatNumber(this.altitudes.floor)} feet`);
			}
			if (this.length.average) {
				sentences.push(`Delays are currently averaging ${minutesToDurationString(this.length.average)}`);
			}
		}
		return sentences.join(". ") + ".";
	}

	/**
	 * This function is used when a status has been updated to generate a message for a new post.
	 */
	static async updatedPost(from: Status, to: Status): Promise<string | undefined> {
		if (!from.isValid || !to.isValid) {
			return undefined;
		}

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
				return `The ${from.type.toString()} at ${await to.airportString()} has been ${extendedByDuration > 0 ? "extended" : "reduced"} by ${minutesToDurationString(Math.abs(extendedByDuration))} to ${luxonDate.toFormat("t")}${!Boolean(tz) ? ` UTC` : ""}.`;
			}
		}
		if (from.length.trend !== undefined && to.length.trend !== undefined && from.length.min !== undefined && to.length.min !== undefined && from.length.max !== undefined && to.length.max !== undefined) {
			const minChanged = from.length.min !== to.length.min;
			const maxChanged = from.length.max !== to.length.max;
			const change: "increased" | "decreased" | undefined = (() => {
				if (to.length.min > from.length.min && to.length.max > from.length.max) {
					return "increased";
				} else if (to.length.min < from.length.min && to.length.max < from.length.max) {
					return "decreased";
				} else {
					return undefined;
				}
			})();
			const trendChanged = from.length.trend !== to.length.trend;

			if (minChanged && !maxChanged) {
				return `The ${to.type.toString()} at ${await to.airportString()} now has a minimum delay of ${to.length.min} minutes. The maximum delay remains at ${to.length.max} minutes. The predicted trend is ${trendChanged ? "now" : "still"} ${to.length.trend}.`;
			} else if ((minChanged && maxChanged) || maxChanged) {
				return `The ${to.type.toString()} at ${await to.airportString()} has ${change ? change : "changed"} to ${to.length.min}-${to.length.max} minutes and is ${trendChanged ? "now" : "still"} ${to.length.trend}.`;
			} else if (trendChanged) {
				return `The ${to.type.toString()} at ${await to.airportString()} is now ${to.length.trend} with delays remaining at ${to.length.min}-${to.length.max} minutes.`;
			}
		}
		if (from.length.average !== undefined && to.length.average !== undefined && from.length.max !== undefined && to.length.max !== undefined) {
			const averageChanged = from.length.average !== to.length.average;
			const maxChanged = from.length.max !== to.length.max;
			const change: "increased" | "decreased" | undefined = (() => {
				if (to.length.average > from.length.average && to.length.max > from.length.max) {
					return "increased";
				} else if (to.length.average < from.length.average && to.length.max < from.length.max) {
					return "decreased";
				} else {
					return undefined;
				}
			})();

			if (averageChanged && maxChanged) {
				return `The ${to.type.toString()} at ${await to.airportString()}${change ? ` has ${change} and` : ""} now has an average delay of ${minutesToDurationString(to.length.average)} and a maximum delay of ${minutesToDurationString(to.length.max)}.`;
			}
			if (averageChanged) {
				return `The average ${to.type.toString()} at ${await to.airportString()} has ${from.length.average > to.length.average ? "decreased" : "increased"} to ${minutesToDurationString(to.length.average)}.`;
			}
			if (maxChanged) {
				return `The maximum ${to.type.toString()} at ${await to.airportString()} has ${from.length.max > to.length.max ? "decreased" : "increased"} to ${minutesToDurationString(to.length.max)}.`;
			}
		}

		return undefined;
	}
}

export enum TypeEnum {
	GROUND_STOP = "Ground Stop Programs",
	GROUND_DELAY = "Ground Delay Programs",
	CLOSURE = "Airport Closures",
	DELAY = "General Arrival/Departure Delay Info",
	AIRSPACE_FLOW = "Airspace Flow Programs"
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
			case TypeEnum.AIRSPACE_FLOW:
				return "en route delay";
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
			case TypeEnum.AIRSPACE_FLOW:
				return "Airspace_Flow_List.Airspace_Flow";
			case TypeEnum.DELAY:
				return "Arrival_Departure_Delay_List.Delay";
			default:
				return undefined;
		}
	}
}
