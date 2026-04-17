/**
 * Defaults mirror `shared/rewards/config.ts` → `REFERRALS_DOMAIN_CONFIG` (field names and semantics).
 * Env overrides come from `loadEnv` / `appConfig` — this object is the non-env baseline only.
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
  return {
    attributionWindowDays: appConfig.referralAttributionWindowDays ?? base.attributionWindowDays,
    maxReferrerRewardsPerDay: appConfig.referralMaxReferrerRewardsPerDay ?? base.maxReferrerRewardsPerDay,
    defaultCodeMaxRedemptions: appConfig.referralDefaultCodeMaxRedemptions ?? base.defaultCodeMaxRedemptions,
    cooldownHoursBetweenSelfChecks: base.cooldownHoursBetweenSelfChecks,
    referrerRewardPointsMinor: appConfig.referralReferrerRewardPointsMinor ?? base.referrerRewardPointsMinor,
    refereeRewardPointsMinor: appConfig.referralRefereeRewardPointsMinor ?? base.refereeRewardPointsMinor,
    minQualifyingOrderAmountMinor:
      appConfig.referralMinQualifyingOrderAmountMinor ?? base.minQualifyingOrderAmountMinor,
    qualifyingOrderKinds: appConfig.referralQualifyingOrderKinds?.length
      ? appConfig.referralQualifyingOrderKinds
      : base.qualifyingOrderKinds,
    holdClearHoursAfterOrder: appConfig.referralHoldClearHoursAfterOrder ?? base.holdClearHoursAfterOrder,
    allowBuyerIsSellerForQualification:
      appConfig.referralAllowBuyerIsSeller ?? base.allowBuyerIsSellerForQualification
  };
}

module.exports = {
  getReferralDomainConfig
};
