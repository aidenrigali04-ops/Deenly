/**
 * Canonical defaults for checkout redemption rules (minor units, bps, hours).
 * Keep aligned with `shared/rewards/rules/config.ts` → `DEFAULT_REWARDS_RULES_CONFIG.redemption`
 * and with parse fallbacks in `backend/src/config/env.js` for the same keys.
 */
const REDEMPTION_RULE_DEFAULTS = Object.freeze({
  minBalanceMinor: 500,
  maxPointsPerRedemptionMinor: 10_000,
  cooldownHoursBetweenRedemptions: 24,
  minOrderAmountRemainingMinor: 50,
  maxCheckoutDiscountBps: 5000,
  pointsPerFiatMinorUnit: 100
});

/**
 * @param {Record<string, unknown>} c
 * @returns {typeof REDEMPTION_RULE_DEFAULTS}
 */
function redemptionRulesFromAppConfig(c) {
  const src = c || {};
  const minBal = Math.max(0, Math.round(Number(src.rewardsMinBalanceMinor)));
  const maxPer = Math.round(Number(src.rewardsMaxPointsPerRedemptionMinor));
  const cool = Math.max(0, Math.round(Number(src.rewardsCooldownHoursBetweenRedemptions)));
  const minRemain = Math.round(Number(src.rewardsMinOrderAmountRemainingMinor));
  const maxBps = Math.round(Number(src.rewardsMaxCheckoutDiscountBps));
  const ppu = Math.round(Number(src.rewardsPointsPerFiatMinorUnit));

  return {
    minBalanceMinor: Number.isFinite(minBal) ? minBal : REDEMPTION_RULE_DEFAULTS.minBalanceMinor,
    maxPointsPerRedemptionMinor:
      Number.isFinite(maxPer) && maxPer >= 1 ? maxPer : REDEMPTION_RULE_DEFAULTS.maxPointsPerRedemptionMinor,
    cooldownHoursBetweenRedemptions: Number.isFinite(cool) ? cool : REDEMPTION_RULE_DEFAULTS.cooldownHoursBetweenRedemptions,
    minOrderAmountRemainingMinor:
      Number.isFinite(minRemain) && minRemain >= 1
        ? minRemain
        : REDEMPTION_RULE_DEFAULTS.minOrderAmountRemainingMinor,
    maxCheckoutDiscountBps:
      Number.isFinite(maxBps) && maxBps >= 0 && maxBps <= 10_000
        ? maxBps
        : REDEMPTION_RULE_DEFAULTS.maxCheckoutDiscountBps,
    pointsPerFiatMinorUnit:
      Number.isFinite(ppu) && ppu >= 1 ? ppu : REDEMPTION_RULE_DEFAULTS.pointsPerFiatMinorUnit
  };
}

module.exports = {
  REDEMPTION_RULE_DEFAULTS,
  redemptionRulesFromAppConfig
};
