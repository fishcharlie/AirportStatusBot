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
		]
	];

	tests.forEach(([obj, expected]) => {
		test(`Status.fromRAW(${obj}).toPost() === ${expected}`, () => {
			const status: Status | Status[] | undefined = Status.fromRaw(obj as any);

			if (status instanceof Array) {
				expect(status.map((s) => s.toPost())).toStrictEqual(expected);
			} else if (status === undefined) {
				expect(status).toStrictEqual(expected);
			} else {
				expect(status.toPost()).toStrictEqual(expected);
			}
		});
	});
});
