/**
 * Shared domain types for Deenly Rewards + growth tuning (no runtime I/O).
 * Downstream: web, mobile, and future Node workers — keep backend JS adapters thin.
 */

/** Integer minor units for reward points (e.g. whole points only while decimals = 0). */
export type RewardMinorAmount = number;

export type RewardEarnReasonKey =
  | "signup_complete"
  | "first_post"
  | "first_post_published"
  | "qualified_engagement"
  | "referral_qualified"
  | "purchase_completed"
  | "daily_active_streak"
  | "admin_grant";

export type RewardSpendReasonKey = "redemption_catalog" | "admin_adjustment" | "expiration";

export type ReferralAttributionStatus = "pending" | "qualified" | "rejected" | "expired";

export type ReferralCodeStatus = "active" | "paused" | "revoked";

/** Logical boost tier labels — align naming with product; not Stripe IDs. */
export type BoostTierKey = "none" | "standard" | "boosted" | "aggressive";

/** Keys for feed / discovery ranking experiments (strings are extensible). */
export type RankingModifierKey =
  | "rewards_engagement_signal_v1"
  | "referral_social_proof_v1"
  | "creator_boost_weight_cap_v1";

export interface RewardsDomainConfig {
  readonly currencyCode: string;
  /** Display / API scale: 0 = whole points only. */
  readonly pointsDecimals: 0 | 2 | 3;
  readonly maxEarnPerUserPerDayMinor: RewardMinorAmount;
  /** Upper bound on net earn per calendar month (rolling window is orchestrator concern). */
  readonly maxEarnPerUserPerMonthMinor: RewardMinorAmount;
  readonly minGrantMinor: RewardMinorAmount;
  readonly maxSingleGrantMinor: RewardMinorAmount;
}

export interface ReferralsDomainConfig {
  readonly attributionWindowDays: number;
  readonly maxReferrerRewardsPerDay: number;
  readonly defaultCodeMaxRedemptions: number;
  readonly cooldownHoursBetweenSelfChecks: number;
  /** Points granted to referrer when an attribution reaches `qualified` (minor units). */
  readonly referrerRewardPointsMinor: number;
  /** Optional points for referee on qualification; 0 disables referee grant. */
  readonly refereeRewardPointsMinor: number;
  /** Minimum `orders.amount_minor` for a purchase to count toward qualification. */
  readonly minQualifyingOrderAmountMinor: number;
  /** Subset of `orders.kind` values that can qualify (e.g. product, subscription). */
  readonly qualifyingOrderKinds: readonly string[];
  /**
   * Hours after a qualifying completed order before rewards may release, while the order
   * must remain `completed` (refund-clear window). 0 = eligible immediately after order insert.
   */
  readonly holdClearHoursAfterOrder: number;
  /** When false, orders where buyer_user_id equals seller_user_id never qualify. */
  readonly allowBuyerIsSellerForQualification: boolean;
}

export interface BoostWeightEntry {
  readonly tierKey: BoostTierKey;
  /** Non-negative multiplier weight relative to baseline. */
  readonly weight: number;
}

export interface BoostsDomainConfig {
  readonly tierWeights: readonly BoostWeightEntry[];
  /** Upper bound for combined boost factor after normalization (product guardrail). */
  readonly maxCombinedWeight: number;
}

export interface RankingModifierEntry {
  readonly key: RankingModifierKey;
  /** 0–1 soft cap on how much this modifier can move a score. */
  readonly boostCap: number;
  readonly description: string;
}

export interface RankingModifiersDomainConfig {
  readonly entries: readonly RankingModifierEntry[];
}

/** One object for config loaders (env merge in later sprints). */
export interface RewardsGrowthDomainBundle {
  readonly rewards: RewardsDomainConfig;
  readonly referrals: ReferralsDomainConfig;
  readonly boosts: BoostsDomainConfig;
  readonly rankingModifiers: RankingModifiersDomainConfig;
}

/** Stored / API values for `trust_review_flags.domain` (Postgres CHECK). */
export type TrustReviewFlagDomain = "referral" | "rewards" | "boost" | "refund" | "ranking";

export type TrustReviewFlagSeverity = "info" | "low" | "medium" | "high";

export type TrustReviewFlagStatus = "open" | "acknowledged" | "dismissed";

/**
 * Resolved trust / fraud heuristic knobs (env merge happens in server loaders).
 * Mirrors backend `getTrustSignalThresholds` shape — keep defaults aligned there.
 */
export interface TrustSignalsDomainConfig {
  readonly trustSignalsEnabled: boolean;
  readonly rewardsEarnFlagPointsMinor: number;
  readonly rewardsSpendFlagPointsMinor: number;
  readonly refundRapidFlagWithinHours: number;
  /** Currency minor units (e.g. USD cents) for boost budget review threshold. */
  readonly boostBudgetFlagMinor: number;
  readonly rankingReportCategoriesForFlag: readonly string[];
  readonly referralFlagSameEmailDomain: boolean;
  readonly referralFlagDisposableRefereeEmail: boolean;
  readonly referralFlagSharedSignupIp: boolean;
  readonly referralBlockDisposableEmail: boolean;
  readonly disposableEmailDomains: readonly string[];
}

/**
 * Product-level bounds for ad / boost **campaign scheduling** (not Stripe checkout).
 * Aligns with boost catalog suggested `durationDays` and ads route clamps.
 */
export interface BoostsCampaignDomainConfig {
  /** Distinct suggested calendar lengths from packaged boosts (e.g. 7, 14). */
  readonly suggestedPackageDurationDays: readonly number[];
  readonly minCampaignDurationDays: number;
  readonly maxCampaignDurationDays: number;
  readonly defaultDraftDurationDays: number;
  readonly dailyCapImpressionsMin: number;
  readonly dailyCapImpressionsMax: number;
}

/**
 * Feed rank_score additive modifier **caps** (bounded boosts; non-pay-to-win guardrails).
 * Mirrors `config.feedRankModifiers` defaults in the backend env loader.
 */
export interface FeedRankingModifierCapsConfig {
  readonly capEngagementAdditive: number;
  readonly weightEngagement: number;
  readonly capBoostTierAdditive: number;
  readonly weightBoostTierUnit: number;
  readonly capSalesLnAdditive: number;
  readonly weightSalesLn: number;
  readonly combinedPositiveCap: number;
  readonly capConversionProxyAdditive: number;
  readonly weightConversionProxy: number;
  readonly capSellerTrustSubtract: number;
  readonly weightSellerOpenReports: number;
  /** Max share of {@link combinedPositiveCap} that may come from paid boost tier alone. */
  readonly boostMaxFractionOfCombined: number;
}

/** Admin POST body for referral attribution review (see rewards-admin routes). */
export type ReferralAttributionAdminReviewAction = "mark_reviewed" | "reject";

/**
 * Single umbrella config for clients / docs: growth bundle + trust + boost scheduling + feed caps.
 * No runtime I/O — loaders merge env then validate.
 */
export interface DeenlyRewardsPlatformConfig {
  readonly growth: RewardsGrowthDomainBundle;
  readonly trustSignals: TrustSignalsDomainConfig;
  readonly boostCampaigns: BoostsCampaignDomainConfig;
  readonly feedRankingModifierCaps: FeedRankingModifierCapsConfig;
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };
