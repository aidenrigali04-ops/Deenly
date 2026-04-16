/**
 * Unit tests for the pure rules engine.
 * No database — just a stub rewardConfig.
 */

const { createRewardRulesEngine } = require("./reward-rules-engine");

/**
 * Build a rewardConfig stub with typical default values.
 * Override any key via the `overrides` map.
 */
function buildConfig(overrides = {}) {
  const defaults = {
    min_order_amount_minor: 100, // $1 minimum
    points_per_dollar: 10,
    points_to_dollar_ratio: 100, // 100 DP = $1
    min_redemption_points: 500,
    max_redemption_pct: 15,
    max_redemption_cap_minor: 2000,
  };
  const merged = { ...defaults, ...overrides };
  const tierMultipliers = {
    explorer: 1.0,
    member: 1.25,
    insider: 1.5,
    vip: 2.0,
    elite: 3.0,
  };
  const tierThresholds = {
    explorer: 0,
    member: 2500,
    insider: 10000,
    vip: 25000,
    elite: 50000,
  };
  return {
    getNumber: async (key) => merged[key],
    get: async (key) => merged[key],
    getTierMultiplier: async (tier) => tierMultipliers[tier] ?? 1.0,
    getTierThreshold: async (tier) => tierThresholds[tier] ?? 0,
    getStreakMultiplier: async (days) => {
      if (days >= 31) return 3;
      if (days >= 14) return 2;
      if (days >= 7) return 1.5;
      if (days >= 3) return 1.25;
      return 1.0;
    },
  };
}

describe("reward-rules-engine", () => {
  describe("calculatePurchaseEarn", () => {
    it("rejects order below minimum", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.calculatePurchaseEarn({
        orderAmountMinor: 50,
        tier: "explorer",
        streakMultiplier: 1.0,
        earnedToday: 0,
        dailyCap: 1000,
      });
      expect(r.eligible).toBe(false);
      expect(r.ineligibleReason).toBe("order_below_minimum");
      expect(r.finalEarn).toBe(0);
    });

    it("computes explorer tier earn at 1x multiplier", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.calculatePurchaseEarn({
        orderAmountMinor: 5000, // $50
        tier: "explorer",
        streakMultiplier: 1.0,
        earnedToday: 0,
        dailyCap: 1000,
      });
      expect(r.eligible).toBe(true);
      expect(r.basePoints).toBe(500); // 50 * 10
      expect(r.tierMultiplier).toBe(1.0);
      expect(r.finalEarn).toBe(500);
    });

    it("applies tier * streak multiplier correctly", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.calculatePurchaseEarn({
        orderAmountMinor: 10000, // $100
        tier: "vip", // 2x
        streakMultiplier: 1.5, // 7+ day streak
        earnedToday: 0,
        dailyCap: 100000,
      });
      // 1000 base * 2 * 1.5 = 3000
      expect(r.rawEarn).toBe(3000);
      expect(r.finalEarn).toBe(3000);
      expect(r.combinedMultiplier).toBe(3);
    });

    it("caps earn at daily cap remaining", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.calculatePurchaseEarn({
        orderAmountMinor: 10000, // would earn 1000 at 1x
        tier: "explorer",
        streakMultiplier: 1.0,
        earnedToday: 800,
        dailyCap: 1000,
      });
      expect(r.rawEarn).toBe(1000);
      expect(r.finalEarn).toBe(200);
      expect(r.dailyCapRemaining).toBe(200);
    });

    it("returns zero when daily cap already reached", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.calculatePurchaseEarn({
        orderAmountMinor: 5000,
        tier: "explorer",
        streakMultiplier: 1.0,
        earnedToday: 1000,
        dailyCap: 1000,
      });
      expect(r.eligible).toBe(false);
      expect(r.ineligibleReason).toBe("daily_cap_reached");
      expect(r.finalEarn).toBe(0);
    });
  });

  describe("calculateRedemptionEligibility", () => {
    it("is ineligible when balance below min redemption", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.calculateRedemptionEligibility({
        balance: 300,
        orderAmountMinor: 10000,
      });
      expect(r.eligible).toBe(false);
      expect(r.maxRedeemablePoints).toBe(300);
    });

    it("caps at 15% of order", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.calculateRedemptionEligibility({
        balance: 10000,
        orderAmountMinor: 10000, // $100, 15% = $15 = 1500 DP
      });
      expect(r.maxRedeemablePoints).toBe(1500);
      expect(r.eligible).toBe(true);
    });

    it("caps at absolute $20 cap", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.calculateRedemptionEligibility({
        balance: 10000,
        orderAmountMinor: 100000, // $1000, 15% = $150, but cap is $20 = 2000 DP
      });
      expect(r.maxRedeemablePoints).toBe(2000);
    });

    it("caps at balance when lowest", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.calculateRedemptionEligibility({
        balance: 700,
        orderAmountMinor: 100000,
      });
      expect(r.maxRedeemablePoints).toBe(700);
      expect(r.maxRedeemableReason).toBe("current balance");
    });
  });

  describe("computeQualifiedTier", () => {
    it("returns explorer for zero points", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.computeQualifiedTier(0);
      expect(r.qualifiedTier).toBe("explorer");
      expect(r.nextTier).toBe("member");
    });

    it("returns member at threshold", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.computeQualifiedTier(2500);
      expect(r.qualifiedTier).toBe("member");
    });

    it("returns elite at the highest threshold", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      const r = await engine.computeQualifiedTier(60000);
      expect(r.qualifiedTier).toBe("elite");
      expect(r.nextTier).toBeNull();
    });

    it("computes progress percentage towards next tier", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      // halfway between member (2500) and insider (10000): 6250
      const r = await engine.computeQualifiedTier(6250);
      expect(r.qualifiedTier).toBe("member");
      expect(r.progress).toBe(50);
    });
  });

  describe("conversions", () => {
    it("pointsToDollars converts at 100 DP = 100 cents ratio", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      expect(await engine.pointsToDollars(500)).toBe(500); // $5
      expect(await engine.pointsToDollars(0)).toBe(0);
    });

    it("dollarsToBasePoints returns 10 DP per dollar", async () => {
      const engine = createRewardRulesEngine({ rewardConfig: buildConfig() });
      expect(await engine.dollarsToBasePoints(10000)).toBe(1000);
    });
  });
});
