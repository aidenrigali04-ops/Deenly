import { apiRequest } from "./api";
import { clearTokens, getRefreshToken, setTokens } from "./storage";
import type { AuthResponse, UserSession } from "../types";

export async function signup(payload: {
  email: string;
  username: string;
  password: string;
  displayName: string;
}) {
  const response = await apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: payload
  });
  await setTokens(response.tokens.accessToken, response.tokens.refreshToken);
  return response.user;
}

export async function login(payload: { email: string; password: string }) {
  const response = await apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: payload
  });
  await setTokens(response.tokens.accessToken, response.tokens.refreshToken);
  return response.user;
}

export async function fetchSessionMe() {
  const response = await apiRequest<{ user: UserSession }>("/auth/session/me", { auth: true });
  return response.user;
}

export async function refreshSession() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  const response = await apiRequest<{ tokens: { accessToken: string; refreshToken: string } }>(
    "/auth/refresh",
    {
      method: "POST",
      body: { refreshToken }
    }
  );
  await setTokens(response.tokens.accessToken, response.tokens.refreshToken);
  return response.tokens;
}

export async function logout() {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    await apiRequest("/auth/logout", {
      method: "POST",
      body: { refreshToken }
    }).catch(() => null);
  }
  await clearTokens();
}
