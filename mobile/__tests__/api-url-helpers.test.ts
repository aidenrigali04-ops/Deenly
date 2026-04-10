import {
  isLikelyReachableDevApiHost,
  normalizeEnvApiBaseUrl,
  parseDevHost,
  rewriteLocalhostUrl,
  stripTrailingSlashes
} from "../src/lib/api-url-helpers";

describe("api-url-helpers", () => {
  describe("normalizeEnvApiBaseUrl", () => {
    it("fixes semicolon typos and localhost.port typos used in misconfigured .env", () => {
      expect(normalizeEnvApiBaseUrl("  https;//api.example.com/api/v1  ")).toBe("http://api.example.com/api/v1");
      expect(normalizeEnvApiBaseUrl("http;//localhost:3000/api/v1")).toBe("http://localhost:3000/api/v1");
      expect(normalizeEnvApiBaseUrl("http://localhost.3000/api/v1")).toBe("http://localhost:3000/api/v1");
    });
  });

  describe("stripTrailingSlashes", () => {
    it("normalizes base URLs for consistent fetch concatenation", () => {
      expect(stripTrailingSlashes("http://x/api/v1///")).toBe("http://x/api/v1");
      expect(stripTrailingSlashes("http://x")).toBe("http://x");
    });
  });

  describe("parseDevHost", () => {
    it("extracts hostname from Expo debuggerHost-style strings", () => {
      expect(parseDevHost("192.168.1.5:8081")).toBe("192.168.1.5");
      expect(parseDevHost("http://192.168.1.5:8081")).toBe("192.168.1.5");
      expect(parseDevHost("")).toBeNull();
      expect(parseDevHost(null)).toBeNull();
    });
  });

  describe("isLikelyReachableDevApiHost", () => {
    it("accepts RFC1918 and plain IPs for LAN API reachability", () => {
      expect(isLikelyReachableDevApiHost("192.168.0.10")).toBe(true);
      expect(isLikelyReachableDevApiHost("10.0.0.1")).toBe(true);
      expect(isLikelyReachableDevApiHost("172.16.0.1")).toBe(true);
      expect(isLikelyReachableDevApiHost("203.0.113.1")).toBe(true);
    });

    it("rejects loopback and tunnel hosts that cannot reach local :3000", () => {
      expect(isLikelyReachableDevApiHost("localhost")).toBe(false);
      expect(isLikelyReachableDevApiHost("127.0.0.1")).toBe(false);
      expect(isLikelyReachableDevApiHost("")).toBe(false);
      expect(isLikelyReachableDevApiHost("abc.exp.direct")).toBe(false);
      expect(isLikelyReachableDevApiHost("x.ngrok.io")).toBe(false);
    });
  });

  describe("rewriteLocalhostUrl", () => {
    it("rewrites localhost to Android emulator loopback or LAN IP", () => {
      expect(rewriteLocalhostUrl("http://localhost:3000/api/v1", "10.0.2.2")).toBe(
        "http://10.0.2.2:3000/api/v1"
      );
      expect(rewriteLocalhostUrl("http://127.0.0.1:3000/foo", "192.168.1.2")).toBe(
        "http://192.168.1.2:3000/foo"
      );
    });

    it("leaves non-loopback URLs unchanged", () => {
      expect(rewriteLocalhostUrl("https://api.prod.example/v1", "10.0.2.2")).toBe(
        "https://api.prod.example/v1"
      );
    });
  });
});
