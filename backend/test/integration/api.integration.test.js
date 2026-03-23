const request = require("supertest");
const { loadEnv } = require("../../src/config/env");
const { createLogger } = require("../../src/config/logger");
const { createDb } = require("../../src/db");
const { createApp } = require("../../src/app");
const { createAnalytics } = require("../../src/services/analytics");
const { createMediaStorage } = require("../../src/services/media-storage");

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDatabase = hasDatabase ? describe : describe.skip;

describeIfDatabase("integration api flows", () => {
  const config = loadEnv({
    ...process.env,
    NODE_ENV: "test",
    DB_SSL_MODE: process.env.DB_SSL_MODE || "disable",
    CORS_ORIGINS: process.env.CORS_ORIGINS || "http://localhost:3000",
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "test-access",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "test-refresh",
    MEDIA_PROVIDER: "mock"
  });

  const logger = createLogger({ ...config, logLevel: "silent" });
  const db = createDb(config);
  const analytics = createAnalytics({ db, logger });
  const mediaStorage = createMediaStorage(config);
  const app = createApp({ config, logger, db, analytics, mediaStorage });

  async function cleanDb() {
    await db.query("TRUNCATE TABLE moderation_actions RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE reports RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE user_blocks RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE user_mutes RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE interactions RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE posts RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE follows RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE refresh_tokens RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE profiles RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE analytics_events RESTART IDENTITY CASCADE");
  }

  beforeEach(async () => {
    await cleanDb();
  });

  afterAll(async () => {
    await db.close();
  });

  it("registers, logs in, and fetches session user", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: "tester@example.com",
      password: "StrongPass123",
      displayName: "Tester"
    });
    expect(register.statusCode).toBe(201);
    expect(register.body.tokens.accessToken).toBeDefined();

    const login = await request(app).post("/api/v1/auth/login").send({
      email: "tester@example.com",
      password: "StrongPass123"
    });
    expect(login.statusCode).toBe(200);

    const me = await request(app)
      .get("/api/v1/auth/session/me")
      .set("Authorization", `Bearer ${login.body.tokens.accessToken}`);

    expect(me.statusCode).toBe(200);
    expect(me.body.user.email).toBe("tester@example.com");
  });

  it("creates post and fetches feed items", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: "poster@example.com",
      password: "StrongPass123",
      displayName: "Poster"
    });

    const token = register.body.tokens.accessToken;

    const created = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        postType: "community",
        content: "Assalamu alaikum everyone",
        mediaUrl: null
      });

    expect(created.statusCode).toBe(201);
    expect(created.body.id).toBeDefined();

    const feed = await request(app).get("/api/v1/feed?limit=10&offset=0");
    expect(feed.statusCode).toBe(200);
    expect(Array.isArray(feed.body.items)).toBe(true);
    expect(feed.body.items.length).toBeGreaterThanOrEqual(1);
  });
});
