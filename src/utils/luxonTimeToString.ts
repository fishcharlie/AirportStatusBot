import * as luxon from "luxon";

export function luxonTimeToString(ts: luxon.DateTime<true> | luxon.DateTime<false>): string {
	const res = ts.toFormat("t").replaceAll("\u202F", " ");

	if (res === "12:00 AM") {
		return "midnight";
	} else if (res === "12:00 PM") {
		return "noon";
	} else {
		return res;
	}
}
