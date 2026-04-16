/**
 * Sprint 2 — Checkout Lifecycle Integration Tests
 *
 * Exercises the full checkout service with real rulesEngine and stubbed
 * ledger/tier/streak/db. Verifies: earn preview, redemption preview,
 * apply redemption, confirm earn, refund/void, idempotency, cap enforcement.
 *
 * No real database required — all I/O is intercepted at the service layer.
 */

const { createCheckoutService } = require("../../src/services/reward-checkout");
const { createRewardRulesEngine } = require("../../src/services/reward-rules-engine");
const {
  makeDbStub,
  makeRewardConfigStub,
  makeAnalyticsStub,
  makeLoggerStub,
} = require("../../src/services/__test-helpers__/reward-stubs");

// ─── Shared Config ────────────────────────────────────────────────────────────

const BASE_CONFIG = {
  points_per_dollar: 10,
  min_order_amount_minor: 2500,    // $25 minimum
  min_order_for_earn_minor: 2500,
  min_redemption_points: 500,
  max_redemption_pct: 15,          // 15% of cart max
  max_redemption_cap_minor: 2000,  // $20 hard cap
  points_to_dollar_ratio: 100,     // 100 DP = $1
  tier_multiplier: 1.0,
  streak_multiplier: 1.0,
  daily_earn_cap: 10000,
};

const TIER_MULTIPLIERS = { explorer: 1.0, member: 1.25, insider: 1.5, vip: 2.0, elite: 3.0 };
const STREAK_MULTIPLIERS = { 1: 1.0, 7: 1.5, 14: 2.0, 31: 3.0 };

function makeFullConfig(overrides = {}) {
  const cfg = { ...BASE_CONFIG, ...overrides };
  const rewardConfig = makeRewardConfigStub(cfg);

  // Wire up the specific getNumber calls the rules engine and checkout service use
  rewardConfig.getNumber = jest.fn(async (key) => {
    const map = {
      points_per_dollar: cfg.points_per_dollar,
      min_order_amount_minor: cfg.min_order_amount_minor,
      min_order_for_earn_minor: cfg.min_order_for_earn_minor,
      min_redemption_points: cfg.min_redemption_points,
      max_redemption_pct: cfg.max_redemption_pct,
      max_redemption_cap_minor: cfg.max_redemption_cap_minor,
      points_to_dollar_ratio: cfg.points_to_dollar_ratio,
    };
    return map[key] ?? 0;
  });

  rewardConfig.get = jest.fn(async (key) => {
    const map = {
      points_per_dollar: cfg.points_per_dollar,
      min_order_amount_minor: cfg.min_order_amount_minor,
    };
    return map[key] ?? null;
  });

  // Tier-aware multiplier lookup (rules engine calls this with tier string)
  rewardConfig.getTierMultiplier = jest.fn(async (tier) =>
    TIER_MULTIPLIERS[tier] ?? 1.0
  );

  // Streak-aware multiplier lookup
  rewardConfig.getStreakMultiplier = jest.fn(async (days) => {
    if (days >= 31) return 3.0;
    if (days >= 14) return 2.0;
    if (days >= 7) return 1.5;
    return 1.0;
  });

  rewardConfig.getDailyEarnCap = jest.fn(async () => cfg.daily_earn_cap);

  return rewardConfig;
}

// ─── Service Stack Factory ────────────────────────────────────────────────────

