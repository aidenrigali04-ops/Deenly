import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000/api/v1";

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
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(timeoutMs: number) {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    const response = await fetchWithTimeout(
      `${API_BASE_URL}/auth/refresh`,
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
      clearTokens();
      return null;
    }

    const payload = await response.json().catch(() => null);
    const accessToken = payload?.tokens?.accessToken;
    const newRefreshToken = payload?.tokens?.refreshToken;
    if (!accessToken || !newRefreshToken) {
      clearTokens();
      return null;
    }

    setTokens(accessToken, newRefreshToken);
    return accessToken as string;
  })()
    .catch(() => {
      clearTokens();
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (typeof window !== "undefined" && options.method !== "GET" && navigator && !navigator.onLine) {
    throw new ApiError("You appear to be offline. Please reconnect and try again.", 0);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (options.auth) {
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const method = options.method || "GET";
  const timeoutMs = options.timeoutMs ?? 8000;
  const retries = options.retries ?? (method === "GET" ? 2 : 1);
  const requestInit: RequestInit = {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  };

  let lastError: Error | null = null;
  let didRefresh = false;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, requestInit, timeoutMs);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && options.auth && !didRefresh) {
          didRefresh = true;
          const refreshedToken = await refreshAccessToken(timeoutMs);
          if (refreshedToken) {
            headers.Authorization = `Bearer ${refreshedToken}`;
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
  throw new ApiError("Network request failed. Please try again.", 0);
}
