import { fetchWithRetry, parseRetryAfterMs } from "./fetchWithRetry";

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Speed up tests by using fake timers
jest.useFakeTimers();

afterEach(() => {
	jest.clearAllMocks();
});

// --- parseRetryAfterMs ---

describe("parseRetryAfterMs", () => {
	test("returns null for null input", () => {
		expect(parseRetryAfterMs(null)).toBeNull();
	});

	test("parses integer seconds", () => {
		expect(parseRetryAfterMs("120")).toBe(120_000);
	});

	test("parses zero seconds", () => {
		expect(parseRetryAfterMs("0")).toBe(0);
	});

	test("parses HTTP-date in the future", () => {
		const futureDate = new Date(Date.now() + 5000);
		const result = parseRetryAfterMs(futureDate.toUTCString());
		expect(result).toBeGreaterThan(0);
		expect(result).toBeLessThanOrEqual(5000);
	});

	test("returns 0 for HTTP-date in the past", () => {
		const pastDate = new Date(Date.now() - 5000);
		expect(parseRetryAfterMs(pastDate.toUTCString())).toBe(0);
	});

	test("returns null for unparseable string", () => {
		expect(parseRetryAfterMs("not-a-date-or-number")).toBeNull();
	});
});

// --- fetchWithRetry ---

function makeMockResponse(status: number, headers: Record<string, string> = {}): Response {
	return {
		status,
		headers: {
			get: (key: string) => headers[key.toLowerCase()] ?? null,
		},
	} as unknown as Response;
}

test("returns response immediately on first success", async () => {
	const mockResponse = makeMockResponse(200);
	mockFetch.mockResolvedValueOnce(mockResponse);

	const promise = fetchWithRetry("https://example.com", {}, 3);
	await jest.runAllTimersAsync();
	const result = await promise;

	expect(result).toBe(mockResponse);
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

test("returns non-retriable 4xx response immediately without retrying", async () => {
	const mockResponse = makeMockResponse(404);
	mockFetch.mockResolvedValueOnce(mockResponse);

	const promise = fetchWithRetry("https://example.com", {}, 3);
	await jest.runAllTimersAsync();
	const result = await promise;

	expect(result).toBe(mockResponse);
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

test("retries on network error and succeeds on second attempt", async () => {
	const mockResponse = makeMockResponse(200);
	mockFetch.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce(mockResponse);

	const promise = fetchWithRetry("https://example.com", {}, 3);
	await jest.runAllTimersAsync();
	const result = await promise;

	expect(result).toBe(mockResponse);
	expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("retries on 429 and succeeds on second attempt", async () => {
	const rateLimited = makeMockResponse(429);
	const ok = makeMockResponse(200);
	mockFetch.mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(ok);

	const promise = fetchWithRetry("https://example.com", {}, 3);
	await jest.runAllTimersAsync();
	const result = await promise;

	expect(result).toBe(ok);
	expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("retries on 503 and succeeds on second attempt", async () => {
	const serverError = makeMockResponse(503);
	const ok = makeMockResponse(200);
	mockFetch.mockResolvedValueOnce(serverError).mockResolvedValueOnce(ok);

	const promise = fetchWithRetry("https://example.com", {}, 3);
	await jest.runAllTimersAsync();
	const result = await promise;

	expect(result).toBe(ok);
	expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("respects Retry-After seconds header on 429", async () => {
	const rateLimited = makeMockResponse(429, { "retry-after": "30" });
	const ok = makeMockResponse(200);
	mockFetch.mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(ok);

	const setTimeoutSpy = jest.spyOn(global, "setTimeout");

	const promise = fetchWithRetry("https://example.com", {}, 3);
	await jest.runAllTimersAsync();
	await promise;

	const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
	expect(delays).toContain(30_000);
});

test("respects Retry-After HTTP-date header on 429", async () => {
	const futureDate = new Date(Date.now() + 10_000).toUTCString();
	const rateLimited = makeMockResponse(429, { "retry-after": futureDate });
	const ok = makeMockResponse(200);
	mockFetch.mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(ok);

	const setTimeoutSpy = jest.spyOn(global, "setTimeout");

	const promise = fetchWithRetry("https://example.com", {}, 3);
	await jest.runAllTimersAsync();
	await promise;

	const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
	expect(delays.some((d) => (d as number) > 0 && (d as number) <= 10_000)).toBe(true);
});

test("returns null after all attempts fail", async () => {
	mockFetch.mockRejectedValue(new Error("Network error"));

	const promise = fetchWithRetry("https://example.com", {}, 3);
	await jest.runAllTimersAsync();
	const result = await promise;

	expect(result).toBeNull();
	expect(mockFetch).toHaveBeenCalledTimes(3);
});

test("returns null after all attempts return retriable status", async () => {
	mockFetch.mockResolvedValue(makeMockResponse(429));

	const promise = fetchWithRetry("https://example.com", {}, 3);
	await jest.runAllTimersAsync();
	const result = await promise;

	expect(result).toBeNull();
	expect(mockFetch).toHaveBeenCalledTimes(3);
});

test("does not retry more than maxAttempts times", async () => {
	mockFetch.mockRejectedValue(new Error("Network error"));

	const promise = fetchWithRetry("https://example.com", {}, 2);
	await jest.runAllTimersAsync();
	await promise;

	expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("passes options to fetch", async () => {
	const mockResponse = makeMockResponse(200);
	mockFetch.mockResolvedValueOnce(mockResponse);

	const options = { method: "GET", headers: { "User-Agent": "test" } };
	const promise = fetchWithRetry("https://example.com", options, 3);
	await jest.runAllTimersAsync();
	await promise;

	expect(mockFetch).toHaveBeenCalledWith("https://example.com", options);
});
