const { buildEarnActionPointsFromAppConfig } = require("../rewards/rewards-earn-action-points");

/**
 * Defaults mirror `shared/rewards/config.ts` → `REFERRALS_DOMAIN_CONFIG` (field names and semantics).
 * Env overrides come from `loadEnv` / `appConfig` — this object is the non-env baseline only.
 * Point amounts for referrer/referee are resolved via the same earn table as checkout rules
 * (`buildEarnActionPointsFromAppConfig`) so `REFERRAL_*_REWARD_POINTS_MINOR` stay the single source of truth.
 */
const REFERRALS_DEFAULTS = {
  attributionWindowDays: 30,
  maxReferrerRewardsPerDay: 50,
  defaultCodeMaxRedemptions: 100,
  cooldownHoursBetweenSelfChecks: 24,
  referrerRewardPointsMinor: 500,
  refereeRewardPointsMinor: 0,
  minQualifyingOrderAmountMinor: 1,
  qualifyingOrderKinds: ["product", "support", "subscription", "event_ticket"],
  holdClearHoursAfterOrder: 0,
  allowBuyerIsSellerForQualification: false
};

/**
 * Runtime referral policy merged from env-backed {@link loadEnv} config.
 *
 * @param {object} appConfig
 * @returns {typeof REFERRALS_DEFAULTS}
 */
function getReferralDomainConfig(appConfig) {
  const base = REFERRALS_DEFAULTS;
  const emptyCfg = {};
  const cfg = appConfig && typeof appConfig === "object" ? appConfig : emptyCfg;
  const earnPts = buildEarnActionPointsFromAppConfig(cfg);
  const referrerRewardPointsMinor =
    typeof earnPts.referral_qualified === "number" && Number.isFinite(earnPts.referral_qualified)
      ? earnPts.referral_qualified
      : cfg.referralReferrerRewardPointsMinor ?? base.referrerRewardPointsMinor;
  const refereeRewardPointsMinor =
    typeof earnPts.referral_qualified_referee === "number" && Number.isFinite(earnPts.referral_qualified_referee)
      ? earnPts.referral_qualified_referee
      : cfg.referralRefereeRewardPointsMinor ?? base.refereeRewardPointsMinor;
  return {
    attributionWindowDays: cfg.referralAttributionWindowDays ?? base.attributionWindowDays,
    maxReferrerRewardsPerDay: cfg.referralMaxReferrerRewardsPerDay ?? base.maxReferrerRewardsPerDay,
    defaultCodeMaxRedemptions: cfg.referralDefaultCodeMaxRedemptions ?? base.defaultCodeMaxRedemptions,
    cooldownHoursBetweenSelfChecks: base.cooldownHoursBetweenSelfChecks,
    referrerRewardPointsMinor,
    refereeRewardPointsMinor,
    minQualifyingOrderAmountMinor:
      cfg.referralMinQualifyingOrderAmountMinor ?? base.minQualifyingOrderAmountMinor,
    qualifyingOrderKinds: cfg.referralQualifyingOrderKinds?.length
      ? cfg.referralQualifyingOrderKinds
      : base.qualifyingOrderKinds,
    holdClearHoursAfterOrder: cfg.referralHoldClearHoursAfterOrder ?? base.holdClearHoursAfterOrder,
    allowBuyerIsSellerForQualification:
      cfg.referralAllowBuyerIsSeller ?? base.allowBuyerIsSellerForQualification
  };
}

module.exports = {
  getReferralDomainConfig
};
