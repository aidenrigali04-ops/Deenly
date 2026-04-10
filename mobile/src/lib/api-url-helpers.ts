export function stripTrailingSlashes(url: string) {
  return url.replace(/\/+$/, "");
}

/** Fixes common .env typos (e.g. https;// or localhost.3000). */
export function normalizeEnvApiBaseUrl(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^https;\/\//i, "http://");
  s = s.replace(/^http;\/\//i, "http://");
  s = s.replace(/\blocalhost\.(\d{2,5})\b/g, "localhost:$1");
  return s;
}

export function parseDevHost(raw: string | undefined | null): string | null {
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
export function isLikelyReachableDevApiHost(host: string): boolean {
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

export function rewriteLocalhostUrl(url: string, replacementHost: string): string {
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
