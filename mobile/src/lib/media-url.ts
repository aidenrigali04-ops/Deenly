import { getApiBaseUrl, getDevLoopbackRewriteHost } from "./api-base-url";

const MEDIA_PUBLIC_BASE_URL = String(process.env.EXPO_PUBLIC_MEDIA_PUBLIC_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");

/**
 * Feed/API may return `http://localhost:8080/...` (or :3000). On a real phone, localhost is the device,
 * so AVPlayer cannot load. Rewrite loopback host to the same machine as the API (LAN IP from
 * EXPO_PUBLIC_API_BASE_URL) or Expo’s LAN host when the API env is still localhost. Preserves port.
 */
function rewriteLoopbackAbsoluteUrl(url: string): string {
  if (!__DEV__) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      return url;
    }
    const targetHost = getDevLoopbackRewriteHost();
    if (!targetHost) {
      return url;
    }
    parsed.hostname = targetHost;
    // Backend .env.example used :8080 while the API listens on PORT (3000); DB rows may still have :8080.
    try {
      const apiUrl = new URL(getApiBaseUrl());
      if (parsed.port === "8080" && apiUrl.port === "3000") {
        parsed.port = "3000";
      }
    } catch {
      /* ignore */
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function resolveMediaUrl(mediaUrl: string | null | undefined) {
  const raw = String(mediaUrl || "").trim();
  if (!raw) {
    return null;
  }
  let resolved: string;
  if (/^https?:\/\//i.test(raw)) {
    resolved = raw;
  } else {
    const keyLike = raw.replace(/^\/+/, "");
    if (!keyLike || !MEDIA_PUBLIC_BASE_URL) {
      return null;
    }
    resolved = `${MEDIA_PUBLIC_BASE_URL}/${keyLike}`;
  }
  return rewriteLoopbackAbsoluteUrl(resolved);
}
