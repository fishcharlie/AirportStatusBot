const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 2000;

/**
 * Fetches a URL, retrying on failure with exponential backoff.
 * Returns the Response on success, or null if all attempts fail.
 */
export async function fetchWithRetry(url: string, options: RequestInit = {}, maxAttempts: number = DEFAULT_MAX_ATTEMPTS): Promise<Response | null> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = await fetch(url, options);
			return response;
		} catch (e) {
			lastError = e;
			if (attempt < maxAttempts) {
				const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
				console.warn(`Fetch attempt ${attempt}/${maxAttempts} failed for ${url}. Retrying in ${delayMs}ms...`);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}
	}

	console.error(`All ${maxAttempts} fetch attempts failed for ${url}.`);
	console.error(lastError);
	return null;
}
