const { DEFAULT_DISPOSABLE_DOMAINS } = require("./trust-flag-helpers");

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Heuristic knobs from env / app config — no ML, all explicit thresholds.
 * @param {object} config from loadEnv
 */
function getTrustSignalThresholds(config) {
  const c = config || {};
  const disposableFromEnv = parseList(c.trustDisposableEmailDomainsRaw);
  const disposableEmailDomains =
    disposableFromEnv.length > 0 ? disposableFromEnv : [...DEFAULT_DISPOSABLE_DOMAINS];

  return {
    /** Opt-in via `TRUST_SIGNALS_ENABLED=true` / `trustSignalsEnabled` on app config. */
    enabled: Boolean(c.trustSignalsEnabled),
    /** Flag ledger earns at or above this points amount (minor units). */
    rewardsEarnFlagPointsMinor: Math.max(0, Math.round(Number(c.trustRewardsEarnFlagPointsMinor ?? 5000))),
    rewardsSpendFlagPointsMinor: Math.max(0, Math.round(Number(c.trustRewardsSpendFlagPointsMinor ?? 8000))),
    /** Full refund within this many hours of order row creation → flag. */
    refundRapidFlagWithinHours: Math.max(1, Math.round(Number(c.trustRefundRapidFlagWithinHours ?? 72))),
    /** Ad campaign draft budget at or above this (currency minor) → flag for review. */
    boostBudgetFlagMinor: Math.max(0, Math.round(Number(c.trustBoostBudgetFlagMinor ?? 500_000))),
    /** When user reports a post under these categories, add ranking-domain flag for author review. */
    rankingReportCategoriesForFlag: parseList(c.trustRankingReportCategoriesRaw).length
      ? parseList(c.trustRankingReportCategoriesRaw)
      : ["spam", "misinformation"],
    referralFlagSameEmailDomain: c.trustReferralFlagSameEmailDomain !== false,
    referralFlagDisposableRefereeEmail: c.trustReferralFlagDisposableRefereeEmail !== false,
    referralFlagSharedSignupIp: c.trustReferralFlagSharedSignupIp !== false,
    referralBlockDisposableEmail: Boolean(c.trustReferralBlockDisposableEmail),
    disposableEmailDomains
  };
}

module.exports = {
  getTrustSignalThresholds
};
