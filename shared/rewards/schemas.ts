/**
 * Lightweight JSON-serializable "schemas" for docs and future OpenAPI generation.
 * Not JSON Schema standard — structured constants only.
 */

export const REWARDS_GROWTH_BUNDLE_SHAPE = {
  type: "object",
  required: ["rewards", "referrals", "boosts", "rankingModifiers"],
  properties: {
    rewards: {
      type: "object",
      required: [
        "currencyCode",
        "pointsDecimals",
        "maxEarnPerUserPerDayMinor",
        "maxEarnPerUserPerMonthMinor",
        "minGrantMinor",
        "maxSingleGrantMinor"
      ]
    },
    referrals: {
      type: "object",
      required: [
        "attributionWindowDays",
        "maxReferrerRewardsPerDay",
        "defaultCodeMaxRedemptions",
        "cooldownHoursBetweenSelfChecks",
        "referrerRewardPointsMinor",
        "refereeRewardPointsMinor",
        "minQualifyingOrderAmountMinor",
        "qualifyingOrderKinds",
        "holdClearHoursAfterOrder",
        "allowBuyerIsSellerForQualification"
      ]
    },
    boosts: {
      type: "object",
      required: ["tierWeights", "maxCombinedWeight"]
    },
    rankingModifiers: {
      type: "object",
      required: ["entries"]
    }
  }
} as const;

/** Top-level keys for {@link DeenlyRewardsPlatformConfig} (documentation / codegen hints only). */
export const DEENLY_REWARDS_PLATFORM_CONFIG_SHAPE = {
  type: "object",
  required: ["growth", "trustSignals", "boostCampaigns", "feedRankingModifierCaps"],
  properties: {
    growth: REWARDS_GROWTH_BUNDLE_SHAPE,
    trustSignals: {
      type: "object",
      required: [
        "trustSignalsEnabled",
        "rewardsEarnFlagPointsMinor",
        "rewardsSpendFlagPointsMinor",
        "refundRapidFlagWithinHours",
        "boostBudgetFlagMinor",
        "rankingReportCategoriesForFlag",
        "referralFlagSameEmailDomain",
        "referralFlagDisposableRefereeEmail",
        "referralFlagSharedSignupIp",
        "referralBlockDisposableEmail",
        "disposableEmailDomains"
      ]
    },
    boostCampaigns: {
      type: "object",
      required: [
        "suggestedPackageDurationDays",
        "minCampaignDurationDays",
        "maxCampaignDurationDays",
        "defaultDraftDurationDays",
        "dailyCapImpressionsMin",
        "dailyCapImpressionsMax"
      ]
    },
    feedRankingModifierCaps: {
      type: "object",
      required: [
        "capEngagementAdditive",
        "weightEngagement",
        "capBoostTierAdditive",
        "weightBoostTierUnit",
        "capSalesLnAdditive",
        "weightSalesLn",
        "combinedPositiveCap",
        "capConversionProxyAdditive",
        "weightConversionProxy",
        "capSellerTrustSubtract",
        "weightSellerOpenReports",
        "boostMaxFractionOfCombined"
      ]
    }
  }
} as const;

/** Example payload matching {@link RewardsGrowthDomainBundle} keys (for contract tests later). */
export function bundleShapeExample(): Record<string, unknown> {
  return {
    rewards: {
      currencyCode: "DEEN_PTS",
      pointsDecimals: 0,
      maxEarnPerUserPerDayMinor: 100,
      maxEarnPerUserPerMonthMinor: 5000,
      minGrantMinor: 1,
      maxSingleGrantMinor: 50
    },
    referrals: {
      attributionWindowDays: 14,
      maxReferrerRewardsPerDay: 10,
      defaultCodeMaxRedemptions: 20,
      cooldownHoursBetweenSelfChecks: 12,
      referrerRewardPointsMinor: 100,
      refereeRewardPointsMinor: 0,
      minQualifyingOrderAmountMinor: 1,
      qualifyingOrderKinds: ["product"],
      holdClearHoursAfterOrder: 0,
      allowBuyerIsSellerForQualification: false
    },
    boosts: {
      tierWeights: [{ tierKey: "standard", weight: 1 }],
      maxCombinedWeight: 2
    },
    rankingModifiers: {
      entries: [
        {
          key: "rewards_engagement_signal_v1",
          boostCap: 0.1,
          description: "Example modifier."
        }
      ]
    }
  };
}

/** Example object matching {@link DeenlyRewardsPlatformConfig} top-level keys. */
export function platformConfigShapeExample(): Record<string, unknown> {
  return {
    growth: bundleShapeExample(),
    trustSignals: {
      trustSignalsEnabled: false,
      rewardsEarnFlagPointsMinor: 5000,
      rewardsSpendFlagPointsMinor: 8000,
      refundRapidFlagWithinHours: 72,
      boostBudgetFlagMinor: 500000,
      rankingReportCategoriesForFlag: ["spam"],
      referralFlagSameEmailDomain: true,
      referralFlagDisposableRefereeEmail: true,
      referralFlagSharedSignupIp: true,
      referralBlockDisposableEmail: false,
      disposableEmailDomains: ["mailinator.com"]
    },
    boostCampaigns: {
      suggestedPackageDurationDays: [7, 14],
      minCampaignDurationDays: 1,
      maxCampaignDurationDays: 365,
      defaultDraftDurationDays: 7,
      dailyCapImpressionsMin: 100,
      dailyCapImpressionsMax: 100000
    },
    feedRankingModifierCaps: {
      capEngagementAdditive: 42,
      weightEngagement: 1,
      capBoostTierAdditive: 24,
      weightBoostTierUnit: 12,
      capSalesLnAdditive: 16,
      weightSalesLn: 6,
      combinedPositiveCap: 72,
      capConversionProxyAdditive: 12,
      weightConversionProxy: 10,
      capSellerTrustSubtract: 22,
      weightSellerOpenReports: 5,
      boostMaxFractionOfCombined: 0.38
    }
  };
}
