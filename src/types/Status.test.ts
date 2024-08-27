import { NaturalEarthDataManager } from "../NaturalEarthDataManager";
import { OurAirportsDataManager } from "../OurAirportsDataManager";
import { Status } from "./Status";

describe("Status.fromRAW().toPost()", () => {
	const tests = [
		[
			{},
			undefined
		],
		[
			{
				"Name": "General Arrival/Departure Delay Info",
				"Arrival_Departure_Delay_List": {
					"Delay": {
						"ARPT": "AAA",
						"Reason": "TM Initiatives:MIT:VOL",
						"Arrival_Departure": {
							"@_Type": "Departure",
							"Trend": "Increasing",
							"Min": "46 minutes",
							"Max": "1 hour",
						},
					}
				}
			},
			"A departure delay has been issued for Test Airport A (#AAA) due to traffic management initiatives. Current delays are 46-60 minutes and increasing."
		],
		[
			{
				"Name": "Airport Closures",
				"Airport_Closure_List": {
					"Airport": {
						"ARPT": "AAA",
						"Reason": "!AAA 09/001 AAA AIRPORT CLSD 2109010000-2109012359",
						"Start": "Dec 13 at 18:00 UTC.",
						"Reopen": "Dec 13 at 23:59 UTC."
					}
				}
			},
			"An airport closure has been issued for Test Airport A (#AAA). The airport is expected to reopen December 12 at 4:59 PM."
		],
		[
			{
				"Name": "Ground Delay Programs",
				"Ground_Delay_List": {
					"Ground_Delay": {
						"ARPT": "AAA",
						"Reason": "TM Initiatives:MIT:VOL"
					}
				}
			},
			"Inbound aircraft to Test Airport A (#AAA) are currently being delayed at their origin airport due to traffic management initiatives. It is currently unknown how long the delays are."
		],
		[
			{
				"Name": "Ground Stop Programs",
				"Ground_Stop_List": {
					"Program": {
						"ARPT": "AAA",
						"Reason": "TM Initiatives:MIT:VOL"
					}
				}
			},
			"Inbound aircraft to Test Airport A (#AAA) are currently being held at their origin airport due to traffic management initiatives. It is currently unknown when operations will resume."
		],
		[
			{
				"Name": "Ground Stop Programs",
				"Ground_Stop_List": {
					"Program": {
						"ARPT": "AAA",
						"Reason": "thunderstorms",
						"End_Time": "11:15 pm EDT"
					}
				}
			},
			"Inbound aircraft to Test Airport A (#AAA) are currently being held at their origin airport due to thunderstorms. Operations are expected to resume at 9:15 PM."
		],
		[
			{
				"Name": "Ground Stop Programs",
				"Ground_Stop_List": {
					"Program": {
						"ARPT": "AAA",
						"Reason": "thunderstorms",
						"End_Time": "11:15 pm EST"
					}
				}
			},
			"Inbound aircraft to Test Airport A (#AAA) are currently being held at their origin airport due to thunderstorms. Operations are expected to resume at 10:15 PM."
		],
		[
			{
				"Name": "Airspace Flow Programs",
				"Airspace_Flow_List": {
					"Airspace_Flow": {
						"CTL_Element": "FCAJX5",
						"Reason": "thunderstorms",
						"AFP_StartTime": 1300,
						"AFP_EndTime": 2359,
						"FCA_StartDateTime": 20240823091500,
						"FCA_EndDateTime": 20240824150000,
						"Avg": "22 minutes",
						"Floor": 180,
						"Ceiling": 600,
						"Line": {
							"Point": [
								{
									"@_Lat": "31.57",
									"@_Long": "-77.45"
								},
								{
									"@_Lat": "30.55",
									"@_Long": "-79.68"
								},
								{
									"@_Lat": "29.97",
									"@_Long": "-82.02"
								},
								{
									"@_Lat": "28.52",
									"@_Long": "-83.9"
								},
								{
									"@_Lat": "25.47",
									"@_Long": "-87.27"
								}
							]
						}
					}
				}
			},
			"An en route delay is currently in effect in the #Florida region due to thunderstorms. This delay applies to aircraft flying between 18,000 and 60,000 feet. Delays are currently averaging 22 minutes."
		],
		[
			{
				"Name": "Airspace Flow Programs",
				"Airspace_Flow_List": {
					"Airspace_Flow": {
						"CTL_Element": "FCAMON",
						"Reason": "other",
						"AFP_StartTime": 2300, // 2300 UTC time
						"AFP_EndTime": 459, // 0459 UTC time
						"FCA_StartDateTime": 20240826160000, // 2024-08-26 16:00 PDT
						"FCA_EndDateTime": 20240827140000, // This one doesn't make sense. 14:00 PDT = 2pm PDT = 9pm UTC = 2100 UTC. Which doesn't match `AFP_EndTime`.
						"Avg": "11 minutes",
						"Floor": 0,
						"Ceiling": 600,
						"Line": {
							"Point": [
								{
									"@_Lat": "52.12",
									"@_Long": "-64.77"
								},
								{
									"@_Lat": "42.18",
									"@_Long": "-61.57"
								},
								{
									"@_Lat": "43.57",
									"@_Long": "-55.77"
								}
							]
						}
					}
				}
			},
			"An en route delay is currently in effect to the northeast of the contiguous United States. This delay applies to aircraft flying below 60,000 feet. Delays are currently averaging 11 minutes."
		]
	];

	tests.forEach(([obj, expected]) => {
		test(`Status.fromRAW(${obj}).toPost() === ${expected}`, async () => {
			const status: Status | Status[] | undefined = Status.fromRaw(obj as any, new OurAirportsDataManager("Test"), new NaturalEarthDataManager("Test"));

			if (status instanceof Array) {
				expect((await Promise.all(status.map((s) => s.toPost())))).toStrictEqual(expected);
			} else if (status === undefined) {
				expect(status).toStrictEqual(expected);
			} else {
				expect(await status.toPost()).toStrictEqual(expected);
			}
		});
	});
});

