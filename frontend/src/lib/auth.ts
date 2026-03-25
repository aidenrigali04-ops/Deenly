import { apiRequest } from "@/lib/api";
import { clearTokens, getRefreshToken, setTokens } from "@/lib/storage";
import type { AuthResponse, UserSession } from "@/types";

export async function signup(input: {
  email: string;
  username: string;
  password: string;
  displayName: string;
}) {
  const result = await apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: input
  });
  setTokens(result.tokens.accessToken, result.tokens.refreshToken);
  return result;
}

export async function login(input: { email: string; password: string }) {
  const result = await apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: input
  });
  setTokens(result.tokens.accessToken, result.tokens.refreshToken);
  return result;
}

export async function loginWithGoogle(input: { accessToken: string }) {
  const result = await apiRequest<AuthResponse>("/auth/google", {
    method: "POST",
    body: input
  });
  setTokens(result.tokens.accessToken, result.tokens.refreshToken);
  return result;
}

export async function fetchSessionMe() {
  const result = await apiRequest<{ user: UserSession }>("/auth/session/me", {
    auth: true
  });
  return result.user;
}

export async function refreshSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error("Missing refresh token");
  }
  const result = await apiRequest<{ tokens: { accessToken: string; refreshToken: string } }>(
    "/auth/refresh",
    {
      method: "POST",
      body: { refreshToken }
    }
  );
  setTokens(result.tokens.accessToken, result.tokens.refreshToken);
}

export async function logout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await apiRequest("/auth/logout", {
      method: "POST",
      body: { refreshToken }
    }).catch(() => undefined);
  }
  clearTokens();
}
