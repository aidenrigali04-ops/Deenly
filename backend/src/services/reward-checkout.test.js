const { createCheckoutService } = require("./reward-checkout");
const {
  makeDbStub,
  makeRewardConfigStub,
  makeAnalyticsStub,
} = require("./__test-helpers__/reward-stubs");

function buildDeps() {
  const { db } = makeDbStub();
  const analytics = makeAnalyticsStub();

  const tierService = {
    getTierInfo: jest.fn(async () => ({
      tier: "member",
      multiplier: 1.5,
      rolling_12m_points: 600,
    })),
    requalify: jest.fn(async () => ({ changed: false })),
  };

  const streakService = {
    getStreakState: jest.fn(async () => ({
      current: 7,
      multiplier: 1.5,
      shields_remaining: 2,
      checked_in_today: true,
    })),
  };

  const ledgerService = {
    getDailyEarnStatus: jest.fn(async () => ({
      earned_today: 200,
      cap_today: 5000,
      remaining: 4800,
    })),
    getAccountState: jest.fn(async () => ({
      user_id: 1,
      balance: 3000,
      frozen: false,
    })),
    creditPoints: jest.fn(async ({ amount }) => ({
      id: "led-earn-1",
      ledgerEntryId: "led-earn-1",
      amount,
      balanceAfter: 3000 + amount,
      balance_after: 3000 + amount,
    })),
    debitPoints: jest.fn(async ({ amount }) => ({
      id: "led-redeem-1",
      amount,
      balance_after: 3000 - amount,
    })),
    voidEntry: jest.fn(async () => ({})),
  };

  const rulesEngine = {
    calculatePurchaseEarn: jest.fn(async () => ({
      finalEarn: 225,
      basePoints: 100,
      tierMultiplier: 1.5,
      streakMultiplier: 1.5,
      combinedMultiplier: 2.25,
      rawEarn: 225,
      eligible: true,
      ineligibleReason: null,
    })),
    calculateRedemptionEligibility: jest.fn(async () => ({
      eligible: true,
      maxRedeemablePoints: 2500,
      maxRedeemableReason: "50% of order total",
      minRedemptionPoints: 100,
    })),
    pointsToDollars: jest.fn(async (pts) => pts), // 1 DP = 1 cent
  };

  const rewardConfig = makeRewardConfigStub({ daily_earn_cap: 5000 });
  rewardConfig.getNumber = jest.fn(async (k) => {
    const map = { min_order_for_earn_minor: 100 };
    return map[k] ?? 0;
  });

  const svc = createCheckoutService({
    db,
    ledgerService,
    rulesEngine,
    tierService,
    streakService,
    rewardConfig,
    analytics,
  });

  return { svc, db, analytics, ledgerService, rulesEngine, tierService, streakService, rewardConfig };
}

describe("reward-checkout", () => {
  describe("previewEarn", () => {
    it("returns zero for empty cart", async () => {
      const { svc } = buildDeps();
      const res = await svc.previewEarn({ userId: 1, cartTotalMinor: 0 });
      expect(res.earn_points).toBe(0);
      expect(res.reason).toBe("empty_cart");
    });

    it("returns full earn preview with multipliers", async () => {
      const { svc } = buildDeps();
      const res = await svc.previewEarn({ userId: 1, cartTotalMinor: 10000 });
      expect(res.earn_points).toBe(225);
      expect(res.base_points).toBe(100);
      expect(res.tier_multiplier).toBe(1.5);
      expect(res.streak_multiplier).toBe(1.5);
      expect(res.combined_multiplier).toBe(2.25);
      expect(res.eligible).toBe(true);
    });
  });

  describe("previewRedemption", () => {
    it("returns eligibility and max points", async () => {
      const { svc } = buildDeps();
      const res = await svc.previewRedemption({
        userId: 1,
        cartTotalMinor: 5000,
      });
      expect(res.eligible).toBe(true);
      expect(res.max_points).toBe(2500);
      expect(res.balance).toBe(3000);
      expect(res.discount_minor).toBe(2500);
    });

    it("caps requested points to max redeemable", async () => {
      const { svc, rulesEngine } = buildDeps();
      const res = await svc.previewRedemption({
        userId: 1,
        cartTotalMinor: 5000,
        requestedPoints: 9999,
      });
      // Should be capped to 2500
      expect(res.requested_points).toBe(2500);
    });

    it("returns not eligible when account is frozen", async () => {
      const { svc, ledgerService } = buildDeps();
      ledgerService.getAccountState.mockResolvedValueOnce({
        user_id: 1, balance: 3000, frozen: true,
      });
      const res = await svc.previewRedemption({
        userId: 1, cartTotalMinor: 5000,
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe("account_frozen");
    });
  });

  describe("confirmEarn", () => {
    it("returns not credited for zero amount", async () => {
      const { svc } = buildDeps();
      const res = await svc.confirmEarn({ userId: 1, orderId: 100, paidAmountMinor: 0 });
      expect(res.credited).toBe(false);
      expect(res.reason).toBe("zero_amount");
    });

    it("returns not credited when below min order", async () => {
      const { svc, rewardConfig } = buildDeps();
      rewardConfig.getNumber.mockResolvedValueOnce(5000); // min_order = $50
      const res = await svc.confirmEarn({ userId: 1, orderId: 100, paidAmountMinor: 2000 });
      expect(res.credited).toBe(false);
      expect(res.reason).toBe("below_min_order");
    });

    it("credits points, triggers requalification, emits analytics", async () => {
      const { svc, ledgerService, tierService, analytics } = buildDeps();
      const res = await svc.confirmEarn({
        userId: 1, orderId: 100, paidAmountMinor: 10000,
      });
      expect(res.credited).toBe(true);
      expect(res.points).toBe(225);
      expect(ledgerService.creditPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          amount: 225,
          source: "order_earn",
          idempotencyKey: "earn:100",
        })
      );
      expect(tierService.requalify).toHaveBeenCalledWith(1);
    });
  });

  describe("refundOrder", () => {
    it("voids both earn and redeem entries when present", async () => {
      const { svc, db, ledgerService } = buildDeps();
      db.on(/SELECT \* FROM reward_ledger_entries WHERE idempotency_key/, (_sql, params) => {
        const key = params[0];
        if (key === "earn:100") {
          return { rowCount: 1, rows: [{ id: "e1", amount: 225, voided_at: null }] };
        }
        if (key === "redeem:100") {
          return { rowCount: 1, rows: [{ id: "e2", amount: -500, voided_at: null }] };
        }
        return { rowCount: 0, rows: [] };
      });
      const res = await svc.refundOrder({ userId: 1, orderId: 100 });
      expect(res.earn_voided).toBe(true);
      expect(res.redemption_voided).toBe(true);
      expect(ledgerService.voidEntry).toHaveBeenCalledTimes(2);
    });

    it("skips already-voided entries", async () => {
      const { svc, db, ledgerService } = buildDeps();
      db.on(/SELECT \* FROM reward_ledger_entries/, (_sql, params) => {
        if (params[0] === "earn:100") {
          return { rowCount: 1, rows: [{ id: "e1", amount: 225, voided_at: new Date() }] };
        }
        return { rowCount: 0, rows: [] };
      });
      const res = await svc.refundOrder({ userId: 1, orderId: 100 });
      expect(res.earn_voided).toBe(false);
      expect(res.redemption_voided).toBe(false);
      expect(ledgerService.voidEntry).not.toHaveBeenCalled();
    });
  });
});
