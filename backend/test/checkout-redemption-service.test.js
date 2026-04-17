const {
  createRewardsCheckoutService,
  buildRulesConfigFromAppConfig
} = require("../src/modules/rewards/rewards-checkout-service");
const { InsufficientPointsError } = require("../src/modules/rewards/rewards-ledger-errors");
const { createRewardsLedgerService } = require("../src/modules/rewards/rewards-ledger-service");
const {
  createMemoryRewardsLedgerRepository,
  createMemoryDb
} = require("./helpers/memory-rewards-ledger-repository");

function baseAppConfig(overrides = {}) {
  return {
    rewardsMinBalanceMinor: 500,
    rewardsMaxPointsPerRedemptionMinor: 10_000,
    rewardsCooldownHoursBetweenRedemptions: 24,
    rewardsMinOrderAmountRemainingMinor: 50,
    rewardsMaxCheckoutDiscountBps: 5000,
    rewardsPointsPerFiatMinorUnit: 100,
    rewardsCurrencyCode: "DEEN_PTS",
    rewardsPointsDecimals: 0,
    rewardsMaxEarnPerUserPerDayMinor: 5000,
    rewardsMaxEarnPerUserPerMonthMinor: 50_000,
    rewardsMaxSingleGrantMinor: 2000,
    rewardsMinGrantMinor: 1,
    rewardsRulesMaxGrantsPerRollingHour: 40,
    rewardsRulesMinSecondsBetweenGrantsSameTarget: 45,
    rewardsRulesMinQualityForEngagementEarn: 0.55,
    rewardsRulesMinDwellSecondsForReaction: 3,
    rewardsReversalFullRefundClawbackRatio: 1,
    rewardsReversalPartialRefundClawbackRatio: 0.5,
    rewardsReversalChargebackClawbackRatio: 1,
    rewardsReversalMaxAgeDays: 120,
    ...overrides
  };
}

