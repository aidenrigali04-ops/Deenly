/**
 * Feed ranking modifier caps and guardrails (bounded boosts, non-pay-to-win).
 * Numeric policy mirrors env-driven SQL; keep formulas simple and additive on rank_score.
 */

const DEFAULT_COMBINED_POSITIVE_CAP = 72;
const DEFAULT_CAP_ENGAGEMENT = 42;
const DEFAULT_CAP_BOOST = 24;
const DEFAULT_CAP_SALES = 16;
const DEFAULT_CAP_CONVERSION = 12;
const DEFAULT_CAP_SELLER_TRUST_SUB = 22;

/** Max share of the combined positive cap that may come from paid boost tier alone (hard guardrail). */
const DEFAULT_BOOST_MAX_FRACTION_OF_COMBINED = 0.38;

function clampNonNegative(n) {
  return Math.max(0, n);
}

/**
 * @param {object} caps
 * @param {number} caps.combinedPositiveCap
 * @param {number} caps.capBoostTierAdditive
 * @param {number} [caps.boostMaxFractionOfCombined]
 */
function assertNonPayToWinGuardrails(caps) {
  const combined = Number(caps.combinedPositiveCap);
  const capBoost = Number(caps.capBoostTierAdditive);
  const frac =
    caps.boostMaxFractionOfCombined != null
      ? Number(caps.boostMaxFractionOfCombined)
      : DEFAULT_BOOST_MAX_FRACTION_OF_COMBINED;

  if (!Number.isFinite(combined) || combined <= 0) {
    throw new Error("feed_rank_modifiers: combinedPositiveCap must be a positive finite number");
  }
  if (!Number.isFinite(capBoost) || capBoost < 0) {
    throw new Error("feed_rank_modifiers: capBoostTierAdditive must be a non-negative finite number");
  }
  if (!Number.isFinite(frac) || frac <= 0 || frac > 1) {
    throw new Error("feed_rank_modifiers: boostMaxFractionOfCombined must be in (0,1]");
  }
  if (capBoost > combined * frac + 1e-9) {
    throw new Error(
      `feed_rank_modifiers: capBoostTierAdditive (${capBoost}) exceeds boost dominance limit (${combined} * ${frac})`
    );
  }
}

/**
 * Positive-only modifier layer: sum of capped terms, then clamped by combined cap.
 * Used in tests to mirror SQL LEAST(combined, sum(LEAST(cap_i, raw_i))).
 */
function clampPositiveModifierLayer(terms, combinedCap) {
  const sum = terms.reduce((a, t) => a + clampNonNegative(Math.min(t.cap, t.raw)), 0);
  return Math.min(combinedCap, sum);
}

function boostTierUnit(boostTier) {
  const k = String(boostTier || "")
    .trim()
    .toLowerCase();
  if (k === "boosted") {
    return 1;
  }
  if (k === "aggressive") {
    return 2;
  }
  return 0;
}

/** @param {object} config */
function getFeedRankModifierBindings(config) {
  const m = config.feedRankModifiers || {};
  const enabled = Boolean(config.feedRewardsRankingEnabled);
  return {
    enabled,
    capEngagement: Number(m.capEngagementAdditive ?? DEFAULT_CAP_ENGAGEMENT),
    weightEngagement: Number(m.weightEngagement ?? 1),
    capBoost: Number(m.capBoostTierAdditive ?? DEFAULT_CAP_BOOST),
    weightBoost: Number(m.weightBoostTierUnit ?? 12),
    capSales: Number(m.capSalesLnAdditive ?? DEFAULT_CAP_SALES),
    weightSales: Number(m.weightSalesLn ?? 6),
    combinedPositive: Number(m.combinedPositiveCap ?? DEFAULT_COMBINED_POSITIVE_CAP),
    capConversion: Number(m.capConversionProxyAdditive ?? DEFAULT_CAP_CONVERSION),
    weightConversion: Number(m.weightConversionProxy ?? 10),
    capSellerTrustSub: Number(m.capSellerTrustSubtract ?? DEFAULT_CAP_SELLER_TRUST_SUB),
    weightSellerTrustPerReport: Number(m.weightSellerOpenReports ?? 5)
  };
}

/** @param {object} config */
function assertFeedRankModifierGuardrails(config) {
  const m = config.feedRankModifiers || {};
  assertNonPayToWinGuardrails({
    combinedPositiveCap: Number(m.combinedPositiveCap ?? DEFAULT_COMBINED_POSITIVE_CAP),
    capBoostTierAdditive: Number(m.capBoostTierAdditive ?? DEFAULT_CAP_BOOST),
    boostMaxFractionOfCombined: m.boostMaxFractionOfCombined
  });
}

module.exports = {
  DEFAULT_COMBINED_POSITIVE_CAP,
  DEFAULT_CAP_ENGAGEMENT,
  DEFAULT_CAP_BOOST,
  DEFAULT_CAP_SALES,
  DEFAULT_CAP_CONVERSION,
  DEFAULT_CAP_SELLER_TRUST_SUB,
  DEFAULT_BOOST_MAX_FRACTION_OF_COMBINED,
  assertNonPayToWinGuardrails,
  assertFeedRankModifierGuardrails,
  clampPositiveModifierLayer,
  boostTierUnit,
  getFeedRankModifierBindings
};