function buildCheckoutStack({
  tier = "member",
  streakMultiplier = 1.5,  // 7-day streak
  balance = 5000,
  earnedToday = 0,
  dailyCap = 10000,
  isFrozen = false,
  existingEntries = {},   // { "earn:orderId": entry, "redeem:orderId": entry }
} = {}) {
  const { db } = makeDbStub();
  const analytics = makeAnalyticsStub();
  const logger = makeLoggerStub();
  const rewardConfig = makeFullConfig({ daily_earn_cap: dailyCap });

  // rulesEngine uses the real implementation
  const rulesEngine = createRewardRulesEngine({ rewardConfig });

  // Ledger entry store for idempotency/refund
  const entries = { ...existingEntries };
  const voidedIds = new Set();
  const credits = [];
  const debits = [];

  const ledgerService = {
    ensureAccount: jest.fn(async () => ({
      user_id: 1, balance, tier, streak_current: 5,
      points_earned_today: earnedToday,
      points_earned_today_date: new Date().toISOString().slice(0, 10),
      is_frozen: isFrozen,
    })),
    getAccountState: jest.fn(async () => ({
      balance,
      tier,
      streak: { multiplier: streakMultiplier },
      is_frozen: isFrozen,
      frozen: isFrozen,
      daily_earn: { earned_today: earnedToday, cap_today: dailyCap },
    })),
    // ledger service returns camelCase (earnedToday not earned_today)
    getDailyEarnStatus: jest.fn(async () => ({
      earnedToday,           // camelCase — matches ledger service implementation
      capToday: dailyCap,
      remaining: Math.max(0, dailyCap - earnedToday),
    })),
    creditPoints: jest.fn(async (params) => {
      // Idempotency short-circuit: same key → return existing entry
      if (params.idempotencyKey && entries[params.idempotencyKey]) {
        return entries[params.idempotencyKey];
      }
      const entry = {
        id: `credit-${credits.length + 1}`,
        amount: params.amount,
        balance_after: balance + params.amount,
        idempotency_key: params.idempotencyKey,
      };
      credits.push(entry);
      if (params.idempotencyKey) entries[params.idempotencyKey] = entry;
      return entry;
    }),
    debitPoints: jest.fn(async (params) => {
      // Idempotency short-circuit
      if (params.idempotencyKey && entries[params.idempotencyKey]) {
        return entries[params.idempotencyKey];
      }
      if (params.amount > balance) {
        const { httpError } = require("../../src/utils/http-error");
        throw httpError(422, "Insufficient balance");
      }
      const entry = {
        id: `debit-${debits.length + 1}`,
        amount: params.amount,
        balance_after: balance - params.amount,
        idempotency_key: params.idempotencyKey,
      };
      debits.push(entry);
      if (params.idempotencyKey) entries[params.idempotencyKey] = entry;
      return entry;
    }),
    voidEntry: jest.fn(async ({ ledgerEntryId, reason }) => {
      voidedIds.add(ledgerEntryId);
      return { voidedEntryId: ledgerEntryId, offsetEntryId: `offset-${ledgerEntryId}`, amount: 100 };
    }),
  };

  const tierService = {
    getTierInfo: jest.fn(async () => ({
      tier,
      multiplier: tier === "member" ? 1.25 : tier === "insider" ? 1.5 : 1.0,
      rolling_12m_points: 2000,
      next_tier: "insider",
      next_threshold: 5000,
      progress: 0.4,
    })),
    requalify: jest.fn(async () => ({ changed: false, direction: null })),
  };

  const streakService = {
    getStreakState: jest.fn(async () => ({
      current: 7,
      multiplier: streakMultiplier,
      checked_in_today: false,
    })),
  };

  // Wire db to handle idempotency lookups (refundOrder uses db.query directly)
  db.on(/SELECT \* FROM reward_ledger_entries WHERE idempotency_key/, (_sql, params) => {
    const key = params[0];
    const entry = entries[key];
    if (!entry) return { rowCount: 0, rows: [] };
    return {
      rowCount: 1,
      rows: [{ ...entry, voided_at: voidedIds.has(entry.id) ? new Date() : null }],
    };
  });

  const svc = createCheckoutService({
    db, ledgerService, rulesEngine, tierService, streakService, rewardConfig, analytics, logger,
  });

  return { svc, ledgerService, tierService, streakService, analytics, credits, debits, voidedIds };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Checkout — previewEarn", () => {
  it("returns earn breakdown for member tier, 7-day streak on $50 order", async () => {
    const { svc } = buildCheckoutStack({ tier: "member", streakMultiplier: 1.5 });
    const preview = await svc.previewEarn({ userId: 1, cartTotalMinor: 5000 });

    // $50 × 10 DP/$1 = 500 base
    expect(preview.base_points).toBe(500);
    // member tier multiplier = 1.25, streak = 1.5 → combined = 1.875
    expect(preview.tier_multiplier).toBe(1.25);
    expect(preview.streak_multiplier).toBe(1.5);
    expect(preview.combined_multiplier).toBeCloseTo(1.875, 2);
    // final = floor(500 × 1.875) = 937
    expect(preview.earn_points).toBe(937);
    expect(preview.eligible).toBe(true);
    expect(preview.capped).toBe(false);
  });

  it("returns zero for empty cart", async () => {
    const { svc } = buildCheckoutStack();
    const preview = await svc.previewEarn({ userId: 1, cartTotalMinor: 0 });
    expect(preview.earn_points).toBe(0);
    expect(preview.reason).toBe("empty_cart");
  });

  it("returns ineligible for cart below minimum order", async () => {
    const { svc } = buildCheckoutStack();
    const preview = await svc.previewEarn({ userId: 1, cartTotalMinor: 1000 }); // $10 < $25 min
    expect(preview.eligible).toBe(false);
    expect(preview.earn_points).toBe(0);
  });

  it("caps earn at daily limit and sets capped=true", async () => {
    const { svc } = buildCheckoutStack({ earnedToday: 9800, dailyCap: 10000 });
    const preview = await svc.previewEarn({ userId: 1, cartTotalMinor: 5000 }); // would earn 937
    // only 200 remaining in cap
    expect(preview.earn_points).toBe(200);
    expect(preview.capped).toBe(true);
  });
});