describe("rewards-checkout-service", () => {
  it("preview returns 404 when product is missing", async () => {
    const mem = createMemoryDb();
    const db = {
      ...mem,
      query: jest.fn(async (sql, params) => {
        if (String(sql).includes("FROM creator_products")) {
          return { rows: [], rowCount: 0 };
        }
        return mem.query(sql, params);
      })
    };
    const repository = createMemoryRewardsLedgerRepository();
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const rewardsLedgerService = createRewardsLedgerService({ db, analytics, logger: null, repository });
    const checkout = createRewardsCheckoutService({
      db,
      rewardsLedgerService,
      config: baseAppConfig(),
      logger: null
    });
    const r = await checkout.previewProductRedemption({
      userId: 1,
      productId: 99,
      requestedPointsMinor: null,
      redeemEnabled: true
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });

  it("preview eligible: plan allows spend when balance and product qualify", async () => {
    const productRow = {
      id: 1,
      price_minor: 5000,
      currency: "usd",
      status: "published",
      creator_user_id: 2,
      rewards_redemption_eligible: true
    };
    const mem = createMemoryDb();
    const db = {
      ...mem,
      query: jest.fn(async (sql, params) => {
        if (String(sql).includes("FROM creator_products")) {
          return { rows: [productRow], rowCount: 1 };
        }
        return mem.query(sql, params);
      })
    };
    const repository = createMemoryRewardsLedgerRepository();
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const rewardsLedgerService = createRewardsLedgerService({ db, analytics, logger: null, repository });
    const checkout = createRewardsCheckoutService({
      db,
      rewardsLedgerService,
      config: baseAppConfig(),
      logger: null
    });
    await rewardsLedgerService.earnPoints({
      userId: 3,
      points: 20_000,
      reason: "test",
      idempotencyKey: "earn-prev-3"
    });
    const r = await checkout.previewProductRedemption({
      userId: 3,
      productId: 1,
      requestedPointsMinor: null,
      redeemEnabled: true
    });
    expect(r.ok).toBe(true);
    expect(r.plan.allow).toBe(true);
    expect(r.plan.pointsToSpend).toBeGreaterThan(0);
    expect(r.plan.chargedMinor).toBeLessThan(5000);
  });

  it("preview ineligible when product is not rewards-eligible", async () => {
    const productRow = {
      id: 2,
      price_minor: 3000,
      currency: "usd",
      status: "published",
      creator_user_id: 2,
      rewards_redemption_eligible: false
    };
    const mem = createMemoryDb();
    const db = {
      ...mem,
      query: jest.fn(async (sql, params) => {
        if (String(sql).includes("FROM creator_products")) {
          return { rows: [productRow], rowCount: 1 };
        }
        return mem.query(sql, params);
      })
    };
    const repository = createMemoryRewardsLedgerRepository();
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const rewardsLedgerService = createRewardsLedgerService({ db, analytics, logger: null, repository });
    const checkout = createRewardsCheckoutService({
      db,
      rewardsLedgerService,
      config: baseAppConfig(),
      logger: null
    });
    await rewardsLedgerService.earnPoints({
      userId: 4,
      points: 50_000,
      reason: "test",
      idempotencyKey: "earn-prev-4"
    });
    const r = await checkout.previewProductRedemption({
      userId: 4,
      productId: 2,
      requestedPointsMinor: null,
      redeemEnabled: true
    });
    expect(r.ok).toBe(true);
    expect(r.plan.allow).toBe(false);
    expect(r.plan.denyReasons).toContain("product_not_eligible");
  });

  it("preview ineligible when balance below min balance (rules)", async () => {
    const productRow = {
      id: 3,
      price_minor: 8000,
      currency: "usd",
      status: "published",
      creator_user_id: 2,
      rewards_redemption_eligible: true
    };
    const mem = createMemoryDb();
    const db = {
      ...mem,
      query: jest.fn(async (sql, params) => {
        if (String(sql).includes("FROM creator_products")) {
          return { rows: [productRow], rowCount: 1 };
        }
        return mem.query(sql, params);
      })
    };
    const repository = createMemoryRewardsLedgerRepository();
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const rewardsLedgerService = createRewardsLedgerService({ db, analytics, logger: null, repository });
    const checkout = createRewardsCheckoutService({
      db,
      rewardsLedgerService,
      config: baseAppConfig({ rewardsMinBalanceMinor: 500 }),
      logger: null
    });
    await rewardsLedgerService.earnPoints({
      userId: 6,
      points: 100,
      reason: "test",
      idempotencyKey: "earn-prev-6"
    });
    const r = await checkout.previewProductRedemption({
      userId: 6,
      productId: 3,
      requestedPointsMinor: null,
      redeemEnabled: true
    });
    expect(r.ok).toBe(true);
    expect(r.plan.allow).toBe(false);
    expect(r.plan.denyReasons).toContain("below_min_balance");
  });

  it("reverseActiveCheckoutRedemptionIfAny reverses ledger spend and updates redemption row", async () => {
    const mem = createMemoryDb();
    const ledger = createMemoryRewardsLedgerRepository();
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const rewardsLedgerService = createRewardsLedgerService({
      db: mem,
      analytics,
      logger: null,
      repository: ledger
    });
    await rewardsLedgerService.earnPoints({
      userId: 5,
      points: 1000,
      reason: "test",
      idempotencyKey: "earn-rev-5"
    });
    const spend = await rewardsLedgerService.spendPoints({
      userId: 5,
      points: 200,
      reason: "redemption_catalog",
      idempotencyKey: "checkout:product:5:cid",
      metadata: { surface: "product_checkout" }
    });
    const metaLedgerId = spend.ledgerEntry.id;
    const db = {
      ...mem,
      query: jest.fn(async (text, params) => {
        const t = String(text);
        if (t.includes("FROM checkout_sessions") && t.includes("stripe_checkout_session_id")) {
          return {
            rowCount: 1,
            rows: [{ buyer_user_id: 5, metadata: { rewardSpendLedgerEntryId: metaLedgerId } }]
          };
        }
        if (t.includes("UPDATE checkout_reward_redemptions")) {
          return { rowCount: 1, rows: [] };
        }
        return mem.query(text, params);
      })
    };
    const checkout = createRewardsCheckoutService({
      db,
      rewardsLedgerService,
      config: baseAppConfig(),
      logger: null
    });
    await checkout.reverseActiveCheckoutRedemptionIfAny({
      stripeSessionId: "cs_test_1",
      reasonLabel: "checkout_expired"
    });
    const bal = await rewardsLedgerService.getBalance({ userId: 5 });
    expect(bal.balancePoints).toBe("1000");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE checkout_reward_redemptions"),
      expect.any(Array)
    );
  });

  it("reverseActiveCheckoutRedemptionIfAny records trust flag when signals enabled", async () => {
    const mem = createMemoryDb();
    const ledger = createMemoryRewardsLedgerRepository();
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const rewardsLedgerService = createRewardsLedgerService({
      db: mem,
      analytics,
      logger: null,
      repository: ledger
    });
    await rewardsLedgerService.earnPoints({
      userId: 8,
      points: 500,
      reason: "test",
      idempotencyKey: "earn-rev-8"
    });
    const spend = await rewardsLedgerService.spendPoints({
      userId: 8,
      points: 100,
      reason: "redemption_catalog",
      idempotencyKey: "checkout:product:8:cid2",
      metadata: { surface: "product_checkout" }
    });
    const metaLedgerId = spend.ledgerEntry.id;
    const db = {
      ...mem,
      query: jest.fn(async (text, params) => {
        const t = String(text);
        if (t.includes("FROM checkout_sessions") && t.includes("stripe_checkout_session_id")) {
          return {
            rowCount: 1,
            rows: [{ buyer_user_id: 8, metadata: { rewardSpendLedgerEntryId: metaLedgerId } }]
          };
        }
        if (t.includes("UPDATE checkout_reward_redemptions")) {
          return { rowCount: 1, rows: [] };
        }
        return mem.query(text, params);
      })
    };
    const recordFlag = jest.fn(async () => ({ saved: { id: 1 } }));
    const checkout = createRewardsCheckoutService({
      db,
      rewardsLedgerService,
      config: baseAppConfig({ trustSignalsEnabled: true }),
      logger: null,
      trustFlagService: { recordFlag }
    });
    await checkout.reverseActiveCheckoutRedemptionIfAny({
      stripeSessionId: "cs_test_trust",
      reasonLabel: "checkout_refund"
    });
    expect(recordFlag).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        domain: "rewards",
        flagType: "rewards_checkout_redemption_reversed",
        subjectUserId: 8
      })
    );
  });

  it("buildRulesConfigFromAppConfig fills redemption slice from defaults when env keys are missing", () => {
    const cfg = buildRulesConfigFromAppConfig({});
    expect(cfg.redemption.minBalanceMinor).toBe(500);
    expect(cfg.redemption.maxPointsPerRedemptionMinor).toBe(10_000);
    expect(cfg.redemption.pointsPerFiatMinorUnit).toBe(100);
  });

  it("planProductCheckoutRedemption matches preview plan for the same product row", async () => {
    const productRow = {
      id: 77,
      price_minor: 4000,
      currency: "usd",
      status: "published",
      creator_user_id: 2,
      rewards_redemption_eligible: true
    };
    const mem = createMemoryDb();
    const db = {
      ...mem,
      query: jest.fn(async (sql, params) => {
        if (String(sql).includes("FROM creator_products")) {
          return { rows: [productRow], rowCount: 1 };
        }
        return mem.query(sql, params);
      })
    };
    const repository = createMemoryRewardsLedgerRepository();
    const rewardsLedgerService = createRewardsLedgerService({
      db,
      analytics: { trackEvent: jest.fn(async () => {}) },
      logger: null,
      repository
    });
    await rewardsLedgerService.earnPoints({
      userId: 8,
      points: 15_000,
      reason: "test",
      idempotencyKey: "earn-8"
    });
    const checkout = createRewardsCheckoutService({
      db,
      rewardsLedgerService,
      config: baseAppConfig(),
      logger: null
    });
    const prev = await checkout.previewProductRedemption({
      userId: 8,
      productId: 77,
      requestedPointsMinor: 2000,
      redeemEnabled: true
    });
    const direct = await checkout.planProductCheckoutRedemption({
      userId: 8,
      product: productRow,
      redeemEnabled: true,
      requestedPointsMinor: 2000,
      requestedAtIso: prev.requestedAtIso
    });
    expect(direct.plan.allow).toBe(prev.plan.allow);
    expect(direct.plan.pointsToSpend).toBe(prev.plan.pointsToSpend);
    expect(direct.plan.chargedMinor).toBe(prev.plan.chargedMinor);
  });

  it("applyLedgerSpendForProductCheckout wraps insufficient balance as checkout error", async () => {
    const mem = createMemoryDb();
    const ledger = createMemoryRewardsLedgerRepository();
    const rewardsLedgerService = createRewardsLedgerService({
      db: mem,
      analytics: { trackEvent: jest.fn(async () => {}) },
      logger: null,
      repository: ledger
    });
    const mockSpend = jest.spyOn(rewardsLedgerService, "spendPoints").mockRejectedValueOnce(new InsufficientPointsError());
    const checkout = createRewardsCheckoutService({
      db: mem,
      rewardsLedgerService,
      config: baseAppConfig(),
      logger: null
    });
    const plan = { pointsToSpend: 100, discountMinor: 1, allow: true, denyReasons: [], chargedMinor: 99 };
    await expect(
      checkout.applyLedgerSpendForProductCheckout({
        userId: 1,
        plan,
        redeemClientRequestId: "client-req-1",
        productId: 9,
        listPriceMinor: 100
      })
    ).rejects.toMatchObject({ code: "insufficient_points_at_checkout", statusCode: 422 });
    mockSpend.mockRestore();
  });
});
