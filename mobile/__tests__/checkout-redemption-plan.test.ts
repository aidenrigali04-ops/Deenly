import { DEFAULT_REWARDS_RULES_CONFIG, planCheckoutProductRedemption, validateRewardsRulesConfig } from "@deenly/rewards";

describe("planCheckoutProductRedemption", () => {
  const cfg = DEFAULT_REWARDS_RULES_CONFIG;

  it("validates default rules config including checkout redemption fields", () => {
    expect(validateRewardsRulesConfig(cfg).ok).toBe(true);
  });

  it("allows no redemption when redeemEnabled is false", () => {
    const plan = planCheckoutProductRedemption(
      {
        listPriceMinor: 1000,
        productRewardsEligible: true,
        redeemEnabled: false,
        requestedPointsMinor: null,
        snapshot: { balanceMinor: 50_000, lastRedemptionAtIso: null },
        requestedAtIso: new Date().toISOString()
      },
      cfg
    );
    expect(plan.allow).toBe(true);
    expect(plan.pointsToSpend).toBe(0);
    expect(plan.chargedMinor).toBe(1000);
  });

  it("rejects ineligible product", () => {
    const plan = planCheckoutProductRedemption(
      {
        listPriceMinor: 1000,
        productRewardsEligible: false,
        redeemEnabled: true,
        requestedPointsMinor: null,
        snapshot: { balanceMinor: 50_000, lastRedemptionAtIso: null },
        requestedAtIso: new Date().toISOString()
      },
      cfg
    );
    expect(plan.allow).toBe(false);
    expect(plan.denyReasons).toContain("product_not_eligible");
  });

  it("applies max discount within caps for eligible checkout", () => {
    const plan = planCheckoutProductRedemption(
      {
        listPriceMinor: 10_000,
        productRewardsEligible: true,
        redeemEnabled: true,
        requestedPointsMinor: null,
        snapshot: { balanceMinor: 1_000_000, lastRedemptionAtIso: null },
        requestedAtIso: new Date().toISOString()
      },
      cfg
    );
    expect(plan.allow).toBe(true);
    expect(plan.discountMinor).toBeGreaterThan(0);
    expect(plan.chargedMinor).toBe(10_000 - plan.discountMinor);
    expect(plan.chargedMinor).toBeGreaterThanOrEqual(cfg.redemption.minOrderAmountRemainingMinor);
  });
});
