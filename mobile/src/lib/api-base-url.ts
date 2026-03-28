import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";

const DEFAULT_PORT = 3000;
const API_PREFIX = "/api/v1";

function stripTrailingSlashes(url: string) {
  return url.replace(/\/+$/, "");
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
function devMachineHostFromBundler(): string | null {
  const manual = parseDevHost(process.env.EXPO_PUBLIC_DEV_MACHINE_HOST?.trim());
  if (manual && manual !== "localhost" && manual !== "127.0.0.1") {
    return manual;
  }

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
 * - Honors `EXPO_PUBLIC_API_BASE_URL` when set.
 * - In dev, rewrites localhost → Android emulator (10.0.2.2) or Metro LAN IP on physical devices.
 * - iOS Simulator keeps localhost (LAN often fails routing/firewall).
 * - If auto-detection fails, set EXPO_PUBLIC_DEV_MACHINE_HOST (e.g. 192.168.1.10) and restart Metro.
 * - Tunnel mode (exp.direct, etc.) is ignored for API host — it only reaches Metro, not :3000.
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const fallback = `http://localhost:${DEFAULT_PORT}${API_PREFIX}`;
  const iosNeedsLanHost = Platform.OS === "ios" && Device.isDevice;
  const androidEmulator = Platform.OS === "android" && !Device.isDevice;
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

  if (__DEV__ && (base.includes("localhost") || base.includes("127.0.0.1"))) {
    if (androidEmulator) {
      base = rewriteLocalhostUrl(base, "10.0.2.2");
    } else if (iosNeedsLanHost || androidNeedsLanHost) {
      const lan = devMachineHostFromBundler();
      if (lan) {
        base = rewriteLocalhostUrl(base, lan);
      }
    }
  }

  return stripTrailingSlashes(base);
}
