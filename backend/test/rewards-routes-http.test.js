const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const { authenticate } = require("../src/middleware/auth");
const { createRewardsRouter } = require("../src/modules/rewards/routes");
const { createRewardsReadService } = require("../src/modules/rewards/rewards-read-service");
const { createRewardsLedgerService } = require("../src/modules/rewards/rewards-ledger-service");
const {
  createMemoryRewardsLedgerRepository,
  createMemoryDb
} = require("./helpers/memory-rewards-ledger-repository");

describe("rewards user routes (GET /api/v1/rewards/*)", () => {
  const jwtSecret = "rewards-routes-test-secret";

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
    const repository = createMemoryRewardsLedgerRepository();
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const rewardsLedgerService = createRewardsLedgerService({ db, analytics, logger: null, repository });
    const readConfig = {
      rewardsMinBalanceMinor: 0,
      rewardsMaxPointsPerRedemptionMinor: 1000,
      rewardsCooldownHoursBetweenRedemptions: 0,
      rewardsMinOrderAmountRemainingMinor: 0,
      rewardsMaxCheckoutDiscountBps: 1000,
      rewardsPointsPerFiatMinorUnit: 1
    };
    const rewardsReadService = createRewardsReadService({
      db,
      rewardsLedgerService,
      config: readConfig,
      analytics,
      logger: null
    });
    const app = express();
    app.use(express.json());
    const api = express.Router();
    api.use("/rewards", authenticate({ config, db }), createRewardsRouter({ config, db, rewardsReadService }));
    app.use("/api/v1", api);
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({ status: "error", message: err.message || "error" });
    });
    return { app, analytics, rewardsLedgerService };
  }

  function bearer(userId) {
    const token = jwt.sign({ sub: userId }, jwtSecret, { expiresIn: "1h" });
    return `Bearer ${token}`;
  }

  it("returns 401 without token for GET /me", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/v1/rewards/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 for GET /me with invalid token", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/v1/rewards/me").set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("returns wallet DTO and emits rewards_wallet_viewed", async () => {
    const { app, analytics, rewardsLedgerService } = buildApp();
    await rewardsLedgerService.earnPoints({
      userId: 99,
      points: 25,
      reason: "test_grant",
      idempotencyKey: "http-wallet-1"
    });
    const res = await request(app).get("/api/v1/rewards/me").set("Authorization", bearer(99));
    expect(res.status).toBe(200);
    expect(res.body.balancePoints).toBe("25");
    expect(res.body.currencyCode).toBe("DEEN_PTS");
    expect(Number.isInteger(res.body.pointsDecimals)).toBe(true);
    expect(res.body).toHaveProperty("lastCatalogCheckoutRedemptionAt");
    expect(res.body.display).toMatchObject({
      balanceTitleKey: expect.stringMatching(/^rewards\.wallet\./),
      ledgerSectionTitleKey: expect.stringMatching(/^rewards\.wallet\./),
      historyHintKey: expect.stringMatching(/^rewards\.wallet\./)
    });
    expect(analytics.trackEvent).toHaveBeenCalledWith("rewards_wallet_viewed", { userId: 99 });
  });

  it("returns ledger page and emits rewards_ledger_viewed", async () => {
    const { app, analytics, rewardsLedgerService } = buildApp();
    await rewardsLedgerService.earnPoints({
      userId: 100,
      points: 3,
      reason: "test_grant",
      idempotencyKey: "http-ledger-1"
    });
    jest.clearAllMocks();
    const res = await request(app)
      .get("/api/v1/rewards/ledger")
      .query({ limit: 10 })
      .set("Authorization", bearer(100));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body).toHaveProperty("nextCursor");
    const item = res.body.items.find((x) => x.reason === "test_grant");
    expect(item).toBeTruthy();
    expect(item.display).toMatchObject({
      variant: "earn",
      titleKey: expect.stringMatching(/^rewards\.ledger\.earn\./)
    });
    expect(item).toHaveProperty("ledgerReasonKey");
    expect(item).toHaveProperty("source");
    expect(item).toHaveProperty("reversalOf");
    expect(item).toHaveProperty("redemption");
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "rewards_ledger_viewed",
      expect.objectContaining({ userId: 100 })
    );
  });
});
