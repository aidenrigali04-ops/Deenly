import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";

const DEFAULT_PORT = 3000;
const API_PREFIX = "/api/v1";

function stripTrailingSlashes(url: string) {
  return url.replace(/\/+$/, "");
}

/**
 * Host where Metro is running (e.g. Mac LAN IP when using a physical device).
 * Used to rewrite localhost API URLs so the device can reach the backend.
 */
function devMachineHostFromBundler(): string | null {
  const expoGo = Constants.expoGoConfig as { debuggerHost?: string } | undefined;
  const classic = Constants.manifest as { debuggerHost?: string } | undefined;
  const raw = expoGo?.debuggerHost ?? classic?.debuggerHost;
  if (!raw || typeof raw !== "string") {
    return null;
  }
  const host = raw.split(":")[0]?.trim();
  if (!host) {
    return null;
  }
  return host;
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
 * - In dev, rewrites localhost → Android emulator (10.0.2.2) or, on a physical iOS device only, Metro LAN IP.
 * - iOS Simulator always uses localhost (LAN IP often fails routing/firewall).
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const fallback = `http://localhost:${DEFAULT_PORT}${API_PREFIX}`;
  const iosNeedsLanHost = Platform.OS === "ios" && Device.isDevice;

  if (!fromEnv) {
    if (!__DEV__) {
      return stripTrailingSlashes(fallback);
    }
    if (Platform.OS === "android") {
      return stripTrailingSlashes(`http://10.0.2.2:${DEFAULT_PORT}${API_PREFIX}`);
    }
    if (iosNeedsLanHost) {
      const lan = devMachineHostFromBundler();
      if (lan && lan !== "localhost" && lan !== "127.0.0.1") {
        return stripTrailingSlashes(`http://${lan}:${DEFAULT_PORT}${API_PREFIX}`);
      }
    }
    return stripTrailingSlashes(fallback);
  }

  let base = stripTrailingSlashes(fromEnv);

  if (__DEV__ && (base.includes("localhost") || base.includes("127.0.0.1"))) {
    if (Platform.OS === "android") {
      base = rewriteLocalhostUrl(base, "10.0.2.2");
    } else if (iosNeedsLanHost) {
      const lan = devMachineHostFromBundler();
      if (lan && lan !== "localhost" && lan !== "127.0.0.1") {
        base = rewriteLocalhostUrl(base, lan);
      }
    }
  }

  return stripTrailingSlashes(base);
}
