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
    await db.query("TRUNCATE TABLE post_views RESTART IDENTITY CASCADE");
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
      username: "tester_user",
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
    expect(me.body.user.username).toBe("tester_user");

    const userMe = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${login.body.tokens.accessToken}`);
    expect(userMe.statusCode).toBe(200);
    expect(userMe.body.display_name).toBe("Tester");
  });

  it("creates post and fetches feed items", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: "poster@example.com",
      username: "poster_user",
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

    const feed = await request(app).get("/api/v1/feed?limit=10");
    expect(feed.statusCode).toBe(200);
    expect(Array.isArray(feed.body.items)).toBe(true);
    expect(feed.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it("runs content alive loop with upload, follow, engagement, and cursor feed", async () => {
    const creatorRegister = await request(app).post("/api/v1/auth/register").send({
      email: "creator@example.com",
      username: "creator_user",
      password: "StrongPass123",
      displayName: "Creator"
    });
    const viewerRegister = await request(app).post("/api/v1/auth/register").send({
      email: "viewer@example.com",
      username: "viewer_user",
      password: "StrongPass123",
      displayName: "Viewer"
    });

    const creatorToken = creatorRegister.body.tokens.accessToken;
    const viewerToken = viewerRegister.body.tokens.accessToken;

    const createdPost = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        postType: "recitation",
        content: "Short recitation sample",
        mediaUrl: null
      });
    expect(createdPost.statusCode).toBe(201);

    const uploadSignature = await request(app)
      .post("/api/v1/media/upload-signature")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        mediaType: "video",
        mimeType: "video/mp4",
        originalFilename: "recitation.mp4",
        fileSizeBytes: 1048576
      });
    expect(uploadSignature.statusCode).toBe(200);
    expect(uploadSignature.body.uploadUrl).toBeDefined();

    const attached = await request(app)
      .post(`/api/v1/media/posts/${createdPost.body.id}/attach`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        mediaKey: "uploads/creator/recitation.mp4",
        mediaUrl: "https://cdn.example.com/uploads/creator/recitation.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 1048576,
        durationSeconds: 23
      });
    expect(attached.statusCode).toBe(200);
    expect(attached.body.media_status).toBe("ready");

    const follow = await request(app)
      .post(`/api/v1/follows/${creatorRegister.body.user.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(follow.statusCode).toBe(201);

    const feedFirst = await request(app)
      .get("/api/v1/feed?limit=1&followingOnly=true")
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(feedFirst.statusCode).toBe(200);
    expect(feedFirst.body.items.length).toBe(1);
    expect(feedFirst.body.hasMore).toBe(false);

    const viewed = await request(app)
      .post("/api/v1/interactions/view")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        postId: createdPost.body.id,
        watchTimeMs: 19000,
        completionRate: 82.5
      });
    expect(viewed.statusCode).toBe(201);

    const liked = await request(app)
      .post("/api/v1/interactions")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        postId: createdPost.body.id,
        interactionType: "benefited"
      });
    expect([200, 201]).toContain(liked.statusCode);

    const postDetails = await request(app).get(`/api/v1/posts/${createdPost.body.id}`);
    expect(postDetails.statusCode).toBe(200);
    expect(postDetails.body.view_count).toBeGreaterThanOrEqual(1);
    expect(Number(postDetails.body.avg_watch_time_ms)).toBeGreaterThan(0);
    expect(Number(postDetails.body.avg_completion_rate)).toBeGreaterThan(0);
  });
});
