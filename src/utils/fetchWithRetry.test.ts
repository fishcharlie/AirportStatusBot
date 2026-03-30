import { fetchWithRetry } from "./fetchWithRetry";

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Speed up tests by using fake timers
jest.useFakeTimers();

afterEach(() => {
	jest.clearAllMocks();
});

test("returns response immediately on first success", async () => {
	const mockResponse = { status: 200 } as Response;
	mockFetch.mockResolvedValueOnce(mockResponse);

	const promise = fetchWithRetry("https://example.com", {}, 3);
	await jest.runAllTimersAsync();
	const result = await promise;

	expect(result).toBe(mockResponse);
	expect(mockFetch).toHaveBeenCalledTimes(1);
});

test("retries on failure and succeeds on second attempt", async () => {
	const mockResponse = { status: 200 } as Response;
	mockFetch.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce(mockResponse);

	const promise = fetchWithRetry("https://example.com", {}, 3);
	await jest.runAllTimersAsync();
	const result = await promise;

	expect(result).toBe(mockResponse);
	expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("returns null after all attempts fail", async () => {
	mockFetch.mockRejectedValue(new Error("Network error"));

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
	const mockResponse = { status: 200 } as Response;
	mockFetch.mockResolvedValueOnce(mockResponse);

	const options = { method: "GET", headers: { "User-Agent": "test" } };
	const promise = fetchWithRetry("https://example.com", options, 3);
	await jest.runAllTimersAsync();
	await promise;

	expect(mockFetch).toHaveBeenCalledWith("https://example.com", options);
});
