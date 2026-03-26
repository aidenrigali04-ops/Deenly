const crypto = require("node:crypto");
const {
  signOAuthState,
  verifyOAuthState,
  buildAuthorizeUrl,
  isMetaConfigured,
  createInstagramCrossPostOrchestrator
} = require("../src/services/instagram-graph");
const { encryptToken, decryptToken } = require("../src/services/instagram-token-crypto");

describe("instagram graph helpers", () => {
  const baseConfig = {
    jwtAccessSecret: "a".repeat(32),
    jwtRefreshSecret: "b".repeat(32),
    metaOauthStateSecret: "",
    metaAppId: "123456789",
    metaAppSecret: "meta-secret",
    metaOauthRedirectUri: "https://api.example.com/api/v1/instagram/oauth/callback",
    instagramGraphApiVersion: "v21.0",
    metaTokenEncryptionKey: ""
  };

  it("roundtrips OAuth state JWT", () => {
    const token = signOAuthState(baseConfig, 99);
    expect(verifyOAuthState(baseConfig, token)).toBe(99);
  });

  it("buildAuthorizeUrl includes client_id and redirect_uri", () => {
    const url = buildAuthorizeUrl(baseConfig, "test-state");
    expect(url).toContain("facebook.com");
    expect(url).toContain("client_id=123456789");
    expect(url).toContain(encodeURIComponent("test-state"));
    expect(url).toContain("instagram_content_publish");
  });

  it("isMetaConfigured reflects env", () => {
    expect(isMetaConfigured(baseConfig)).toBe(true);
    expect(isMetaConfigured({ ...baseConfig, metaAppId: "" })).toBe(false);
  });
});

describe("instagram token crypto", () => {
  const keyHex = crypto.randomBytes(32).toString("hex");
  const config = {
    metaTokenEncryptionKey: keyHex,
    jwtAccessSecret: "",
    jwtRefreshSecret: ""
  };

  it("encrypts and decrypts page tokens", () => {
    const secret = "page-access-token-value";
    const enc = encryptToken(secret, config);
    expect(decryptToken(enc, config)).toBe(secret);
  });
});

describe("instagram cross-post orchestrator", () => {
  it("returns ok:false when post not found", async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] })
    };
    const config = {
      metaAppId: "1",
      metaAppSecret: "s",
      metaOauthRedirectUri: "https://x/cb",
      instagramGraphApiVersion: "v21.0",
      jwtRefreshSecret: "x".repeat(32)
    };
    const { enqueueByPostId } = createInstagramCrossPostOrchestrator({
      db,
      config,
      mediaStorage: { resolveMediaUrl: () => "" }
    });
    const result = await enqueueByPostId(1, 999);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
