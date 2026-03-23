const ACCESS_KEY = "deenly_access_token";
const REFRESH_KEY = "deenly_refresh_token";

export function setTokens(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function getAccessToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return localStorage.getItem(ACCESS_KEY) || "";
}

export function getRefreshToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return localStorage.getItem(REFRESH_KEY) || "";
}

export function clearTokens() {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}
