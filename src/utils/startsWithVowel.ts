export function startsWithVowel(str: string): boolean {
	str = str.trim();

	if (!str) {
		return false;
	}

	return ["a", "e", "i", "o", "u"].includes(str[0].toLowerCase());
}
