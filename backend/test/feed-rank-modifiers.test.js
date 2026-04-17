const {
  assertNonPayToWinGuardrails,
  assertFeedRankModifierGuardrails,
  clampPositiveModifierLayer,
  boostTierUnit,
  getFeedEngagementProxyBindings,
  getFeedRankModifierBindings,
  computeRewardsPositiveModifierBlockSQLMirror,
  computeSellerTrustSubtractSQLMirror,
  DEFAULT_COMBINED_POSITIVE_CAP,
  DEFAULT_CAP_BOOST,
  DEFAULT_BOOST_MAX_FRACTION_OF_COMBINED
} = require("../src/modules/feed/feed-rank-modifiers");

describe("feed-rank-modifiers", () => {
  it("rejects boost cap above dominance fraction of combined cap", () => {
    expect(() =>
      assertNonPayToWinGuardrails({
        combinedPositiveCap: 72,
        capBoostTierAdditive: 30,
        boostMaxFractionOfCombined: 0.38
      })
    ).toThrow(/boost dominance limit/);
  });

  it("accepts default-shaped caps", () => {
    expect(() =>
      assertNonPayToWinGuardrails({
        combinedPositiveCap: DEFAULT_COMBINED_POSITIVE_CAP,
        capBoostTierAdditive: DEFAULT_CAP_BOOST,
        boostMaxFractionOfCombined: DEFAULT_BOOST_MAX_FRACTION_OF_COMBINED
      })
    ).not.toThrow();
  });

  it("assertFeedRankModifierGuardrails matches env defaults", () => {
    expect(() =>
      assertFeedRankModifierGuardrails({
        feedRankModifiers: {
          combinedPositiveCap: 72,
          capBoostTierAdditive: 24,
          boostMaxFractionOfCombined: 0.38
        }
      })
    ).not.toThrow();
  });

  it("clampPositiveModifierLayer cannot exceed combined cap (pay-to-win guardrail mirror)", () => {
    const combined = 72;
    const terms = [
      { cap: 42, raw: 100 },
      { cap: 24, raw: 100 },
      { cap: 16, raw: 100 },
      { cap: 12, raw: 100 }
    ];
    expect(clampPositiveModifierLayer(terms, combined)).toBe(combined);
  });

  it("boost tier maps to bounded units for SQL weighting", () => {
    expect(boostTierUnit(null)).toBe(0);
    expect(boostTierUnit("custom")).toBe(0);
    expect(boostTierUnit("boosted")).toBe(1);
    expect(boostTierUnit("Aggressive")).toBe(2);
  });

  it("paid boost raw additive stays under per-term cap in clamp model", () => {
    const capBoost = 24;
    const weightBoost = 12;
    const boostRaw = boostTierUnit("aggressive") * weightBoost;
    const layer = clampPositiveModifierLayer([{ cap: capBoost, raw: boostRaw }], 200);
    expect(layer).toBe(Math.min(capBoost, boostRaw));
    expect(layer).toBeLessThanOrEqual(capBoost);
  });

  it("getFeedEngagementProxyBindings reads env-shaped feedRankModifiers", () => {
    const ep = getFeedEngagementProxyBindings({
      feedRankModifiers: {
        engagementProxyWeightCompletion: 0.5,
        engagementProxyWeightViews: 0.25,
        engagementProxyWeightSocial: 0.25,
        engagementProxyViewCapDivisor: 2000,
        engagementProxySocialCapDivisor: 40
      }
    });
    expect(ep.weightCompletion).toBe(0.5);
    expect(ep.viewCapDivisor).toBe(2000);
    expect(ep.socialCapDivisor).toBe(40);
  });

  it("assertFeedRankModifierGuardrails rejects engagement proxy weights summing above 1", () => {
    expect(() =>
      assertFeedRankModifierGuardrails({
        feedRankModifiers: {
          combinedPositiveCap: 72,
          capBoostTierAdditive: 24,
          boostMaxFractionOfCombined: 0.38,
          engagementProxyWeightCompletion: 0.6,
          engagementProxyWeightViews: 0.5,
          engagementProxyWeightSocial: 0.1
        }
      })
    ).toThrow(/engagement proxy weights/);
  });

  it("getFeedRankModifierBindings reports disabled when rewards ranking flag is off", () => {
    const m = getFeedRankModifierBindings({
      feedRewardsRankingEnabled: false,
      feedRankModifiers: { combinedPositiveCap: 99 }
    });
    expect(m.enabled).toBe(false);
    expect(m.combinedPositive).toBe(99);
  });

  it("computeRewardsPositiveModifierBlockSQLMirror caps combined positive layer (non-pay-to-win)", () => {
    const rankModifiers = getFeedRankModifierBindings({
      feedRewardsRankingEnabled: true,
      feedRankModifiers: {}
    });
    const v = computeRewardsPositiveModifierBlockSQLMirror({
      feedTab: "marketplace",
      attachedProductId: 1,
      rewardsEngagementProxy: 50,
      boostTierUnit: 2,
      productCompletedOrders: 1_000_000,
      conversionProxy: 1,
      rankModifiers
    });
    expect(v).toBe(rankModifiers.combinedPositive);
  });

  it("computeRewardsPositiveModifierBlockSQLMirror omits sales/conversion off marketplace tab", () => {
    const rankModifiers = getFeedRankModifierBindings({
      feedRewardsRankingEnabled: true,
      feedRankModifiers: {}
    });
    const onMarket = computeRewardsPositiveModifierBlockSQLMirror({
      feedTab: "marketplace",
      attachedProductId: 9,
      rewardsEngagementProxy: 0.5,
      boostTierUnit: 0,
      productCompletedOrders: 100,
      conversionProxy: 0.5,
      rankModifiers
    });
    const forYou = computeRewardsPositiveModifierBlockSQLMirror({
      feedTab: "for_you",
      attachedProductId: 9,
      rewardsEngagementProxy: 0.5,
      boostTierUnit: 0,
      productCompletedOrders: 100,
      conversionProxy: 0.5,
      rankModifiers
    });
    expect(forYou).toBeLessThan(onMarket);
  });

  it("computeSellerTrustSubtractSQLMirror caps open-report penalty", () => {
    const rankModifiers = getFeedRankModifierBindings({
      feedRewardsRankingEnabled: true,
      feedRankModifiers: {}
    });
    const sub = computeSellerTrustSubtractSQLMirror(100, rankModifiers);
    expect(sub).toBe(rankModifiers.capSellerTrustSub);
  });
});
