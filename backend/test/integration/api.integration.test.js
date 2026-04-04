const request = require("supertest");
const { parse: parseConnectionString } = require("pg-connection-string");
const { loadEnv } = require("../../src/config/env");
const { createLogger } = require("../../src/config/logger");
const { createDb } = require("../../src/db");
const { createApp } = require("../../src/app");
const { createAnalytics } = require("../../src/services/analytics");
const { createMediaStorage } = require("../../src/services/media-storage");
const { createPushNotifications } = require("../../src/services/push-notifications");

/**
 * Bare database names (e.g. DATABASE_URL=railway) parse with hostname "base" and fail with
 * getaddrinfo ENOTFOUND base — require a full libpq URI.
 */
function assertValidIntegrationDatabaseUrl(url) {
  const s = String(url || "").trim();
  if (!s) {
    return;
  }
  if (!s.includes("://")) {
    throw new Error(
      "DATABASE_URL must be a full PostgreSQL URI (protocol + credentials + host + database), e.g. postgresql://USER:PASSWORD@localhost:5432/DBNAME — not only the database name."
    );
  }
  let parsed;
  try {
    parsed = parseConnectionString(s);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL connection string.");
  }
  if (
    parsed.host === "base" &&
    !/@base(?:[:/?#]|$)/i.test(s)
  ) {
    throw new Error(
      'DATABASE_URL resolves to hostname "base", which usually means the value is not a full connection URI. Use the full postgresql://… string from Railway, Neon, or your host (including @hostname:port/).'
    );
  }
}

const hasDatabase = Boolean(process.env.DATABASE_URL);
if (hasDatabase) {
  assertValidIntegrationDatabaseUrl(process.env.DATABASE_URL);
}
const describeIfDatabase = hasDatabase ? describe : describe.skip;

describeIfDatabase("integration api flows", () => {
  jest.setTimeout(120000);
  const config = loadEnv({
    ...process.env,
    NODE_ENV: "test",
    DB_SSL_MODE: process.env.DB_SSL_MODE || "disable",
    CORS_ORIGINS: process.env.CORS_ORIGINS || "http://localhost:3000",
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "test-access",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "test-refresh",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "test-google-client-id",
    ADMIN_OWNER_EMAIL: process.env.ADMIN_OWNER_EMAIL || "admin-growth@example.com",
    PROCESSING_WEBHOOK_TOKEN: process.env.PROCESSING_WEBHOOK_TOKEN || "test-processing-token",
    MEDIA_PROVIDER: "mock",
    MEDIA_PUBLIC_BASE_URL: process.env.MEDIA_PUBLIC_BASE_URL || "https://media.test-cdn.example",
    MEDIA_ASYNC_VIDEO_PROCESSING: process.env.MEDIA_ASYNC_VIDEO_PROCESSING || "false"
  });

  const logger = createLogger({ ...config, logLevel: "silent" });
  const db = createDb(config);
  const analytics = createAnalytics({ db, logger });
  const mediaStorage = createMediaStorage(config);
  const pushNotifications = createPushNotifications({ db, logger });
  const app = createApp({ config, logger, db, analytics, mediaStorage, pushNotifications });

  async function cleanDb() {
    await db.query("TRUNCATE TABLE webhook_events RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE earnings_ledger RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE orders RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE checkout_sessions RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE post_product_links RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE creator_products RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE creator_payout_accounts RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE creator_subscriptions RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE creator_subscription_tiers RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE affiliate_conversions RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE affiliate_codes RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE creator_ranking_snapshots RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE notification_device_tokens RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE user_prayer_settings RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE conversation_participants RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE messages RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE conversations RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE appeals RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE user_restrictions RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE user_warnings RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE notifications RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE user_interests RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE beta_invites RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE waitlist_entries RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE support_tickets RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE post_views RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE moderation_actions RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE reports RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE user_blocks RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE user_mutes RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE interactions RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE instagram_cross_posts RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE posts RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE business_listings RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE follows RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE refresh_tokens RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE profiles RESTART IDENTITY CASCADE");
    await db.query("TRUNCATE TABLE user_instagram_connections RESTART IDENTITY CASCADE");
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
    expect(userMe.body.is_verified).toBe(false);
  });

  it("register stores optional business offering and website on profile", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: "biz@example.com",
      username: "biz_user",
      password: "StrongPass123",
      displayName: "Biz Owner",
      businessOffering: "Islamic books and courses",
      websiteUrl: "example.com/shop"
    });
    expect(register.statusCode).toBe(201);

    const userMe = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${register.body.tokens.accessToken}`);
    expect(userMe.statusCode).toBe(200);
    expect(userMe.body.business_offering).toBe("Islamic books and courses");
    expect(userMe.body.website_url).toBe("https://example.com/shop");
  });

  it("returns empty monetization purchase history for a new user", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: "purchases-empty@example.com",
      username: "purchases_empty",
      password: "StrongPass123",
      displayName: "No Purchases Yet"
    });
    expect(register.statusCode).toBe(201);
    const res = await request(app)
      .get("/api/v1/monetization/purchases/me")
      .set("Authorization", `Bearer ${register.body.tokens.accessToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toEqual([]);
    expect(res.body.limit).toBe(20);
    expect(res.body.offset).toBe(0);
  });

  it("refreshes access tokens and invalidates refresh token on logout", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: "refresh-user@example.com",
      username: "refresh_user",
      password: "StrongPass123",
      displayName: "Refresh User"
    });
    expect(register.statusCode).toBe(201);

    const initialRefreshToken = register.body.tokens.refreshToken;
    expect(initialRefreshToken).toBeDefined();

    const refreshed = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: initialRefreshToken
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.body.tokens.accessToken).toBeDefined();
    expect(refreshed.body.tokens.refreshToken).toBeDefined();

    const logout = await request(app).post("/api/v1/auth/logout").send({
      refreshToken: refreshed.body.tokens.refreshToken
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.body.success).toBe(true);

    const refreshAfterLogout = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: refreshed.body.tokens.refreshToken
    });
    expect(refreshAfterLogout.statusCode).toBe(401);
  });

  it("rejects access tokens sent to the refresh endpoint", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: "refresh-guard@example.com",
      username: "refresh_guard_user",
      password: "StrongPass123",
      displayName: "Refresh Guard"
    });
    expect(register.statusCode).toBe(201);
    const accessOnly = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: register.body.tokens.accessToken
    });
    expect(accessOnly.statusCode).toBe(401);
  });

  it("tracks auth failure analytics events on invalid login attempts", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: "auth-fail@example.com",
      username: "auth_fail_user",
      password: "StrongPass123",
      displayName: "Auth Fail User"
    });
    expect(register.statusCode).toBe(201);

    const badLogin = await request(app).post("/api/v1/auth/login").send({
      email: "auth-fail@example.com",
      password: "WrongPass123"
    });
    expect(badLogin.statusCode).toBe(401);

    const events = await db.query(
      `SELECT event_name, payload
       FROM analytics_events
       WHERE event_name = 'auth_failure'
       ORDER BY created_at DESC
       LIMIT 1`
    );
    expect(events.rowCount).toBe(1);
    expect(events.rows[0].payload.reason).toBe("login_invalid_password");
  });

  it("logs in with Google OAuth and creates a user session", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/tokeninfo?access_token=")) {
        return new globalThis.Response(
          JSON.stringify({
            aud: config.googleClientId
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      if (url.endsWith("/userinfo")) {
        return new globalThis.Response(
          JSON.stringify({
            email: "google-auth-user@example.com",
            email_verified: true,
            name: "Google Auth User",
            picture: "https://example.com/avatar.png"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new globalThis.Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    });

    try {
      const auth = await request(app).post("/api/v1/auth/google").send({
        accessToken: "google_access_token_example_1234567890"
      });
      expect(auth.statusCode).toBe(200);
      expect(auth.body.tokens.accessToken).toBeDefined();
      expect(auth.body.user.email).toBe("google-auth-user@example.com");

      const me = await request(app)
        .get("/api/v1/auth/session/me")
        .set("Authorization", `Bearer ${auth.body.tokens.accessToken}`);
      expect(me.statusCode).toBe(200);
      expect(me.body.user.email).toBe("google-auth-user@example.com");
    } finally {
      fetchSpy.mockRestore();
    }
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
        postType: "post",
        content: "Assalamu alaikum everyone",
        mediaUrl: null
      });

    expect(created.statusCode).toBe(201);
    expect(created.body.id).toBeDefined();

    const updatedProfile = await request(app)
      .put("/api/v1/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send({
        displayName: "Poster",
        bio: "profile bio",
        avatarUrl: "uploads/avatars/poster.jpg"
      });
    expect(updatedProfile.statusCode).toBe(200);

    const feed = await request(app).get("/api/v1/feed?limit=10");
    expect(feed.statusCode).toBe(200);
    expect(Array.isArray(feed.body.items)).toBe(true);
    expect(feed.body.items.length).toBeGreaterThanOrEqual(1);
    expect(feed.body.items[0].author_avatar_url).toContain("/uploads/avatars/poster.jpg");
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
        postType: "post",
        content: "Short post sample",
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

    const imageSignature = await request(app)
      .post("/api/v1/media/upload-signature")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        mediaType: "image",
        mimeType: "image/jpeg",
        originalFilename: "recitation.jpg",
        fileSizeBytes: 524288
      });
    expect(imageSignature.statusCode).toBe(200);
    expect(imageSignature.body.uploadUrl).toBeDefined();

    const invalidSignature = await request(app)
      .post("/api/v1/media/upload-signature")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        mediaType: "video",
        mimeType: "image/jpeg",
        originalFilename: "bad-mime.jpg",
        fileSizeBytes: 1000
      });
    expect(invalidSignature.statusCode).toBe(400);

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
    expect(attached.body.media_mime_type).toBe("video/mp4");

    const feedAfterVideoAttach = await request(app)
      .get(`/api/v1/feed?authorId=${creatorRegister.body.user.id}&limit=10`);
    expect(feedAfterVideoAttach.statusCode).toBe(200);
    expect(feedAfterVideoAttach.body.items.some((item) => item.id === createdPost.body.id)).toBe(true);

    const processed = await request(app)
      .post(`/api/v1/media/processing/post/${createdPost.body.id}`)
      .set("x-processing-token", config.processingWebhookToken)
      .send({
        status: "ready",
        mediaUrl: "uploads/creator/recitation.mp4"
      });
    expect(processed.statusCode).toBe(200);
    expect(processed.body.media_status).toBe("ready");

    const follow = await request(app)
      .post(`/api/v1/follows/${creatorRegister.body.user.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(follow.statusCode).toBe(201);
    expect(follow.body.created).toBe(true);
    expect(follow.body.isFollowing).toBe(true);
    expect(typeof follow.body.targetCounts.followers).toBe("number");
    expect(typeof follow.body.actorCounts.following).toBe("number");

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

    const unlike = await request(app)
      .delete("/api/v1/interactions")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        postId: createdPost.body.id,
        interactionType: "benefited"
      });
    expect(unlike.statusCode).toBe(200);
    expect(unlike.body.deleted).toBe(true);

    const postDetails = await request(app).get(`/api/v1/posts/${createdPost.body.id}`);
    expect(postDetails.statusCode).toBe(200);
    expect(postDetails.body.view_count).toBeGreaterThanOrEqual(1);
    expect(Number(postDetails.body.avg_watch_time_ms)).toBeGreaterThan(0);
    expect(Number(postDetails.body.avg_completion_rate)).toBeGreaterThan(0);
    expect(postDetails.body.benefited_count).toBe(0);
  });

  it("lists and soft-deletes comments with pagination", async () => {
    const author = await request(app).post("/api/v1/auth/register").send({
      email: "comment-author@example.com",
      username: "comment_author",
      password: "StrongPass123",
      displayName: "Comment Author"
    });
    const actor = await request(app).post("/api/v1/auth/register").send({
      email: "comment-actor@example.com",
      username: "comment_actor",
      password: "StrongPass123",
      displayName: "Comment Actor"
    });
    const authorToken = author.body.tokens.accessToken;
    const actorToken = actor.body.tokens.accessToken;

    const post = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({
        postType: "post",
        content: "Comment target post"
      });
    expect(post.statusCode).toBe(201);

    const firstComment = await request(app)
      .post("/api/v1/interactions")
      .set("Authorization", `Bearer ${actorToken}`)
      .send({
        postId: post.body.id,
        interactionType: "comment",
        commentText: "First comment"
      });
    const secondComment = await request(app)
      .post("/api/v1/interactions")
      .set("Authorization", `Bearer ${actorToken}`)
      .send({
        postId: post.body.id,
        interactionType: "comment",
        commentText: "Second comment"
      });
    expect(firstComment.statusCode).toBe(201);
    expect(secondComment.statusCode).toBe(201);

    const listedFirst = await request(app).get(`/api/v1/interactions/post/${post.body.id}/comments?limit=1`);
    expect(listedFirst.statusCode).toBe(200);
    expect(listedFirst.body.items.length).toBe(1);
    expect(listedFirst.body.hasMore).toBe(true);
    expect(listedFirst.body.nextCursor).toBeTruthy();

    const listedSecond = await request(app).get(
      `/api/v1/interactions/post/${post.body.id}/comments?limit=5&cursor=${encodeURIComponent(
        listedFirst.body.nextCursor
      )}`
    );
    expect(listedSecond.statusCode).toBe(200);
    expect(listedSecond.body.items.length).toBe(1);

    const removed = await request(app)
      .delete(`/api/v1/interactions/comments/${firstComment.body.id}`)
      .set("Authorization", `Bearer ${actorToken}`);
    expect(removed.statusCode).toBe(200);
    expect(removed.body.deleted).toBe(true);

    const counts = await request(app).get(`/api/v1/interactions/post/${post.body.id}`);
    expect(counts.statusCode).toBe(200);
    const commentTotal = counts.body.totals.find((entry) => entry.interaction_type === "comment");
    expect(Number(commentTotal.total)).toBe(1);
  });

  it("dedupes post views inside configured view window", async () => {
    const creator = await request(app).post("/api/v1/auth/register").send({
      email: "view-creator@example.com",
      username: "view_creator",
      password: "StrongPass123",
      displayName: "View Creator"
    });
    const viewer = await request(app).post("/api/v1/auth/register").send({
      email: "view-viewer@example.com",
      username: "view_viewer",
      password: "StrongPass123",
      displayName: "View Viewer"
    });
    const creatorToken = creator.body.tokens.accessToken;
    const viewerToken = viewer.body.tokens.accessToken;

    const post = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        postType: "post",
        content: "View dedupe post"
      });
    expect(post.statusCode).toBe(201);

    const firstView = await request(app)
      .post("/api/v1/interactions/view")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        postId: post.body.id,
        watchTimeMs: 1200,
        completionRate: 20
      });
    expect(firstView.statusCode).toBe(201);
    expect(firstView.body.deduped).toBe(false);

    const secondView = await request(app)
      .post("/api/v1/interactions/view")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        postId: post.body.id,
        watchTimeMs: 5400,
        completionRate: 70
      });
    expect(secondView.statusCode).toBe(200);
    expect(secondView.body.deduped).toBe(true);

    const postDetails = await request(app).get(`/api/v1/posts/${post.body.id}`);
    expect(postDetails.statusCode).toBe(200);
    expect(postDetails.body.view_count).toBe(1);
    expect(Number(postDetails.body.avg_watch_time_ms)).toBeGreaterThanOrEqual(5400);
  });

  it("paginates feed without duplicate items across cursors", async () => {
    const author = await request(app).post("/api/v1/auth/register").send({
      email: "feed-cursor@example.com",
      username: "feed_cursor",
      password: "StrongPass123",
      displayName: "Feed Cursor"
    });
    const token = author.body.tokens.accessToken;

    for (let index = 0; index < 5; index += 1) {
      const created = await request(app)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          postType: "post",
          content: `Cursor post ${index}`
        });
      expect(created.statusCode).toBe(201);
    }

    const page1 = await request(app).get("/api/v1/feed?limit=2");
    expect(page1.statusCode).toBe(200);
    expect(page1.body.items.length).toBe(2);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await request(app).get(
      `/api/v1/feed?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`
    );
    expect(page2.statusCode).toBe(200);
    expect(page2.body.items.length).toBeGreaterThan(0);
    const firstPageIds = new Set(page1.body.items.map((item) => item.id));
    const overlap = page2.body.items.some((item) => firstPageIds.has(item.id));
    expect(overlap).toBe(false);
  });

  it("normalizes media attach payloads to delivery URL for key-only and key-url values", async () => {
    const creatorRegister = await request(app).post("/api/v1/auth/register").send({
      email: "media-normalize@example.com",
      username: "media_normalize_user",
      password: "StrongPass123",
      displayName: "Media Normalize"
    });
    const creatorToken = creatorRegister.body.tokens.accessToken;

    const keyOnlyPost = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        postType: "post",
        content: "Normalize media URL from key"
      });
    expect(keyOnlyPost.statusCode).toBe(201);

    const keyOnlyAttach = await request(app)
      .post(`/api/v1/media/posts/${keyOnlyPost.body.id}/attach`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        mediaKey: "uploads/normalizer/key-only.mp4",
        mediaUrl: "uploads/normalizer/key-only.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 4096
      });
    expect(keyOnlyAttach.statusCode).toBe(200);
    expect(keyOnlyAttach.body.media_url).toBe(
      "https://media.test-cdn.example/uploads/normalizer/key-only.mp4"
    );
    expect(keyOnlyAttach.body.media_status).toBe("ready");

    const keyUrlPost = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        postType: "post",
        content: "Normalize media URL from S3 URL"
      });
    expect(keyUrlPost.statusCode).toBe(201);

    const keyUrlAttach = await request(app)
      .post(`/api/v1/media/posts/${keyUrlPost.body.id}/attach`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        mediaKey: "uploads/normalizer/key-url.jpg",
        mediaUrl:
          "https://deenly-media-prod-950165721651-us-east-2-an.s3.us-east-2.amazonaws.com/uploads/normalizer/key-url.jpg?X-Amz-Signature=test",
        mimeType: "image/jpeg",
        fileSizeBytes: 1024
      });
    expect(keyUrlAttach.statusCode).toBe(200);
    expect(keyUrlAttach.body.media_url).toBe(
      "https://media.test-cdn.example/uploads/normalizer/key-url.jpg"
    );

    const feed = await request(app).get("/api/v1/feed?limit=20");
    expect(feed.statusCode).toBe(200);
    const keyOnlyItem = feed.body.items.find((item) => item.id === keyOnlyPost.body.id);
    const keyUrlItem = feed.body.items.find((item) => item.id === keyUrlPost.body.id);
    expect(keyOnlyItem.media_url).toBe(
      "https://media.test-cdn.example/uploads/normalizer/key-only.mp4"
    );
    expect(keyUrlItem.media_url).toBe(
      "https://media.test-cdn.example/uploads/normalizer/key-url.jpg"
    );

    const detail = await request(app).get(`/api/v1/posts/${keyOnlyPost.body.id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.body.media_url).toBe(
      "https://media.test-cdn.example/uploads/normalizer/key-only.mp4"
    );
    expect(detail.body.media_mime_type).toBe("video/mp4");
  });

  it("creates reel posts with video mime, attaches video, and lists them on feedTab=reels", async () => {
    const ts = Date.now();
    const reg = await request(app).post("/api/v1/auth/register").send({
      email: `reel-feed-${ts}@example.com`,
      username: `reel_feed_${ts}`,
      password: "StrongPass123",
      displayName: "Reel Feed"
    });
    expect(reg.statusCode).toBe(201);
    const token = reg.body.tokens.accessToken;

    const noMime = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({ postType: "reel", content: "missing mime" });
    expect(noMime.statusCode).toBe(400);

    const reelPost = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        postType: "reel",
        content: "Integration reel caption",
        mediaMimeType: "video/mp4"
      });
    expect(reelPost.statusCode).toBe(201);

    const badAttach = await request(app)
      .post(`/api/v1/media/posts/${reelPost.body.id}/attach`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        mediaKey: "uploads/reels/bad.jpg",
        mediaUrl: "uploads/reels/bad.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 1024
      });
    expect(badAttach.statusCode).toBe(400);

    const attach = await request(app)
      .post(`/api/v1/media/posts/${reelPost.body.id}/attach`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        mediaKey: "uploads/reels/test.mp4",
        mediaUrl: "uploads/reels/test.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 8192
      });
    expect(attach.statusCode).toBe(200);

    const reelsFeed = await request(app)
      .get("/api/v1/feed?feedTab=reels&limit=20")
      .set("Authorization", `Bearer ${token}`);
    expect(reelsFeed.statusCode).toBe(200);
    const found = reelsFeed.body.items.find((item) => item.id === reelPost.body.id);
    expect(found).toBeDefined();
    expect(found.post_type).toBe("reel");
  });

  it("supports prayer settings and suppresses in-app notifications in always quiet mode", async () => {
    const owner = await request(app).post("/api/v1/auth/register").send({
      email: "quiet-owner@example.com",
      username: "quiet_owner",
      password: "StrongPass123",
      displayName: "Quiet Owner"
    });
    const actor = await request(app).post("/api/v1/auth/register").send({
      email: "quiet-actor@example.com",
      username: "quiet_actor",
      password: "StrongPass123",
      displayName: "Quiet Actor"
    });

    const ownerToken = owner.body.tokens.accessToken;
    const actorToken = actor.body.tokens.accessToken;

    const updateSettings = await request(app)
      .put("/api/v1/notifications/prayer-settings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        quiet_mode: "always",
        quiet_minutes_before: 5,
        quiet_minutes_after: 5
      });
    expect(updateSettings.statusCode).toBe(200);
    expect(updateSettings.body.quiet_mode).toBe("always");

    const status = await request(app)
      .get("/api/v1/notifications/prayer-status")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(status.statusCode).toBe(200);
    expect(typeof status.body.isQuietWindow).toBe("boolean");

    const follow = await request(app)
      .post(`/api/v1/follows/${owner.body.user.id}`)
      .set("Authorization", `Bearer ${actorToken}`);
    expect(follow.statusCode).toBe(201);

    const inbox = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(inbox.statusCode).toBe(200);
    expect(inbox.body.items.length).toBe(0);
  });

  it("returns profile stats and follow state for own and public profiles", async () => {
    const authorRegister = await request(app).post("/api/v1/auth/register").send({
      email: "profile-author@example.com",
      username: "profile_author",
      password: "StrongPass123",
      displayName: "Profile Author"
    });
    const viewerRegister = await request(app).post("/api/v1/auth/register").send({
      email: "profile-viewer@example.com",
      username: "profile_viewer",
      password: "StrongPass123",
      displayName: "Profile Viewer"
    });

    const authorToken = authorRegister.body.tokens.accessToken;
    const viewerToken = viewerRegister.body.tokens.accessToken;

    const post = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({
        postType: "post",
        content: "Profile stats post"
      });
    expect(post.statusCode).toBe(201);

    const follow = await request(app)
      .post(`/api/v1/follows/${authorRegister.body.user.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(follow.statusCode).toBe(201);
    expect(follow.body.created).toBe(true);
    expect(follow.body.isFollowing).toBe(true);

    const like = await request(app)
      .post("/api/v1/interactions")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        postId: post.body.id,
        interactionType: "benefited"
      });
    expect([200, 201]).toContain(like.statusCode);

    const authorPublic = await request(app)
      .get(`/api/v1/users/${authorRegister.body.user.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(authorPublic.statusCode).toBe(200);
    expect(authorPublic.body.posts_count).toBe(1);
    expect(authorPublic.body.followers_count).toBe(1);
    expect(authorPublic.body.likes_received_count).toBe(1);
    expect(authorPublic.body.is_following).toBe(true);

    const viewerMe = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(viewerMe.statusCode).toBe(200);
    expect(viewerMe.body.following_count).toBe(1);
    expect(viewerMe.body.likes_given_count).toBe(1);

    const unfollow = await request(app)
      .delete(`/api/v1/follows/${authorRegister.body.user.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(unfollow.statusCode).toBe(200);
    expect(unfollow.body.deleted).toBe(true);
    expect(unfollow.body.isFollowing).toBe(false);
  });

  it("supports onboarding interests, notifications, beta flow, and support ticket", async () => {
    const userRegister = await request(app).post("/api/v1/auth/register").send({
      email: "growth-user@example.com",
      username: "growth_user",
      password: "StrongPass123",
      displayName: "Growth User"
    });
    const adminRegister = await request(app).post("/api/v1/auth/register").send({
      email: "admin-growth@example.com",
      username: "growth_admin",
      password: "StrongPass123",
      displayName: "Growth Admin"
    });

    const userToken = userRegister.body.tokens.accessToken;
    const adminToken = adminRegister.body.tokens.accessToken;
    const updateInterests = await request(app)
      .put("/api/v1/users/me/interests")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ interests: ["marketplace", "post"] });
    expect(updateInterests.statusCode).toBe(200);
    expect(updateInterests.body.items).toContain("marketplace");

    const updateOnboardingIntents = await request(app)
      .patch("/api/v1/users/me/preferences")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ onboardingIntents: ["shop", "community"] });
    expect(updateOnboardingIntents.statusCode).toBe(200);
    expect(updateOnboardingIntents.body.onboarding_intents.sort()).toEqual(["community", "shop"].sort());

    const applyProfessionalPersona = await request(app)
      .patch("/api/v1/users/me/preferences")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ usagePersona: "professional" });
    expect(applyProfessionalPersona.statusCode).toBe(200);
    expect(applyProfessionalPersona.body.profile_kind).toBe("professional");
    expect(applyProfessionalPersona.body.persona_capabilities?.can_create_products).toBe(true);
    expect(applyProfessionalPersona.body.persona_capabilities?.can_manage_memberships).toBe(false);
    expect(applyProfessionalPersona.body.default_feed_tab).toBe("opportunities");
    expect(applyProfessionalPersona.body.app_landing).toBe("home");
    expect(applyProfessionalPersona.body.business_onboarding_dismissed_at).toBeTruthy();
    expect(Array.isArray(applyProfessionalPersona.body.onboarding_intents)).toBe(true);
    expect(applyProfessionalPersona.body.onboarding_intents.sort()).toEqual(["community", "b2b"].sort());

    const invalidMixedPersona = await request(app)
      .patch("/api/v1/users/me/preferences")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ usagePersona: "personal", defaultFeedTab: "marketplace" });
    expect(invalidMixedPersona.statusCode).toBe(400);

    const feedWithPersonaIntents = await request(app)
      .get("/api/v1/feed?feedTab=for_you&limit=5")
      .set("Authorization", `Bearer ${userToken}`);
    expect(feedWithPersonaIntents.statusCode).toBe(200);
    expect(Array.isArray(feedWithPersonaIntents.body.persona.onboardingIntents)).toBe(true);
    expect(feedWithPersonaIntents.body.persona.onboardingIntents.sort()).toEqual(["community", "b2b"].sort());

    const waitlist = await request(app).post("/api/v1/beta/waitlist").send({
      email: "beta-user@example.com",
      source: "test"
    });
    expect(waitlist.statusCode).toBe(201);

    const invite = await request(app)
      .post("/api/v1/admin/invites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "beta-user@example.com", maxUses: 1 });
    expect(invite.statusCode).toBe(201);
    expect(invite.body.code).toBeDefined();

    const redeem = await request(app)
      .post("/api/v1/beta/invite/redeem")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ code: invite.body.code });
    expect(redeem.statusCode).toBe(200);

    const ticket = await request(app).post("/api/v1/support/tickets").send({
      email: "beta-user@example.com",
      subject: "Need help",
      message: "Cannot upload from my current browser."
    });
    expect(ticket.statusCode).toBe(201);
  });

  it("supports messaging and search end-to-end for authenticated users", async () => {
    const userA = await request(app).post("/api/v1/auth/register").send({
      email: "search-a@example.com",
      username: "search_a",
      password: "StrongPass123",
      displayName: "Search A"
    });
    const userB = await request(app).post("/api/v1/auth/register").send({
      email: "search-b@example.com",
      username: "search_b",
      password: "StrongPass123",
      displayName: "Search B"
    });

    const tokenA = userA.body.tokens.accessToken;
    const tokenB = userB.body.tokens.accessToken;

    const createdPost = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        postType: "post",
        content: "This post is searchable in integration test"
      });
    expect(createdPost.statusCode).toBe(201);

    const createdConversation = await request(app)
      .post("/api/v1/messages/conversations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ participantUserId: userB.body.user.id });
    expect([200, 201]).toContain(createdConversation.statusCode);

    const conversationId = createdConversation.body.conversationId;
    expect(conversationId).toBeDefined();

    const sentMessage = await request(app)
      .post(`/api/v1/messages/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ body: "Assalamu alaikum from user A" });
    expect(sentMessage.statusCode).toBe(201);

    const listConversations = await request(app)
      .get("/api/v1/messages/conversations")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listConversations.statusCode).toBe(200);
    expect(Array.isArray(listConversations.body.items)).toBe(true);
    expect(listConversations.body.items.length).toBeGreaterThanOrEqual(1);

    const listMessages = await request(app)
      .get(`/api/v1/messages/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listMessages.statusCode).toBe(200);
    expect(listMessages.body.items[0].body).toContain("Assalamu alaikum");

    const userSearch = await request(app)
      .get("/api/v1/search/users?q=search_")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(userSearch.statusCode).toBe(200);
    expect(userSearch.body.items.some((item) => item.username === "search_b")).toBe(true);

    const postSearch = await request(app)
      .get("/api/v1/search/posts?q=searchable")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(postSearch.statusCode).toBe(200);
    expect(postSearch.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it("supports product create, publish, post attachment, and access checks", async () => {
    const creator = await request(app).post("/api/v1/auth/register").send({
      email: "product-creator@example.com",
      username: "product_creator",
      password: "StrongPass123",
      displayName: "Product Creator"
    });
    const buyer = await request(app).post("/api/v1/auth/register").send({
      email: "product-buyer@example.com",
      username: "product_buyer",
      password: "StrongPass123",
      displayName: "Product Buyer"
    });
    const creatorToken = creator.body.tokens.accessToken;
    const buyerToken = buyer.body.tokens.accessToken;
    const creatorPersona = await request(app)
      .patch("/api/v1/users/me/preferences")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ usagePersona: "professional", preferenceSource: "test" });
    expect(creatorPersona.statusCode).toBe(200);
    expect(creatorPersona.body.persona_capabilities?.can_create_products).toBe(true);

    const post = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        postType: "post",
        content: "Post with attached product"
      });
    expect(post.statusCode).toBe(201);

    const product = await request(app)
      .post("/api/v1/monetization/products")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        title: "Tajweed Starter Pack",
        description: "Digital guide",
        priceMinor: 1500,
        currency: "usd",
        deliveryMediaKey: "uploads/products/tajweed-starter.pdf"
      });
    expect(product.statusCode).toBe(201);
    expect(product.body.status).toBe("draft");
    expect(product.body.audience_target).toBe("both");
    expect(product.body.business_category).toBeNull();
    expect(product.body.platform_fee_bps).toBe(350);

    const published = await request(app)
      .post(`/api/v1/monetization/products/${product.body.id}/publish`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(published.statusCode).toBe(200);
    expect(published.body.status).toBe("published");

    const attached = await request(app)
      .post(`/api/v1/monetization/posts/${post.body.id}/product-attach`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        productId: product.body.id
      });
    expect(attached.statusCode).toBe(200);

    const postDetails = await request(app).get(`/api/v1/posts/${post.body.id}`);
    expect(postDetails.statusCode).toBe(200);
    expect(postDetails.body.attached_product_id).toBe(product.body.id);

    const ownerAccess = await request(app)
      .get(`/api/v1/monetization/products/${product.body.id}/access`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(ownerAccess.statusCode).toBe(200);
    expect(ownerAccess.body.canAccess).toBe(true);

    const buyerAccess = await request(app)
      .get(`/api/v1/monetization/products/${product.body.id}/access`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(buyerAccess.statusCode).toBe(200);
    expect(buyerAccess.body.canAccess).toBe(false);

    const catalogPublic = await request(app).get(
      `/api/v1/monetization/products/creator/${creator.body.user.id}`
    );
    expect(catalogPublic.statusCode).toBe(200);
    expect(catalogPublic.body.items).toHaveLength(1);
    expect(catalogPublic.body.items[0].id).toBe(product.body.id);
    expect(catalogPublic.body.items[0].title).toBe("Tajweed Starter Pack");
    expect(catalogPublic.body.items[0].delivery_media_key).toBeUndefined();

    const catalogProductById = await request(app).get(
      `/api/v1/monetization/catalog/products/${product.body.id}`
    );
    expect(catalogProductById.statusCode).toBe(200);
    expect(catalogProductById.body.title).toBe("Tajweed Starter Pack");
    expect(catalogProductById.body.status).toBe("published");
    expect(catalogProductById.body.delivery_media_key).toBeUndefined();
    expect(catalogProductById.body.creator_user_id).toBe(creator.body.user.id);
    expect(catalogProductById.body.creator_username).toBe("product_creator");

    const catalogMissing = await request(app).get("/api/v1/monetization/catalog/products/999999999");
    expect(catalogMissing.statusCode).toBe(404);
  });

  it("imports from stripe product id and requests price selection when needed", async () => {
    const mockMonetizationGateway = {
      createCheckoutSession: jest.fn(),
      constructWebhookEvent: jest.fn(),
      retrieveCheckoutSession: jest.fn(),
      createConnectedAccount: jest.fn(),
      retrieveConnectedAccount: jest.fn(),
      createOnboardingLink: jest.fn(),
      createDashboardLink: jest.fn(),
      listConnectAccountPrices: jest.fn(async () => ({ data: [], has_more: false })),
      listConnectAccountPricesByProduct: jest
        .fn()
        .mockResolvedValueOnce({
          data: [
            {
              id: "price_multi_1",
              unit_amount: 1200,
              currency: "usd",
              recurring: null,
              product: { id: "prod_abc123", name: "Consulting Call", active: true }
            },
            {
              id: "price_multi_2",
              unit_amount: 2500,
              currency: "usd",
              recurring: null,
              product: { id: "prod_abc123", name: "Consulting Call", active: true }
            }
          ]
        })
        .mockResolvedValueOnce({
          data: [
            {
              id: "price_single_1",
              unit_amount: 2500,
              currency: "usd",
              recurring: null,
              product: {
                id: "prod_abc123",
                name: "Consulting Call",
                description: "Private session",
                active: true
              }
            }
          ]
        }),
      retrieveConnectAccountPrice: jest.fn(async () => ({
        id: "price_single_1",
        unit_amount: 2500,
        currency: "usd",
        recurring: null,
        product: {
          id: "prod_abc123",
          name: "Consulting Call",
          description: "Private session",
          active: true
        }
      })),
      retrieveConnectAccountProduct: jest.fn()
    };

    const testApp = createApp({
      config,
      logger,
      db,
      analytics,
      mediaStorage,
      pushNotifications,
      monetizationGateway: mockMonetizationGateway
    });

    const seller = await request(testApp).post("/api/v1/auth/register").send({
      email: "stripe-product-import@example.com",
      username: "stripe_product_import",
      password: "StrongPass123",
      displayName: "Stripe Product Import"
    });
    expect(seller.statusCode).toBe(201);
    const token = seller.body.tokens.accessToken;

    const persona = await request(testApp)
      .patch("/api/v1/users/me/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ usagePersona: "professional", preferenceSource: "test" });
    expect(persona.statusCode).toBe(200);

    await db.query(
      `INSERT INTO creator_payout_accounts (
         user_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, country
       ) VALUES ($1, 'acct_test_import_pid', true, true, true, 'US')`,
      [seller.body.user.id]
    );

    const multiPrice = await request(testApp)
      .post("/api/v1/monetization/products/import/stripe/product-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ stripeProductId: "prod_abc123" });
    expect(multiPrice.statusCode).toBe(409);
    expect(multiPrice.body.needsPriceSelection).toBe(true);
    expect(Array.isArray(multiPrice.body.items)).toBe(true);
    expect(multiPrice.body.items.length).toBe(2);

    const singlePrice = await request(testApp)
      .post("/api/v1/monetization/products/import/stripe/product-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ stripeProductId: "prod_abc123" });
    expect(singlePrice.statusCode).toBe(200);
    expect(singlePrice.body.draft.title).toBe("Consulting Call");
    expect(singlePrice.body.draft.priceMinor).toBe(2500);
    expect(singlePrice.body.provenance.stripePriceId).toBe("price_single_1");
  });

  it("blocks personal profiles from creator-only monetization operations", async () => {
    const user = await request(app).post("/api/v1/auth/register").send({
      email: "personal-blocked@example.com",
      username: "personal_blocked",
      password: "StrongPass123",
      displayName: "Personal Blocked"
    });
    expect(user.statusCode).toBe(201);
    const token = user.body.tokens.accessToken;

    const createProduct = await request(app)
      .post("/api/v1/monetization/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Should be blocked",
        description: "Personal mode",
        priceMinor: 500,
        currency: "usd",
        productType: "digital",
        deliveryMediaKey: "uploads/products/blocked.pdf"
      });
    expect(createProduct.statusCode).toBe(403);

    const createAffiliate = await request(app)
      .post("/api/v1/monetization/affiliate/codes")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(createAffiliate.statusCode).toBe(403);
  });

  it("rejects product import from URL when not https or host is blocked", async () => {
    const u = await request(app).post("/api/v1/auth/register").send({
      email: "import-url@example.com",
      username: "import_url_user",
      password: "StrongPass123",
      displayName: "Import URL"
    });
    expect(u.statusCode).toBe(201);
    const token = u.body.tokens.accessToken;
    const persona = await request(app)
      .patch("/api/v1/users/me/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ usagePersona: "professional", preferenceSource: "test" });
    expect(persona.statusCode).toBe(200);

    const httpUrl = await request(app)
      .post("/api/v1/monetization/products/import/url")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: "http://example.com/product" });
    expect(httpUrl.statusCode).toBe(400);

    const local = await request(app)
      .post("/api/v1/monetization/products/import/url")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: "https://localhost/foo" });
    expect(local.statusCode).toBe(400);
  });

  it("admin can set profile verification and it appears on public user GET", async () => {
    const target = await request(app).post("/api/v1/auth/register").send({
      email: "verify-target@example.com",
      username: "verify_target",
      password: "StrongPass123",
      displayName: "Verify Target"
    });
    expect(target.statusCode).toBe(201);

    const adminReg = await request(app).post("/api/v1/auth/register").send({
      email: "admin-growth@example.com",
      username: "verify_admin",
      password: "StrongPass123",
      displayName: "Verify Admin"
    });
    expect(adminReg.statusCode).toBe(201);
    expect(adminReg.body.user.role).toBe("admin");

    const patch = await request(app)
      .patch(`/api/v1/admin/profiles/${target.body.user.id}/verification`)
      .set("Authorization", `Bearer ${adminReg.body.tokens.accessToken}`)
      .send({ isVerified: true });
    expect(patch.statusCode).toBe(200);
    expect(patch.body.userId).toBe(target.body.user.id);
    expect(patch.body.isVerified).toBe(true);

    const pub = await request(app).get(`/api/v1/users/${target.body.user.id}`);
    expect(pub.statusCode).toBe(200);
    expect(pub.body.is_verified).toBe(true);
  });

  it("passes Stripe Connect checkout params from product platform_fee_bps", async () => {
    let checkoutArgs = null;
    const mockMonetizationGateway = {
      createCheckoutSession: jest.fn(async (args) => {
        checkoutArgs = args;
        return { id: "cs_test_integration", url: "https://checkout.test/session" };
      }),
      constructWebhookEvent: () => {
        throw new Error("webhook not used in this test");
      },
      retrieveCheckoutSession: jest.fn(),
      createConnectedAccount: jest.fn(),
      retrieveConnectedAccount: jest.fn(),
      createOnboardingLink: jest.fn(),
      createDashboardLink: jest.fn(),
      listConnectAccountPrices: jest.fn(async () => ({ data: [], has_more: false })),
      retrieveConnectAccountPrice: jest.fn(),
      retrieveConnectAccountProduct: jest.fn()
    };

    const testApp = createApp({
      config,
      logger,
      db,
      analytics,
      mediaStorage,
      pushNotifications,
      monetizationGateway: mockMonetizationGateway
    });

    const sellerReg = await request(testApp).post("/api/v1/auth/register").send({
      email: "seller-connect@example.com",
      username: "seller_connect",
      password: "StrongPass123",
      displayName: "Seller Connect"
    });
    expect(sellerReg.statusCode).toBe(201);
    const buyerReg = await request(testApp).post("/api/v1/auth/register").send({
      email: "buyer-connect@example.com",
      username: "buyer_connect",
      password: "StrongPass123",
      displayName: "Buyer Connect"
    });
    expect(buyerReg.statusCode).toBe(201);

    await db.query(
      `INSERT INTO creator_payout_accounts (
         user_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, country
       ) VALUES ($1, 'acct_test_123', true, true, true, 'US')`,
      [sellerReg.body.user.id]
    );

    expect(
      (
        await request(testApp)
          .patch("/api/v1/users/me/preferences")
          .set("Authorization", `Bearer ${sellerReg.body.tokens.accessToken}`)
          .send({ usagePersona: "professional", preferenceSource: "test" })
      ).statusCode
    ).toBe(200);
    const productResAfterPersona = await request(testApp)
      .post("/api/v1/monetization/products")
      .set("Authorization", `Bearer ${sellerReg.body.tokens.accessToken}`)
      .send({
        title: "Connect Test Product",
        description: "Test",
        priceMinor: 10000,
        currency: "usd",
        deliveryMediaKey: "uploads/test/key.pdf",
        platformFeeBps: 1000
      });
    expect(productResAfterPersona.statusCode).toBe(201);
    expect(productResAfterPersona.body.platform_fee_bps).toBe(1000);

    await request(testApp)
      .post(`/api/v1/monetization/products/${productResAfterPersona.body.id}/publish`)
      .set("Authorization", `Bearer ${sellerReg.body.tokens.accessToken}`);

    const checkout = await request(testApp)
      .post(`/api/v1/monetization/checkout/product/${productResAfterPersona.body.id}`)
      .set("Authorization", `Bearer ${buyerReg.body.tokens.accessToken}`)
      .send({});

    expect(checkout.statusCode).toBe(200);
    expect(checkout.body.checkoutUrl).toBeDefined();
    expect(mockMonetizationGateway.createCheckoutSession).toHaveBeenCalled();
    expect(checkoutArgs.connectedAccountId).toBe("acct_test_123");
    expect(checkoutArgs.applicationFeeAmountMinor).toBe(1000);
    expect(checkoutArgs.platformFeeBps).toBe(1000);

    const sessionRow = await db.query(`SELECT metadata FROM checkout_sessions WHERE stripe_checkout_session_id = $1`, [
      "cs_test_integration"
    ]);
    expect(sessionRow.rows[0].metadata.platformFeeBps).toBe(1000);
    expect(sessionRow.rows[0].metadata.stripeApplicationFeeMinor).toBe(1000);
  });

  it("lets the author fetch post distribution metrics", async () => {
    const reg = await request(app).post("/api/v1/auth/register").send({
      email: "dist-author@example.com",
      username: "dist_author",
      password: "StrongPass123",
      displayName: "Dist Author"
    });
    expect(reg.statusCode).toBe(201);
    const token = reg.body.tokens.accessToken;
    const post = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        postType: "post",
        content: "Distribution metrics test"
      });
    expect(post.statusCode).toBe(201);
    const dist = await request(app)
      .get(`/api/v1/posts/${post.body.id}/distribution`)
      .set("Authorization", `Bearer ${token}`);
    expect(dist.statusCode).toBe(200);
    expect(dist.body.postId).toBe(post.body.id);
    expect(typeof dist.body.viewCount).toBe("number");

    const other = await request(app).post("/api/v1/auth/register").send({
      email: "dist-other@example.com",
      username: "dist_other",
      password: "StrongPass123",
      displayName: "Dist Other"
    });
    expect(other.statusCode).toBe(201);
    const blocked = await request(app)
      .get(`/api/v1/posts/${post.body.id}/distribution`)
      .set("Authorization", `Bearer ${other.body.tokens.accessToken}`);
    expect(blocked.statusCode).toBe(404);
  });

  it("excludes video from feed until processing when MEDIA_ASYNC_VIDEO_PROCESSING=true", async () => {
    const asyncConfig = loadEnv({
      ...process.env,
      NODE_ENV: "test",
      DB_SSL_MODE: process.env.DB_SSL_MODE || "disable",
      CORS_ORIGINS: process.env.CORS_ORIGINS || "http://localhost:3000",
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "test-access",
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "test-refresh",
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "test-google-client-id",
      ADMIN_OWNER_EMAIL: process.env.ADMIN_OWNER_EMAIL || "admin-growth@example.com",
      PROCESSING_WEBHOOK_TOKEN: process.env.PROCESSING_WEBHOOK_TOKEN || "test-processing-token",
      MEDIA_PROVIDER: "mock",
      MEDIA_PUBLIC_BASE_URL: process.env.MEDIA_PUBLIC_BASE_URL || "https://media.test-cdn.example",
      MEDIA_ASYNC_VIDEO_PROCESSING: "true"
    });

    const asyncLogger = createLogger({ ...asyncConfig, logLevel: "silent" });
    const asyncDb = createDb(asyncConfig);
    try {
      const asyncAnalytics = createAnalytics({ db: asyncDb, logger: asyncLogger });
      const asyncMediaStorage = createMediaStorage(asyncConfig);
      const asyncPush = createPushNotifications({ db: asyncDb, logger: asyncLogger });
      const asyncApp = createApp({
        config: asyncConfig,
        logger: asyncLogger,
        db: asyncDb,
        analytics: asyncAnalytics,
        mediaStorage: asyncMediaStorage,
        pushNotifications: asyncPush
      });

      const ts = Date.now();
      const reg = await request(asyncApp).post("/api/v1/auth/register").send({
        email: `async-vid-${ts}@example.com`,
        username: `async_vid_${ts}`,
        password: "StrongPass123",
        displayName: "Async Vid"
      });
      expect(reg.statusCode).toBe(201);
      const token = reg.body.tokens.accessToken;
      const userId = reg.body.user.id;

      const created = await request(asyncApp)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ postType: "post", content: "video pending processing" });
      expect(created.statusCode).toBe(201);

      const attach = await request(asyncApp)
        .post(`/api/v1/media/posts/${created.body.id}/attach`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          mediaKey: "uploads/async/pending.mp4",
          mediaUrl: "uploads/async/pending.mp4",
          mimeType: "video/mp4",
          fileSizeBytes: 2048
        });
      expect(attach.statusCode).toBe(200);
      expect(attach.body.media_status).toBe("processing");

      const feedBefore = await request(asyncApp).get(`/api/v1/feed?authorId=${userId}&limit=10`);
      expect(feedBefore.statusCode).toBe(200);
      expect(feedBefore.body.items.some((item) => item.id === created.body.id)).toBe(false);

      const processed = await request(asyncApp)
        .post(`/api/v1/media/processing/post/${created.body.id}`)
        .set("x-processing-token", asyncConfig.processingWebhookToken)
        .send({ status: "ready", mediaUrl: "uploads/async/pending.mp4" });
      expect(processed.statusCode).toBe(200);

      const feedAfter = await request(asyncApp).get(`/api/v1/feed?authorId=${userId}&limit=10`);
      expect(feedAfter.statusCode).toBe(200);
      expect(feedAfter.body.items.some((item) => item.id === created.body.id)).toBe(true);
    } finally {
      await asyncDb.close();
    }
  });

  it("creates a published business and lists it in near query", async () => {
    const ts = Date.now();
    const reg = await request(app).post("/api/v1/auth/register").send({
      email: `biz-owner-${ts}@example.com`,
      username: `biz_owner_${ts}`,
      password: "StrongPass123",
      displayName: "Biz Owner"
    });
    expect(reg.statusCode).toBe(201);
    const token = reg.body.tokens.accessToken;
    const create = await request(app)
      .post("/api/v1/businesses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Integration Cafe",
        description: "Coffee and tests",
        latitude: 40.73,
        longitude: -73.99,
        visibility: "published"
      });
    expect(create.statusCode).toBe(201);
    const bizId = create.body.id;
    const near = await request(app).get("/api/v1/businesses/near?lat=40.73&lng=-73.99&radiusM=100000&limit=20");
    expect(near.statusCode).toBe(200);
    expect(Array.isArray(near.body.items)).toBe(true);
    expect(near.body.items.some((b) => b.id === bizId)).toBe(true);
  });
});
