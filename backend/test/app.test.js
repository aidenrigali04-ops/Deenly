const request = require("supertest");
const { createApp } = require("../src/app");
const { createLogger } = require("../src/config/logger");

describe("backend app", () => {
  const config = {
    nodeEnv: "test",
    isProduction: false,
    isTest: true,
    port: 3000,
    databaseUrl: "",
    dbSslMode: "disable",
    corsOrigins: [],
    jwtAccessSecret: "test-access-secret",
    jwtRefreshSecret: "test-refresh-secret",
    jwtAccessTtl: "15m",
    jwtRefreshTtl: "30d",
    logLevel: "silent",
    trustProxy: false
  };

  const db = {
    checkConnection: async () => ({ ok: false, reason: "DATABASE_URL is not set" }),
    query: async () => ({ rows: [], rowCount: 0 })
  };

  const logger = createLogger(config);
  const mediaStorage = {
    createUploadSignature: async () => ({ uploadUrl: "https://mock-upload.local/test" })
  };
  const analytics = {
    trackEvent: async () => {}
  };
  const app = createApp({ config, db, logger, mediaStorage, analytics });

  it("returns health payload", async () => {
    const response = await request(app).get("/health");
    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.databaseConfigured).toBe(false);
  });

  it("returns ready as true without database", async () => {
    const response = await request(app).get("/ready");
    expect(response.statusCode).toBe(200);
    expect(response.body.ready).toBe(true);
  });

  it("returns 404 payload", async () => {
    const response = await request(app).get("/not-found");
    expect(response.statusCode).toBe(404);
    expect(response.body.status).toBe("error");
  });
});
