/* eslint-disable import/first -- jest.mock() must run before importing modules that depend on mocks */

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn()
}));

jest.mock("expo-device", () => ({
  isDevice: false
}));

jest.mock("../src/lib/api-base-url", () => ({
  getApiBaseUrl: jest.fn(() => "http://test.api/api/v1")
}));

jest.mock("../src/lib/storage", () => ({
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  setTokens: jest.fn(),
  clearTokens: jest.fn()
}));

import NetInfo from "@react-native-community/netinfo";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "../src/lib/storage";
import { apiRequest } from "../src/lib/api";

function jsonResponse(body: unknown, status = 200): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body)
  };
}

describe("apiRequest", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.mocked(NetInfo.fetch).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true
    } as Awaited<ReturnType<typeof NetInfo.fetch>>);
    jest.mocked(getAccessToken).mockResolvedValue(null);
    jest.mocked(getRefreshToken).mockResolvedValue(null);
    jest.mocked(setTokens).mockResolvedValue(undefined);
    jest.mocked(clearTokens).mockResolvedValue(undefined);
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("returns JSON payload on 200 GET", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ id: 42 }));

    const data = await apiRequest<{ id: number }>("/posts/1");

    expect(data).toEqual({ id: 42 });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://test.api/api/v1/posts/1",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("serializes body on POST", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ ok: true }));

    await apiRequest("/items", { method: "POST", body: { a: 1 } });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://test.api/api/v1/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ a: 1 })
      })
    );
  });

  it("sends Bearer token when auth is true and token exists", async () => {
    jest.mocked(getAccessToken).mockResolvedValue("token-abc");
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}));

    await apiRequest("/me", { auth: true });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-abc"
        })
      })
    );
  });

  it("on 401 with auth, refreshes once and retries with new access token", async () => {
    jest.mocked(getAccessToken).mockResolvedValue("old-access");
    jest.mocked(getRefreshToken).mockResolvedValue("refresh-xyz");

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          tokens: { accessToken: "new-access", refreshToken: "new-refresh" }
        })
      )
      .mockResolvedValueOnce(jsonResponse({ profile: "ok" }));

    const data = await apiRequest<{ profile: string }>("/users/me", { auth: true });

    expect(data).toEqual({ profile: "ok" });
    expect(setTokens).toHaveBeenCalledWith("new-access", "new-refresh");
    expect(global.fetch).toHaveBeenCalledTimes(3);
    const refreshCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(refreshCall[0]).toBe("http://test.api/api/v1/auth/refresh");
    expect(JSON.parse((refreshCall[1] as RequestInit).body as string)).toEqual({
      refreshToken: "refresh-xyz"
    });
  });

  it("on 401, when refresh fails, clears tokens and throws ApiError from the original request", async () => {
    jest.mocked(getAccessToken).mockResolvedValue("old-access");
    jest.mocked(getRefreshToken).mockResolvedValue("refresh-xyz");

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: "invalid refresh" }, 401));

    // With default GET retries, thrown ApiError is caught and retried; pin retries to assert immediate failure.
    await expect(apiRequest("/users/me", { auth: true, retries: 0 })).rejects.toMatchObject({
      status: 401,
      message: "expired"
    });

    expect(clearTokens).toHaveBeenCalled();
  });

  it("throws ApiError with backend message on 4xx", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ message: "Not allowed" }, 403));

    await expect(apiRequest("/x")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 403,
        message: "Not allowed"
      })
    );
  });

  it("retries after 5xx then succeeds when retries allow", async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ healed: true }));

    const p = apiRequest<{ healed: boolean }>("/unstable", { retries: 1 });
    await jest.advanceTimersByTimeAsync(500);
    const data = await p;

    expect(data).toEqual({ healed: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("retries transient fetch failure then succeeds", async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const p = apiRequest("/flaky", { retries: 1 });
    await jest.advanceTimersByTimeAsync(500);
    const data = await p;

    expect(data).toEqual({ ok: true });
    jest.useRealTimers();
  });

  it("throws offline ApiError for non-GET when disconnected", async () => {
    jest.mocked(NetInfo.fetch).mockResolvedValue({
      isConnected: false,
      isInternetReachable: false
    } as Awaited<ReturnType<typeof NetInfo.fetch>>);

    await expect(apiRequest("/x", { method: "POST", body: {} })).rejects.toEqual(
      expect.objectContaining({
        status: 0,
        message: "You are offline. Please reconnect and try again."
      })
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
