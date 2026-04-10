import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import {
  isLikelyReachableDevApiHost,
  normalizeEnvApiBaseUrl,
  parseDevHost,
  rewriteLocalhostUrl,
  stripTrailingSlashes
} from "./api-url-helpers";

const DEFAULT_PORT = 3000;
const API_PREFIX = "/api/v1";

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

  const candidates: (string | undefined)[] = [
    expoGo?.debuggerHost,
    classicManifest?.debuggerHost,
    expoConfig?.hostUri,
    manifest2?.extra?.expoGo?.debuggerHost,
    manifest2?.extra?.expoClient?.hostUri
  ];

  for (const raw of candidates) {
    const host = parseDevHost(raw);
    if (host && isLikelyReachableDevApiHost(host)) {
      return host;
    }
  }

  return null;
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

  let resolved = stripTrailingSlashes(base);
  if (
    __DEV__ &&
    (iosNeedsLanHost || androidNeedsLanHost) &&
    (resolved.includes("localhost") || resolved.includes("127.0.0.1"))
  ) {
    const lan = devMachineHostFromBundler();
    if (lan) {
      resolved = stripTrailingSlashes(rewriteLocalhostUrl(resolved, lan));
      if (__DEV__) {
        console.warn(
          `[Deenly] EXPO_PUBLIC_API_BASE_URL used localhost on a physical device — rewrote host to ${lan} ` +
            "(from Expo). Set EXPO_PUBLIC_API_BASE_URL explicitly if this is wrong, then npx expo start -c."
        );
      }
    } else {
      console.warn(
        "[Deenly] API base is still localhost on a physical device — the phone cannot reach your Mac. " +
          "Set EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:3000/api/v1 (e.g. ipconfig getifaddr en0), then npx expo start -c. " +
          "Avoid Expo tunnel-only mode for local API; iOS: NSAllowsLocalNetworking in app.json."
      );
    }
  }

  return resolved;
}

/**
 * Host to substitute for `localhost` in absolute media URLs (e.g. `http://localhost:8080/uploads/...`)
 * on a physical device or Android emulator. Uses the API base hostname when it is already a LAN IP;
 * otherwise the same Expo-derived LAN host used when `EXPO_PUBLIC_API_BASE_URL` is unset.
 * iOS simulator: returns null (localhost on the simulator reaches the Mac).
 */
export function getDevLoopbackRewriteHost(): string | null {
  if (!__DEV__) {
    return null;
  }
  const androidEmulator = Platform.OS === "android" && !Device.isDevice;
  if (androidEmulator) {
    return "10.0.2.2";
  }
  if (Platform.OS === "ios" && !Device.isDevice) {
    return null;
  }
  if (!Device.isDevice) {
    return null;
  }
  try {
    const apiUrl = new URL(getApiBaseUrl());
    if (apiUrl.hostname !== "localhost" && apiUrl.hostname !== "127.0.0.1") {
      return apiUrl.hostname;
    }
  } catch {
    /* ignore */
  }
  return devMachineHostFromBundler();
}
