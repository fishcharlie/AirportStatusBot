export function parseHashtags(raw: string): string[] {
	return raw.split(" ").filter((word) => word.startsWith("#")).map((word) => word.substring(1).replace(/\W+/g, ""));
}
