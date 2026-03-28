import { Platform } from "react-native";
import * as Device from "expo-device";
import { getApiBaseUrl } from "./api-base-url";

const MEDIA_PUBLIC_BASE_URL = String(process.env.EXPO_PUBLIC_MEDIA_PUBLIC_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");

/**
 * Feed/API may return `http://localhost:8080/...` (or :3000). On a real phone, localhost is the device,
 * so AVPlayer cannot load. Rewrite loopback host to the same machine as the API (LAN IP from
 * EXPO_PUBLIC_API_BASE_URL) or 10.0.2.2 on Android emulator. Preserves port (e.g. 8080 vs 3000).
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

    const androidEmulator = Platform.OS === "android" && !Device.isDevice;
    const physical = Device.isDevice;

    if (!androidEmulator && !physical) {
      return url;
    }

    let targetHost: string | null = null;
    if (androidEmulator) {
      targetHost = "10.0.2.2";
    } else {
      try {
        const apiUrl = new URL(getApiBaseUrl());
        if (apiUrl.hostname !== "localhost" && apiUrl.hostname !== "127.0.0.1") {
          targetHost = apiUrl.hostname;
        }
      } catch {
        /* ignore */
      }
    }

    if (!targetHost) {
      return url;
    }

    parsed.hostname = targetHost;
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
