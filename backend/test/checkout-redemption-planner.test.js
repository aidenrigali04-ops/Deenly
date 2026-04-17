const { buildRulesConfigFromAppConfig } = require("../src/modules/rewards/rewards-checkout-service");
const { planCheckoutProductRedemption } = require("../src/modules/rewards/checkout-redemption-planner");

describe("checkout-redemption-planner", () => {
  const appCfg = {
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
    rewardsReversalMaxAgeDays: 120
  };
  const cfg = buildRulesConfigFromAppConfig(appCfg);

  it("matches shared defaults shape", () => {
    expect(cfg.redemption.pointsPerFiatMinorUnit).toBe(100);
    expect(cfg.redemption.minOrderAmountRemainingMinor).toBe(50);
  });

  it("rejects when balance below min balance gate", () => {
    const plan = planCheckoutProductRedemption(
      {
        listPriceMinor: 5000,
        productRewardsEligible: true,
        redeemEnabled: true,
        requestedPointsMinor: null,
        snapshot: { balanceMinor: 100, lastRedemptionAtIso: null },
        requestedAtIso: new Date().toISOString()
      },
      cfg
    );
    expect(plan.allow).toBe(false);
    expect(plan.denyReasons).toContain("below_min_balance");
  });

  it("allows eligible redemption with sufficient balance", () => {
    const plan = planCheckoutProductRedemption(
      {
        listPriceMinor: 5000,
        productRewardsEligible: true,
        redeemEnabled: true,
        requestedPointsMinor: null,
        snapshot: { balanceMinor: 50_000, lastRedemptionAtIso: null },
        requestedAtIso: new Date().toISOString()
      },
      cfg
    );
    expect(plan.allow).toBe(true);
    expect(plan.pointsToSpend).toBeGreaterThan(0);
    expect(plan.chargedMinor).toBe(5000 - plan.discountMinor);
  });

  it("rejects when cooldown has not elapsed", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const plan = planCheckoutProductRedemption(
      {
        listPriceMinor: 5000,
        productRewardsEligible: true,
        redeemEnabled: true,
        requestedPointsMinor: null,
        snapshot: { balanceMinor: 50_000, lastRedemptionAtIso: recent },
        requestedAtIso: now.toISOString()
      },
      cfg
    );
    expect(plan.allow).toBe(false);
    expect(plan.denyReasons).toContain("cooldown_active");
  });
});