describe("Checkout — previewRedemption", () => {
  it("computes max redeemable at 15% of $50 order with sufficient balance", async () => {
    const { svc } = buildCheckoutStack({ balance: 5000 });
    const preview = await svc.previewRedemption({ userId: 1, cartTotalMinor: 5000 });

    // 15% of $50 = $7.50 = 750 minor → 750 DP (100 DP = $1)
    expect(preview.max_points).toBe(750);
    expect(preview.discount_minor).toBe(750);
    expect(preview.eligible).toBe(true);
    expect(preview.balance).toBe(5000);
  });

  it("caps at hard cap of 2000 minor ($20) for large orders", async () => {
    const { svc } = buildCheckoutStack({ balance: 10000 });
    const preview = await svc.previewRedemption({ userId: 1, cartTotalMinor: 50000 }); // $500 order
    // 15% of $500 = $75 but hard cap is $20 → 2000 DP
    expect(preview.max_points).toBe(2000);
  });

  it("caps at user balance when balance < calculated max", async () => {
    const { svc } = buildCheckoutStack({ balance: 300 }); // only 300 DP
    const preview = await svc.previewRedemption({ userId: 1, cartTotalMinor: 5000 });
    // balance 300 < min 500 → ineligible
    expect(preview.eligible).toBe(false);
  });

  it("returns not eligible when account is frozen", async () => {
    const { svc } = buildCheckoutStack({ isFrozen: true });
    const preview = await svc.previewRedemption({ userId: 1, cartTotalMinor: 5000 });
    expect(preview.eligible).toBe(false);
    expect(preview.reason).toBe("account_frozen");
  });
});

