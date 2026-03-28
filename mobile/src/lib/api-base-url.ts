import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";

const DEFAULT_PORT = 3000;
const API_PREFIX = "/api/v1";

function stripTrailingSlashes(url: string) {
  return url.replace(/\/+$/, "");
}

/** Fixes common .env typos (e.g. https;// or localhost.3000). */
function normalizeEnvApiBaseUrl(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^https;\/\//i, "http://");
  s = s.replace(/^http;\/\//i, "http://");
  s = s.replace(/\blocalhost\.(\d{2,5})\b/g, "localhost:$1");
  return s;
}

function parseDevHost(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    if (trimmed.includes("://")) {
      const hostname = new URL(trimmed).hostname;
      return hostname || null;
    }
  } catch {
    /* fall through */
  }
  const host = trimmed.split(":")[0]?.trim();
  return host || null;
}

/**
 * Tunnel / edge hosts from Expo CLI reach Metro, not your local :3000 API.
 * Using them for API base causes "network failed" on device.
 */
function isLikelyReachableDevApiHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h || h === "localhost" || h === "127.0.0.1") {
    return false;
  }
  if (h.includes("exp.direct") || h.endsWith(".exp.direct")) {
    return false;
  }
  if (h.includes("ngrok") || h.includes("trycloudflare") || h.includes("loca.lt")) {
    return false;
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h)) {
    return true;
  }
  if (h.endsWith(".local")) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    return true;
  }
  return false;
}

/**
 * Host where Metro / dev server runs (Mac LAN IP on a physical device).
 * Expo SDK 50+ often puts this on `expoConfig.hostUri`, not `debuggerHost`.
 */
/** Used only when `EXPO_PUBLIC_API_BASE_URL` is unset (dev): derive LAN from Expo. */
function devMachineHostFromBundler(): string | null {
  const expoGo = Constants.expoGoConfig as { debuggerHost?: string } | null;
  const classicManifest = Constants.manifest as { debuggerHost?: string } | null;
  const expoConfig = Constants.expoConfig as { hostUri?: string } | null;
  const manifest2 = Constants.manifest2 as
    | {
        extra?: {
          expoClient?: { hostUri?: string };
          expoGo?: { debuggerHost?: string };
        };
      }
    | null;

  const candidates: Array<string | undefined> = [
    expoGo?.debuggerHost,
    classicManifest?.debuggerHost,
    expoConfig?.hostUri,
    manifest2?.extra?.expoGo?.debuggerHost,
    manifest2?.extra?.expoClient?.hostUri,
  ];

  for (const raw of candidates) {
    const host = parseDevHost(raw);
    if (host && isLikelyReachableDevApiHost(host)) {
      return host;
    }
  }

  return null;
}

function rewriteLocalhostUrl(url: string, replacementHost: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      parsed.hostname = replacementHost;
      return parsed.toString().replace(/\/+$/, "");
    }
  } catch {
    /* ignore */
  }
  return url;
}

/**
 * Resolves the backend base URL (e.g. http://192.168.1.10:3000/api/v1).
 *
 * When `EXPO_PUBLIC_API_BASE_URL` is set, that string (after normalization) is the API base for
 * all requests — no separate LAN env. On a **physical device** use a URL the phone can reach
 * (e.g. `http://192.168.x.x:3000/api/v1`); `localhost` only works on simulator / desktop.
 *
 * When unset, dev fallbacks: Android emulator → 10.0.2.2; physical device → Expo LAN host if valid.
 *
 * Android emulator + `EXPO_PUBLIC_API_BASE_URL` with localhost: still mapped to 10.0.2.2.
 */
export function getApiBaseUrl(): string {
  const fromEnvRaw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const fromEnv = fromEnvRaw ? normalizeEnvApiBaseUrl(fromEnvRaw) : "";
  const fallback = `http://localhost:${DEFAULT_PORT}${API_PREFIX}`;
  const androidEmulator = Platform.OS === "android" && !Device.isDevice;
  const iosNeedsLanHost = Platform.OS === "ios" && Device.isDevice;
  const androidNeedsLanHost = Platform.OS === "android" && Device.isDevice;

  if (!fromEnv) {
    if (!__DEV__) {
      return stripTrailingSlashes(fallback);
    }
    if (androidEmulator) {
      return stripTrailingSlashes(`http://10.0.2.2:${DEFAULT_PORT}${API_PREFIX}`);
    }
    if (iosNeedsLanHost || androidNeedsLanHost) {
      const lan = devMachineHostFromBundler();
      if (lan) {
        return stripTrailingSlashes(`http://${lan}:${DEFAULT_PORT}${API_PREFIX}`);
      }
    }
    return stripTrailingSlashes(fallback);
  }

  let base = stripTrailingSlashes(fromEnv);

  if (__DEV__ && androidEmulator && (base.includes("localhost") || base.includes("127.0.0.1"))) {
    base = rewriteLocalhostUrl(base, "10.0.2.2");
  }

  const resolved = stripTrailingSlashes(base);
  if (
    __DEV__ &&
    (iosNeedsLanHost || androidNeedsLanHost) &&
    (resolved.includes("localhost") || resolved.includes("127.0.0.1"))
  ) {
    console.warn(
      "[Deenly] API base is still localhost on a physical device — the phone cannot reach your Mac. " +
        "Set EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:3000/api/v1 (ipconfig getifaddr en0), then npx expo start -c. " +
        "iOS dev builds: NSAllowsLocalNetworking in app.json. Backend listens on 0.0.0.0 by default."
    );
  }

  return resolved;
}
