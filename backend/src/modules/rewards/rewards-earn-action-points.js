/**
 * Baseline action → points (must match `shared/rewards/rules/config.ts` → `DEFAULT_ACTION_POINTS`).
 * Env overlay from {@link buildEarnActionPointsFromAppConfig} replaces referral + milestone rows only.
 */
const BASE_EARN_ACTION_POINTS_DEFAULTS = Object.freeze({
  signup_complete: 250,
  first_post_published: 150,
  first_product_order_completed: 0,
  qualified_comment: 40,
  qualified_reaction: 15,
  referral_qualified: 500,
  referral_qualified_referee: 0,
  purchase_completed: 100,
  daily_active_streak: 25,
  admin_grant: 0
});

/**
 * Central buyer earn action → points minor table for rules + checkout planner.
 * Referrer/referee amounts are sourced from the same env fields as {@link getReferralDomainConfig}
 * (`referralReferrerRewardPointsMinor` / `referralRefereeRewardPointsMinor`) so referral rewards are not a
 * parallel constant path.
 *
 * @param {object} appConfig - Output of {@link loadEnv}
 * @returns {Record<string, number>} Partial table; only includes keys we override from env (sparse OK for callers that merge).
 */
function buildEarnActionPointsFromAppConfig(appConfig) {
  const c = appConfig || {};
  const referralReferrer = Math.max(
    0,
    Math.round(Number(c.referralReferrerRewardPointsMinor ?? 500))
  );
  const referralReferee = Math.max(0, Math.round(Number(c.referralRefereeRewardPointsMinor ?? 0)));

  const out = {
    referral_qualified: referralReferrer,
    referral_qualified_referee: referralReferee
  };

  if (c.rewardsEarnPurchaseCompletedEnabled) {
    out.purchase_completed = Math.max(
      0,
      Math.round(
        Number(c.rewardsEarnPurchaseCompletedPointsMinor ?? BASE_EARN_ACTION_POINTS_DEFAULTS.purchase_completed)
      )
    );
  } else {
    out.purchase_completed = 0;
  }

  if (c.rewardsEarnFirstPostPublishedEnabled) {
    out.first_post_published = Math.max(
      0,
      Math.round(
        Number(c.rewardsEarnFirstPostPublishedPointsMinor ?? BASE_EARN_ACTION_POINTS_DEFAULTS.first_post_published)
      )
    );
  }

  if (c.rewardsEarnFirstProductOrderCompletedEnabled) {
    out.first_product_order_completed = Math.max(
      0,
      Math.round(Number(c.rewardsEarnFirstProductOrderCompletedPointsMinor ?? 0))
    );
  }

  return out;
}

/**
 * Full `earn.actionPointsMinor` map for {@link buildRulesConfigFromAppConfig}.
 *
 * @param {object} appConfig
 */
function buildFullEarnActionPointsTable(appConfig) {
  return { ...BASE_EARN_ACTION_POINTS_DEFAULTS, ...buildEarnActionPointsFromAppConfig(appConfig) };
}

/**
 * Milestone flags derived from env (for diagnostics, admin tooling, or future HTTP exposure).
 *
 * @param {object} appConfig
 * @returns {{
 *   firstPostPublishedEnabled: boolean;
 *   firstPostPublishedPointsMinor: number;
 *   firstProductOrderCompletedEnabled: boolean;
 *   firstProductOrderCompletedPointsMinor: number;
 * }}
 */
function buildBuyerEarnMilestoneFlags(appConfig) {
  const c = appConfig || {};
  return {
    firstPostPublishedEnabled: !!c.rewardsEarnFirstPostPublishedEnabled,
    firstPostPublishedPointsMinor: Math.max(
      0,
      Math.round(Number(c.rewardsEarnFirstPostPublishedPointsMinor ?? 0))
    ),
    firstProductOrderCompletedEnabled: !!c.rewardsEarnFirstProductOrderCompletedEnabled,
    firstProductOrderCompletedPointsMinor: Math.max(
      0,
      Math.round(Number(c.rewardsEarnFirstProductOrderCompletedPointsMinor ?? 0))
    )
  };
}

module.exports = {
  BASE_EARN_ACTION_POINTS_DEFAULTS,
  buildEarnActionPointsFromAppConfig,
  buildFullEarnActionPointsTable,
  buildBuyerEarnMilestoneFlags
};
