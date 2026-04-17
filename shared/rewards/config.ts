import type {
  BoostsCampaignDomainConfig,
  BoostsDomainConfig,
  DeenlyRewardsPlatformConfig,
  FeedRankingModifierCapsConfig,
  RankingModifiersDomainConfig,
  ReferralsDomainConfig,
  RewardsDomainConfig,
  RewardsGrowthDomainBundle,
  TrustSignalsDomainConfig
} from "./types";

/**
 * Central typed defaults — feature code must import from here or {@link DEFAULT_REWARDS_GROWTH_BUNDLE},
 * not inline numbers.
 */
export const REWARDS_DOMAIN_CONFIG: RewardsDomainConfig = {
  currencyCode: "DEEN_PTS",
  pointsDecimals: 0,
  maxEarnPerUserPerDayMinor: 5_000,
  maxEarnPerUserPerMonthMinor: 50_000,
  minGrantMinor: 1,
  maxSingleGrantMinor: 2_000
} as const satisfies RewardsDomainConfig;

export const REFERRALS_DOMAIN_CONFIG: ReferralsDomainConfig = {
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
} as const satisfies ReferralsDomainConfig;

export const BOOSTS_DOMAIN_CONFIG: BoostsDomainConfig = {
  tierWeights: [
    { tierKey: "none", weight: 1 },
    { tierKey: "standard", weight: 1 },
    { tierKey: "boosted", weight: 1.15 },
    { tierKey: "aggressive", weight: 1.35 }
  ],
  maxCombinedWeight: 2
} as const satisfies BoostsDomainConfig;

export const RANKING_MODIFIERS_DOMAIN_CONFIG: RankingModifiersDomainConfig = {
  entries: [
    {
      key: "rewards_engagement_signal_v1",
      boostCap: 0.12,
      description: "Small boost from verified reward engagement signals."
    },
    {
      key: "referral_social_proof_v1",
      boostCap: 0.08,
      description: "Cap on referral-derived discovery lift."
    },
    {
      key: "creator_boost_weight_cap_v1",
      boostCap: 0.2,
      description: "Upper bound for paid/boost tier influence on ranking."
    }
  ]
} as const satisfies RankingModifiersDomainConfig;

export const DEFAULT_REWARDS_GROWTH_BUNDLE: RewardsGrowthDomainBundle = {
  rewards: REWARDS_DOMAIN_CONFIG,
  referrals: REFERRALS_DOMAIN_CONFIG,
  boosts: BOOSTS_DOMAIN_CONFIG,
  rankingModifiers: RANKING_MODIFIERS_DOMAIN_CONFIG
} as const satisfies RewardsGrowthDomainBundle;

/** Default disposable registrable domains — keep in sync with backend `DEFAULT_DISPOSABLE_DOMAINS`. */
export const DEFAULT_TRUST_DISPOSABLE_EMAIL_DOMAINS: readonly string[] = [
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com"
] as const;

export const DEFAULT_TRUST_SIGNALS_DOMAIN_CONFIG: TrustSignalsDomainConfig = {
  trustSignalsEnabled: false,
  rewardsEarnFlagPointsMinor: 5000,
  rewardsSpendFlagPointsMinor: 8000,
  refundRapidFlagWithinHours: 72,
  boostBudgetFlagMinor: 500_000,
  rankingReportCategoriesForFlag: ["spam", "misinformation"],
  referralFlagSameEmailDomain: true,
  referralFlagDisposableRefereeEmail: true,
  referralFlagSharedSignupIp: true,
  referralBlockDisposableEmail: false,
  disposableEmailDomains: DEFAULT_TRUST_DISPOSABLE_EMAIL_DOMAINS
} as const satisfies TrustSignalsDomainConfig;

/** Aligns with `backend/src/config/boost-catalog.js` suggested durations and ads API clamps. */
export const DEFAULT_BOOSTS_CAMPAIGN_DOMAIN_CONFIG: BoostsCampaignDomainConfig = {
  suggestedPackageDurationDays: [7, 14],
  minCampaignDurationDays: 1,
  maxCampaignDurationDays: 365,
  defaultDraftDurationDays: 7,
  dailyCapImpressionsMin: 100,
  dailyCapImpressionsMax: 100_000
} as const satisfies BoostsCampaignDomainConfig;

/** Mirrors backend `feedRankModifiers` defaults in `loadEnv`. */
export const DEFAULT_FEED_RANKING_MODIFIER_CAPS_CONFIG: FeedRankingModifierCapsConfig = {
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
} as const satisfies FeedRankingModifierCapsConfig;

export const DEFAULT_DEENLY_REWARDS_PLATFORM_CONFIG: DeenlyRewardsPlatformConfig = {
  growth: DEFAULT_REWARDS_GROWTH_BUNDLE,
  trustSignals: DEFAULT_TRUST_SIGNALS_DOMAIN_CONFIG,
  boostCampaigns: DEFAULT_BOOSTS_CAMPAIGN_DOMAIN_CONFIG,
  feedRankingModifierCaps: DEFAULT_FEED_RANKING_MODIFIER_CAPS_CONFIG
} as const satisfies DeenlyRewardsPlatformConfig;
