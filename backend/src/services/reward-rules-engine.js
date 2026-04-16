/**
 * Reward Rules Engine
 *
 * Stateless calculation layer. All business math lives here —
 * not in route handlers, not in the ledger service.
 *
 * Every number comes from RewardConfigService (backed by reward_rules_config table).
 * No database writes. No side effects. Pure calculation.
 */

const { TIERS, TIER_ORDER } = require("../modules/rewards/constants");

/**
 * @param {{ rewardConfig: object }} deps
 */
function createRewardRulesEngine({ rewardConfig }) {
  /**
   * Calculate how many points a purchase would earn (preview, not actual credit).
   *
   * Formula:
   *   base_points = FLOOR(orderAmountMinor / 100) × points_per_dollar
   *   combined    = tierMultiplier × streakMultiplier
   *   raw_earn    = FLOOR(base_points × combined)
   *   final_earn  = MIN(raw_earn, dailyCap - earnedToday)
   *
   * @param {{
   *   orderAmountMinor: number,
   *   tier: string,
   *   streakMultiplier: number,
   *   earnedToday: number,
   *   dailyCap: number
   * }} params
   * @returns {Promise<{
   *   eligible: boolean,
   *   basePoints: number,
   *   tierMultiplier: number,
   *   streakMultiplier: number,
   *   combinedMultiplier: number,
   *   rawEarn: number,
   *   dailyCapRemaining: number,
   *   finalEarn: number,
   *   ineligibleReason: string|null
   * }>}
   */
  async function calculatePurchaseEarn(params) {
    const {
      orderAmountMinor,
      tier,
      streakMultiplier,
      earnedToday,
      dailyCap
    } = params;

    const minOrderMinor = await rewardConfig.getNumber("min_order_amount_minor");
    if (orderAmountMinor < minOrderMinor) {
      return {
        eligible: false,
        basePoints: 0,
        tierMultiplier: 0,
        streakMultiplier,
        combinedMultiplier: 0,
        rawEarn: 0,
        dailyCapRemaining: Math.max(0, dailyCap - earnedToday),
        finalEarn: 0,
        ineligibleReason: "order_below_minimum"
      };
    }

    const pointsPerDollar = await rewardConfig.getNumber("points_per_dollar");
    const tierMultiplier = await rewardConfig.getTierMultiplier(tier);

    const dollarsSpent = Math.floor(orderAmountMinor / 100);
    const basePoints = dollarsSpent * pointsPerDollar;
    const combinedMultiplier = tierMultiplier * streakMultiplier;
    const rawEarn = Math.floor(basePoints * combinedMultiplier);
    const dailyCapRemaining = Math.max(0, dailyCap - earnedToday);

    if (dailyCapRemaining <= 0) {
      return {
        eligible: false,
        basePoints,
        tierMultiplier,
        streakMultiplier,
        combinedMultiplier,
        rawEarn,
        dailyCapRemaining: 0,
        finalEarn: 0,
        ineligibleReason: "daily_cap_reached"
      };
    }

    const finalEarn = Math.min(rawEarn, dailyCapRemaining);

    return {
      eligible: true,
      basePoints,
      tierMultiplier,
      streakMultiplier,
      combinedMultiplier,
      rawEarn,
      dailyCapRemaining,
      finalEarn,
      ineligibleReason: null
    };
  }

  /**
   * Calculate redemption eligibility for an order.
   *
   * Rules (from Business Rules spec):
   *   min redemption: 500 DP ($5)
   *   max redemption: lesser of 15% of order total OR $20 (2000 DP)
   *   conversion: 100 DP = $1
   *
   * @param {{ balance: number, orderAmountMinor: number }} params
   * @returns {Promise<{
   *   eligible: boolean,
   *   maxRedeemablePoints: number,
   *   maxRedeemableReason: string,
   *   maxDollarValueMinor: number,
   *   minRedemptionPoints: number
   * }>}
   */
  async function calculateRedemptionEligibility(params) {
    const { balance, orderAmountMinor } = params;

    const minRedemptionPoints = await rewardConfig.getNumber("min_redemption_points");
    const maxRedemptionPct = await rewardConfig.getNumber("max_redemption_pct");
    const maxRedemptionCapMinor = await rewardConfig.getNumber("max_redemption_cap_minor");
    const pointsToDollarRatio = await rewardConfig.getNumber("points_to_dollar_ratio");

    // Max by percentage: 15% of order total, converted to DP
    // orderAmountMinor is in cents. maxRedemptionCapMinor is in cents.
    // Points = cents (since 100 DP = $1 = 100 cents, i.e. 1 DP = 1 cent)
    const maxByPct = Math.floor(orderAmountMinor * maxRedemptionPct / 100);
    const maxByCap = maxRedemptionCapMinor;
    const maxByBalance = balance;

    const maxRedeemablePoints = Math.min(maxByPct, maxByCap, maxByBalance);

    let maxRedeemableReason;
    if (maxRedeemablePoints === maxByPct && maxByPct <= maxByCap) {
      maxRedeemableReason = `${maxRedemptionPct}% of order total`;
    } else if (maxRedeemablePoints === maxByCap) {
      maxRedeemableReason = `$${(maxByCap / 100).toFixed(2)} redemption cap`;
    } else {
      maxRedeemableReason = "current balance";
    }

    // Convert points to dollar value (1 DP = 1 cent given ratio of 100 DP/$1)
    const maxDollarValueMinor = Math.floor(maxRedeemablePoints * 100 / pointsToDollarRatio);

    const eligible = maxRedeemablePoints >= minRedemptionPoints;

    return {
      eligible,
      maxRedeemablePoints,
      maxRedeemableReason,
      maxDollarValueMinor,
      minRedemptionPoints
    };
  }

  /**
   * Compute the streak multiplier for a given day count.
   * @param {number} streakDays
   * @returns {Promise<number>}
   */
  async function computeStreakMultiplier(streakDays) {
    return rewardConfig.getStreakMultiplier(streakDays);
  }

  /**
   * Determine which tier a user qualifies for based on rolling 12-month points.
   *
   * @param {number} rolling12mPoints
   * @returns {Promise<{
   *   qualifiedTier: string,
   *   nextTier: string|null,
   *   nextThreshold: number|null,
   *   progress: number
   * }>}
   */
  async function computeQualifiedTier(rolling12mPoints) {
    // Load all thresholds
    const thresholds = {};
    for (const tier of TIERS) {
      thresholds[tier] = await rewardConfig.getTierThreshold(tier);
    }

    // Walk tiers from highest to lowest
    let qualifiedTier = "explorer";
    for (let i = TIERS.length - 1; i >= 0; i--) {
      if (rolling12mPoints >= thresholds[TIERS[i]]) {
        qualifiedTier = TIERS[i];
        break;
      }
    }

    // Determine next tier
    const currentIdx = TIER_ORDER[qualifiedTier];
    let nextTier = null;
    let nextThreshold = null;
    if (currentIdx < TIERS.length - 1) {
      nextTier = TIERS[currentIdx + 1];
      nextThreshold = thresholds[nextTier];
    }

    // Progress toward next tier (0–100 percentage)
    let progress = 100;
    if (nextThreshold !== null) {
      const currentThreshold = thresholds[qualifiedTier];
      const range = nextThreshold - currentThreshold;
      const earned = rolling12mPoints - currentThreshold;
      progress = range > 0 ? Math.min(100, Math.round((earned / range) * 100)) : 100;
    }

    return { qualifiedTier, nextTier, nextThreshold, progress };
  }

  /**
   * Convert DP to dollar value in cents.
   * With default config: 100 DP = $1.00 = 100 cents. So 1 DP = 1 cent.
   * @param {number} points
   * @returns {Promise<number>} cents
   */
  async function pointsToDollars(points) {
    const ratio = await rewardConfig.getNumber("points_to_dollar_ratio");
    return Math.floor((points * 100) / ratio);
  }

  /**
   * Convert dollar amount (cents) to base points (before multipliers).
   * With default config: $1 = 10 DP. So 7500 cents ($75) = 750 DP.
   * @param {number} amountMinor cents
   * @returns {Promise<number>} base DP
   */
  async function dollarsToBasePoints(amountMinor) {
    const pointsPerDollar = await rewardConfig.getNumber("points_per_dollar");
    return Math.floor(amountMinor / 100) * pointsPerDollar;
  }

  return {
    calculatePurchaseEarn,
    calculateRedemptionEligibility,
    computeStreakMultiplier,
    computeQualifiedTier,
    pointsToDollars,
    dollarsToBasePoints
  };
}

module.exports = { createRewardRulesEngine };
