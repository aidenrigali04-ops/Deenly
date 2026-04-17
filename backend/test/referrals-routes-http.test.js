const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createReferralsRouter } = require("../src/modules/referrals/routes");
const { createReferralReadService } = require("../src/modules/referrals/referral-read-service");
const { createReferralService } = require("../src/modules/referrals/referral-service");
const { createRewardsLedgerService } = require("../src/modules/rewards/rewards-ledger-service");
const { createMemoryReferralRepository } = require("./helpers/memory-referral-repository");
const {
  createMemoryRewardsLedgerRepository,
  createMemoryDb
} = require("./helpers/memory-rewards-ledger-repository");

describe("referrals user routes (GET/POST /api/v1/referrals/*)", () => {
  const jwtSecret = "referrals-routes-test-secret";

  function makeTestAppConfig() {
    return {
      trustSignalsEnabled: false,
      referralAttributionWindowDays: 30,
      referralMaxReferrerRewardsPerDay: 50,
      referralDefaultCodeMaxRedemptions: 100,
      referralReferrerRewardPointsMinor: 500,
      referralRefereeRewardPointsMinor: 0,
      referralMinQualifyingOrderAmountMinor: 1,
      referralQualifyingOrderKinds: ["product"],
      referralHoldClearHoursAfterOrder: 0,
      referralAllowBuyerIsSeller: false,
      appBaseUrl: "https://app.example.com"
    };
  }

  function mapAppConfigToReferralDomain(c) {
    return {
      attributionWindowDays: c.referralAttributionWindowDays,
      maxReferrerRewardsPerDay: c.referralMaxReferrerRewardsPerDay,
      defaultCodeMaxRedemptions: c.referralDefaultCodeMaxRedemptions,
      cooldownHoursBetweenSelfChecks: 24,
      referrerRewardPointsMinor: c.referralReferrerRewardPointsMinor,
      refereeRewardPointsMinor: c.referralRefereeRewardPointsMinor,
      minQualifyingOrderAmountMinor: c.referralMinQualifyingOrderAmountMinor,
      qualifyingOrderKinds: c.referralQualifyingOrderKinds,
      holdClearHoursAfterOrder: c.referralHoldClearHoursAfterOrder,
      allowBuyerIsSellerForQualification: c.referralAllowBuyerIsSeller
    };
  }

  function createTestDb() {
    const base = createMemoryDb();
    return {
      withTransaction: base.withTransaction.bind(base),
      query: async (text, params) => {
        const t = String(text || "");
        if (/FROM users WHERE id = \$1 LIMIT 1/i.test(t)) {
          return {
            rowCount: 1,
            rows: [
              {
                id: Number(params[0]),
                email: "user@test.com",
                username: "user",
                role: "user",
                is_active: true,
                created_at: new Date()
              }
            ]
          };
        }
        return base.query(text, params);
      }
    };
  }

  function buildApp() {
    const config = { jwtAccessSecret: jwtSecret };
    const db = createTestDb();
    const appConfig = makeTestAppConfig();
    const memRepo = createMemoryReferralRepository();
    const memLedgerRepo = createMemoryRewardsLedgerRepository();
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const rewardsLedger = createRewardsLedgerService({
      db,
      analytics,
      logger: null,
      repository: memLedgerRepo
    });
    const referralService = createReferralService({
      db,
      repository: memRepo,
      rewardsLedger,
      analytics,
      logger: null,
      getReferralConfig: () => mapAppConfigToReferralDomain(appConfig),
      appConfig
    });
    const referralReadService = createReferralReadService({
      db,
      referralRepository: memRepo,
      referralService,
      appConfig,
      analytics,
      logger: null
    });
    const app = express();
    app.use(express.json());
    const api = express.Router();
    api.use("/referrals", createReferralsRouter({ config, db, referralReadService }));
    app.use("/api/v1", api);
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({ status: "error", message: err.message || "error" });
    });
    return { app, analytics, memRepo };
  }

  function bearer(userId) {
    const token = jwt.sign({ sub: userId }, jwtSecret, { expiresIn: "1h" });
    return `Bearer ${token}`;
  }

  it("returns 401 without token for GET /me", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/v1/referrals/me");
    expect(res.status).toBe(401);
  });

  it("GET /code-preview returns 400 without code", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/v1/referrals/code-preview");
    expect(res.status).toBe(400);
  });

  it("GET /code-preview returns DTO without auth and emits referral_code_preview_viewed", async () => {
    const { app, analytics, memRepo } = buildApp();
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 800,
      code: "HttpPeek",
      status: "active",
      max_redemptions: 10
    });
    jest.clearAllMocks();
    const res = await request(app).get("/api/v1/referrals/code-preview").query({ code: "HttpPeek" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true, exhausted: false });
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "referral_code_preview_viewed",
      expect.objectContaining({ valid: true, reason: null, exhausted: false })
    );
  });

  it("GET /code-preview returns invalid DTO for unknown code", async () => {
    const { app, analytics } = buildApp();
    jest.clearAllMocks();
    const res = await request(app).get("/api/v1/referrals/code-preview").query({ code: "missing" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false, reason: "invalid_code" });
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "referral_code_preview_viewed",
      expect.objectContaining({ valid: false, reason: "invalid_code", exhausted: null })
    );
  });

  it("returns referrals DTO and emits referral_program_viewed", async () => {
    const { app, analytics } = buildApp();
    const res = await request(app).get("/api/v1/referrals/me").set("Authorization", bearer(42));
    expect(res.status).toBe(200);
    expect(res.body.code).not.toBeNull();
    expect(res.body.code.code.length).toBeGreaterThan(0);
    expect(res.body.code.suggestedShareUrl).toContain("/auth/signup?referralCode=");
    expect(res.body).toHaveProperty("attributionAsReferee");
    expect(res.body).toHaveProperty("qualifiedReferralsCount");
    expect(analytics.trackEvent).toHaveBeenCalledWith("referral_program_viewed", { userId: 42 });
  });

  it("POST /me/share returns ok and emits referral_share_recorded", async () => {
    const { app, analytics } = buildApp();
    jest.clearAllMocks();
    const res = await request(app)
      .post("/api/v1/referrals/me/share")
      .set("Authorization", bearer(7))
      .send({ surface: "copy_link" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "referral_share_recorded",
      expect.objectContaining({ userId: 7, surface: "copy_link" })
    );
  });

  it("POST /me/share rejects non-string surface", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/api/v1/referrals/me/share")
      .set("Authorization", bearer(8))
      .send({ surface: 123 });
    expect(res.status).toBe(400);
  });
});
