import NetInfo from "@react-native-community/netinfo";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { getApiBaseUrl } from "./api-base-url";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./storage";

let cachedApiBaseUrl: string | null = null;
function apiBaseUrl(): string {
  if (__DEV__) {
    return getApiBaseUrl();
  }
  cachedApiBaseUrl ??= getApiBaseUrl();
  return cachedApiBaseUrl;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
  retries?: number;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let refreshInFlight: Promise<string | null> | null = null;

async function isOffline() {
  const state = await NetInfo.fetch();
  if (state.isConnected === false) {
    return true;
  }
  // `isInternetReachable === false` is common on LAN-only dev (API on Mac, no “public internet” probe)
  // and breaks login/register/posts. Only use it outside dev, and never when it would block local APIs.
  if (__DEV__) {
    return false;
  }
  if (state.isInternetReachable === false) {
    return true;
  }
  return false;
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function refreshAccessToken(timeoutMs: number) {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    const response = await fetchWithTimeout(
      `${apiBaseUrl()}/auth/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refreshToken })
      },
      timeoutMs
    );

    if (!response.ok) {
      await clearTokens();
      return null;
    }

    const payload = await response.json().catch(() => null);
    const accessToken = payload?.tokens?.accessToken;
    const newRefreshToken = payload?.tokens?.refreshToken;
    if (!accessToken || !newRefreshToken) {
      await clearTokens();
      return null;
    }

    await setTokens(accessToken, newRefreshToken);
    return accessToken as string;
  })()
    .catch(async () => {
      await clearTokens();
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method || "GET";
  const timeoutMs = options.timeoutMs ?? 8000;
  const retries = options.retries ?? (method === "GET" ? 2 : 1);

  if (method !== "GET" && (await isOffline())) {
    throw new ApiError("You are offline. Please reconnect and try again.", 0);
  }

  const execute = async (authToken?: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (options.auth) {
      const token = authToken || (await getAccessToken());
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const requestInit: RequestInit = {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    };

    let didRefresh = false;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetchWithTimeout(`${apiBaseUrl()}${path}`, requestInit, timeoutMs);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401 && options.auth && !didRefresh) {
            didRefresh = true;
            const token = await refreshAccessToken(timeoutMs);
            if (token) {
              headers.Authorization = `Bearer ${token}`;
              continue;
            }
          }

          const apiError = new ApiError(payload.message || "Request failed", response.status);
          if (response.status >= 500 && attempt < retries) {
            await sleep(250 * 2 ** attempt);
            continue;
          }
          throw apiError;
        }
        return payload as T;
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries) {
          await sleep(250 * 2 ** attempt);
          continue;
        }
      }
    }

    if (lastError instanceof ApiError) {
      throw lastError;
    }
    const base = apiBaseUrl();
    const networkish =
      lastError?.name === "AbortError" ||
      lastError?.name === "TypeError" ||
      /network|failed to fetch|aborted/i.test(String(lastError?.message || ""));
    let hint = "";
    if (__DEV__ && networkish) {
      hint = ` Cannot reach API at ${base}.`;
      const onDevice = Device.isDevice;
      const stillLocal =
        onDevice && (base.includes("localhost") || base.includes("127.0.0.1"));
      if (stillLocal) {
        hint +=
          " On a physical device, set EXPO_PUBLIC_API_BASE_URL to http://<your-computer-LAN-IP>:3000/api/v1 in mobile/.env, then npx expo start -c.";
      } else if (onDevice && Platform.OS === "ios") {
        hint +=
          " Use the same Wi‑Fi as your computer, bind the backend to 0.0.0.0 (not 127.0.0.1), and prefer Expo LAN mode over Tunnel for local APIs.";
      } else {
        hint +=
          " Start the backend on port 3000, check EXPO_PUBLIC_API_BASE_URL in mobile/.env, and restart Metro after env changes.";
      }
    }
    throw new ApiError(`Network request failed. Please try again.${hint}`, 0);
  };

  return execute();
}