describe("Status.fromRAW().toEndedPost()", () => {
	const tests = [
		[
			{},
			undefined
		],
		[
			{
				"Name": "General Arrival/Departure Delay Info",
				"Arrival_Departure_Delay_List": {
					"Delay": {
						"ARPT": "AAA",
						"Reason": "TM Initiatives:MIT:VOL",
						"Arrival_Departure": {
							"@_Type": "Departure",
							"Trend": "Increasing",
							"Min": "46 minutes",
							"Max": "1 hour",
						},
					}
				}
			},
			"The departure delay for Test Airport A (#AAA) is no longer in effect."
		],
		[
			{
				"Name": "General Arrival/Departure Delay Info",
				"Arrival_Departure_Delay_List": {
					"Delay": {
						"ARPT": "AAA",
						"Reason": "TM Initiatives:MIT:VOL",
						"Arrival_Departure": {
							"@_Type": "Arrival",
							"Trend": "Increasing",
							"Min": "46 minutes",
							"Max": "1 hour",
						},
					}
				}
			},
			"The arrival delay for Test Airport A (#AAA) is no longer in effect."
		],
		[
			{
				"Name": "Airport Closures",
				"Airport_Closure_List": {
					"Airport": {
						"ARPT": "AAA",
						"Reason": "!AAA 09/001 AAA AIRPORT CLSD 2109010000-2109012359",
						"Start": "Dec 13 at 18:00 UTC.",
						"Reopen": "Dec 13 at 23:59 UTC."
					}
				}
			},
			"Test Airport A (#AAA) has reopened."
		],
		[
			{
				"Name": "Ground Delay Programs",
				"Ground_Delay_List": {
					"Ground_Delay": {
						"ARPT": "AAA",
						"Reason": "TM Initiatives:MIT:VOL"
					}
				}
			},
			"Inbound aircraft to Test Airport A (#AAA) are no longer being delayed."
		],
		[
			{
				"Name": "Ground Stop Programs",
				"Ground_Stop_List": {
					"Program": {
						"ARPT": "AAA",
						"Reason": "TM Initiatives:MIT:VOL"
					}
				}
			},
			"Inbound operations to Test Airport A (#AAA) have resumed."
		]
	];

	tests.forEach(([obj, expected]) => {
		test(`Status.fromRAW(${obj}).toEndedPost() === ${expected}`, async () => {
			const status: Status | Status[] | undefined = Status.fromRaw(obj as any, new OurAirportsDataManager("Test"), new NaturalEarthDataManager("Test"));

			if (status instanceof Array) {
				expect((await Promise.all(status.map((s) => s.toEndedPost())))).toStrictEqual(expected);
			} else if (status === undefined) {
				expect(status).toStrictEqual(expected);
			} else {
				expect(await status.toEndedPost()).toStrictEqual(expected);
			}
		});
	});
});

describe("Status.updatedPost()", () => {
	const tests = [
		[
			{
				"Name": "Ground Stop Programs",
				"Ground_Stop_List": {
					"Program": {
						"ARPT": "AAA",
						"Reason": "thunderstorms",
						"End_Time": "10:15 pm EDT"
					}
				}
			},
			{
				"Name": "Ground Stop Programs",
				"Ground_Stop_List": {
					"Program": {
						"ARPT": "AAA",
						"Reason": "thunderstorms",
						"End_Time": "11:15 pm EDT"
					}
				}
			},
			"The ground stop at Test Airport A (#AAA) has been extended by 1 hour to 9:15 PM."
		],
		[
			{
				"Name": "Ground Stop Programs",
				"Ground_Stop_List": {
					"Program": {
						"ARPT": "AAA",
						"Reason": "thunderstorms",
						"End_Time": "10:15 pm EDT"
					}
				}
			},
			{
				"Name": "Ground Stop Programs",
				"Ground_Stop_List": {
					"Program": {
						"ARPT": "AAA",
						"Reason": "thunderstorms",
						"End_Time": "11:30 pm EDT"
					}
				}
			},
			"The ground stop at Test Airport A (#AAA) has been extended by 1 hour and 15 minutes to 9:30 PM."
		]
	];

	tests.forEach(([oldJSON, newJSON, expected]) => {
		test(`Status.updatedPost() === ${expected}`, async () => {
			const oldObj: any = Status.fromRaw(oldJSON as any, new OurAirportsDataManager("Test"), new NaturalEarthDataManager("Test"));
			const newObj: any = Status.fromRaw(newJSON as any, new OurAirportsDataManager("Test"), new NaturalEarthDataManager("Test"));

			expect(await Status.updatedPost(oldObj, newObj)).toStrictEqual(expected);
		});
	});
});
