import { getAccessToken } from "@/lib/storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000/api/v1";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
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
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, requestInit, timeoutMs);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
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
