const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 2000;

const RETRIABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Parses a Retry-After header value into a delay in milliseconds.
 * Supports both integer seconds ("120") and HTTP-date formats ("Fri, 01 Jan 2027 00:00:00 GMT").
 * Returns null if the header is absent or unparseable.
 */
export function parseRetryAfterMs(retryAfter: string | null): number | null {
	if (!retryAfter) {
		return null;
	}

	const seconds = Number(retryAfter);
	if (!isNaN(seconds) && seconds >= 0) {
		return seconds * 1000;
	}

	const date = new Date(retryAfter);
	if (!isNaN(date.getTime())) {
		const delayMs = date.getTime() - Date.now();
		return delayMs > 0 ? delayMs : 0;
	}

	return null;
}

/**
 * Fetches a URL, retrying on network errors and retriable HTTP status codes
 * (429, 500, 502, 503, 504) with exponential backoff.
 * Respects the Retry-After header on 429 responses.
 * Non-retriable responses (2xx, non-429 4xx) are returned immediately.
 * Returns null if all attempts fail.
 */
export async function fetchWithRetry(url: string, options: RequestInit = {}, maxAttempts: number = DEFAULT_MAX_ATTEMPTS): Promise<Response | null> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = await fetch(url, options);

			if (!RETRIABLE_STATUS_CODES.has(response.status)) {
				return response;
			}

			lastError = new Error(`HTTP ${response.status}`);

			if (attempt < maxAttempts) {
				let delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);

				const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
				if (retryAfterMs !== null) {
					delayMs = retryAfterMs;
					console.warn(`Fetch attempt ${attempt}/${maxAttempts} got ${response.status} for ${url}. Respecting Retry-After: retrying in ${delayMs}ms...`);
				} else {
					console.warn(`Fetch attempt ${attempt}/${maxAttempts} got ${response.status} for ${url}. Retrying in ${delayMs}ms...`);
				}

				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
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
