const {
  assertNonPayToWinGuardrails,
  assertFeedRankModifierGuardrails,
  clampPositiveModifierLayer,
  boostTierUnit,
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
});
