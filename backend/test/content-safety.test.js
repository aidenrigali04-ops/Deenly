const {
  normalizeBlockedHostEntry,
  hostMatchesBlocklist,
  collectHostsFromHttpUrlsInText,
  validateUserFacingText
} = require("../src/utils/content-safety");

describe("content-safety", () => {
  it("normalizeBlockedHostEntry strips scheme and www", () => {
    expect(normalizeBlockedHostEntry("https://www.example.com/path")).toBe("example.com");
    expect(normalizeBlockedHostEntry("onlyfans.com")).toBe("onlyfans.com");
  });

  it("hostMatchesBlocklist matches subdomains", () => {
    const list = ["onlyfans.com"];
    expect(hostMatchesBlocklist("onlyfans.com", list)).toBe("onlyfans.com");
    expect(hostMatchesBlocklist("www.onlyfans.com", list)).toBe("onlyfans.com");
    expect(hostMatchesBlocklist("m.onlyfans.com", list)).toBe("onlyfans.com");
    expect(hostMatchesBlocklist("example.com", list)).toBeNull();
  });

  it("collectHostsFromHttpUrlsInText finds hosts", () => {
    const text = "see https://bad.example/x and also http://foo.bar?q=1";
    const hosts = collectHostsFromHttpUrlsInText(text);
    expect(hosts).toContain("bad.example");
    expect(hosts).toContain("foo.bar");
  });

  it("validateUserFacingText detects blocked terms", () => {
    const v = validateUserFacingText("hello onlyfans here", {
      blockedTerms: ["onlyfans"],
      blockedUrlHosts: []
    });
    expect(v).toEqual({ type: "term" });
  });

  it("validateUserFacingText detects blocked URL host in prose", () => {
    const v = validateUserFacingText("visit https://onlyfans.com/x now", {
      blockedTerms: [],
      blockedUrlHosts: ["onlyfans.com"]
    });
    expect(v).toEqual({ type: "url" });
  });

  it("validateUserFacingText detects blocked host on bare URL string", () => {
    const v = validateUserFacingText("https://www.onlyfans.com/", {
      blockedTerms: [],
      blockedUrlHosts: ["onlyfans.com"]
    });
    expect(v).toEqual({ type: "url" });
  });
});