describe("Checkout — applyRedemption", () => {
  it("debits points and returns discount on valid redemption", async () => {
    const { svc, debits, analytics } = buildCheckoutStack({ balance: 5000 });
    const result = await svc.applyRedemption({
      userId: 1,
      orderId: "order-1",
      pointsToRedeem: 500,
      cartTotalMinor: 5000,
    });

    expect(result.points_redeemed).toBe(500);
    expect(result.discount_minor).toBe(500); // 500 DP @ 100 DP/$1 = $5
    expect(debits).toHaveLength(1);
    expect(debits[0].idempotency_key).toBe("redeem:order-1");
    expect(analytics.events.find((e) => e.name === "rewards.points.redeemed")).toBeDefined();
  });

  it("is idempotent — second call with same orderId does not add a second debit entry", async () => {
    const { svc, debits } = buildCheckoutStack({ balance: 5000 });
    await svc.applyRedemption({ userId: 1, orderId: "order-1", pointsToRedeem: 500, cartTotalMinor: 5000 });
    await svc.applyRedemption({ userId: 1, orderId: "order-1", pointsToRedeem: 500, cartTotalMinor: 5000 });

    // Only one actual debit entry should exist (second call short-circuits)
    expect(debits).toHaveLength(1);
  });

  it("rejects when points exceed max_redeemable", async () => {
    const { svc } = buildCheckoutStack({ balance: 5000 });
    await expect(
      svc.applyRedemption({ userId: 1, orderId: "order-2", pointsToRedeem: 5000, cartTotalMinor: 5000 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("Checkout — confirmEarn", () => {
  it("credits points and triggers tier requalification", async () => {
    const { svc, credits, tierService, analytics } = buildCheckoutStack({ tier: "member" });
    const result = await svc.confirmEarn({ userId: 1, orderId: "order-1", paidAmountMinor: 5000 });

    expect(result.credited).toBe(true);
    expect(result.points).toBeGreaterThan(0);
    expect(credits[0].idempotency_key).toBe("earn:order-1");
    expect(tierService.requalify).toHaveBeenCalledWith(1);
    expect(analytics.events.find((e) => e.name === "rewards.points.earned")).toBeDefined();
  });

  it("is idempotent — second confirmEarn for same orderId does not add a second credit entry", async () => {
    const { svc, credits } = buildCheckoutStack();
    await svc.confirmEarn({ userId: 1, orderId: "order-1", paidAmountMinor: 5000 });
    await svc.confirmEarn({ userId: 1, orderId: "order-1", paidAmountMinor: 5000 });

    // Only one credit entry should exist (second call short-circuits via idempotency key)
    expect(credits).toHaveLength(1);
  });

  it("returns credited:false for zero-amount order", async () => {
    const { svc } = buildCheckoutStack();
    const result = await svc.confirmEarn({ userId: 1, orderId: "order-1", paidAmountMinor: 0 });
    expect(result.credited).toBe(false);
    expect(result.reason).toBe("zero_amount");
  });

  it("returns credited:false for below-minimum order", async () => {
    const { svc } = buildCheckoutStack();
    const result = await svc.confirmEarn({ userId: 1, orderId: "order-1", paidAmountMinor: 500 }); // $5 < $25
    expect(result.credited).toBe(false);
    expect(result.reason).toBe("below_min_order");
  });
});

describe("Checkout — refundOrder", () => {
  it("voids earn entry and redemption entry on refund", async () => {
    const { svc, voidedIds, analytics } = buildCheckoutStack({
      existingEntries: {
        "earn:order-1": { id: "earn-entry-1", amount: 500 },
        "redeem:order-1": { id: "redeem-entry-1", amount: 300 },
      },
    });

    const result = await svc.refundOrder({ userId: 1, orderId: "order-1" });

    expect(result.earn_voided).toBe(true);
    expect(result.redemption_voided).toBe(true);
    expect(voidedIds.has("earn-entry-1")).toBe(true);
    expect(voidedIds.has("redeem-entry-1")).toBe(true);
    expect(analytics.events.find((e) => e.name === "rewards.order.refunded")).toBeDefined();
  });

  it("only voids earn when no redemption was applied", async () => {
    const { svc, voidedIds } = buildCheckoutStack({
      existingEntries: {
        "earn:order-2": { id: "earn-entry-2", amount: 500 },
      },
    });

    const result = await svc.refundOrder({ userId: 1, orderId: "order-2" });

    expect(result.earn_voided).toBe(true);
    expect(result.redemption_voided).toBe(false);
    expect(voidedIds.size).toBe(1);
  });

  it("is a no-op when order has no reward entries", async () => {
    const { svc, voidedIds } = buildCheckoutStack(); // no existingEntries
    const result = await svc.refundOrder({ userId: 1, orderId: "order-3" });
    expect(result.earn_voided).toBe(false);
    expect(result.redemption_voided).toBe(false);
    expect(voidedIds.size).toBe(0);
  });

  it("skips already-voided entries without double-voiding", async () => {
    const { svc, ledgerService, voidedIds } = buildCheckoutStack({
      existingEntries: {
        "earn:order-1": { id: "earn-entry-1", amount: 500 },
      },
    });

    // First refund
    await svc.refundOrder({ userId: 1, orderId: "order-1" });
    // Second refund (entry now voided)
    await svc.refundOrder({ userId: 1, orderId: "order-1" });

    // voidEntry should only be called once
    expect(ledgerService.voidEntry).toHaveBeenCalledTimes(1);
  });
});

describe("Checkout — full earn→redeem→confirm→refund lifecycle", () => {
  it("complete order flow with integer arithmetic throughout", async () => {
    const { svc, credits, debits, voidedIds, analytics } = buildCheckoutStack({
      tier: "member",
      streakMultiplier: 1.5,
      balance: 3000,
    });

    // 1. Preview earn for $50 order
    // base = floor(5000/100)*10 = 500, member=1.25, streak=1.5, combined=1.875
    // final = floor(500 * 1.875) = 937
    const earnPreview = await svc.previewEarn({ userId: 1, cartTotalMinor: 5000 });
    expect(earnPreview.earn_points).toBe(937);
    expect(Number.isInteger(earnPreview.earn_points)).toBe(true);

    // 2. Preview redemption
    const redeemPreview = await svc.previewRedemption({ userId: 1, cartTotalMinor: 5000 });
    expect(redeemPreview.max_points).toBe(750);
    expect(redeemPreview.eligible).toBe(true);

    // 3. Apply redemption (500 DP)
    const redemption = await svc.applyRedemption({
      userId: 1,
      orderId: "order-42",
      pointsToRedeem: 500,
      cartTotalMinor: 5000,
    });
    expect(redemption.points_redeemed).toBe(500);
    expect(redemption.discount_minor).toBe(500); // $5
    expect(Number.isInteger(redemption.points_redeemed)).toBe(true);
    expect(Number.isInteger(redemption.discount_minor)).toBe(true);

    // 4. Confirm earn
    const earn = await svc.confirmEarn({ userId: 1, orderId: "order-42", paidAmountMinor: 4500 });
    expect(earn.credited).toBe(true);
    expect(earn.points).toBeGreaterThan(0);
    expect(Number.isInteger(earn.points)).toBe(true);

    // 5. Refund
    const refund = await svc.refundOrder({ userId: 1, orderId: "order-42" });
    expect(refund.earn_voided).toBe(true);
    expect(refund.redemption_voided).toBe(true);

    // Analytics events emitted for each phase
    const eventNames = analytics.events.map((e) => e.name);
    expect(eventNames).toContain("rewards.points.redeemed");
    expect(eventNames).toContain("rewards.points.earned");
    expect(eventNames).toContain("rewards.order.refunded");
  });
});
