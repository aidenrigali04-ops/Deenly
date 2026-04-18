/**
 * Rewards rules engine — pure types (no I/O).
 * Ledger and HTTP layers consume {@link RuleDecision} / {@link RedemptionDecision} only.
 */

import type { RewardMinorAmount, RewardSpendReasonKey } from "../types";

/**
 * Actions that may produce earn decisions after rules evaluation.
 * Intentionally excludes passive feed signals — there is no earn path for scroll/impression.
 */
export const EARN_ACTION_KEYS = [
  "signup_complete",
  "first_post_published",
  "first_product_order_completed",
  "qualified_comment",
  "qualified_reaction",
  "referral_qualified",
  /** Referee side of referral qualification (referrer uses `referral_qualified`). */
  "referral_qualified_referee",
  "purchase_completed",
  "daily_active_streak",
  "admin_grant"
] as const;

export type EarnActionKey = (typeof EARN_ACTION_KEYS)[number];

/**
 * Explicit non-earning signals (defense in depth if orchestrator passes a string).
 * Must never appear in {@link EARN_ACTION_KEYS}.
 */
export const NON_EARNING_SURFACE_KEYS = [
  "feed_scroll",
  "feed_impression",
  "feed_passive_scroll",
  "session_heartbeat",
  "profile_view_only"
] as const;

export type NonEarningSurfaceKey = (typeof NON_EARNING_SURFACE_KEYS)[number];

export type EngagementDepth = "surface" | "qualified";

export interface EngagementFacts {
  readonly actorUserId: number;
  /**
   * Optional client-reported UI surface (e.g. `post_detail`, `feed_scroll`).
   * When {@link RewardsRulesAntiFarmingConfig.blockPassiveSurfaces} is true, passive-only keys
   * in {@link NON_EARNING_SURFACE_KEYS} deny even if `actionKey` were mis-set to an earn action.
   */
  readonly surfaceKey?: string;
  /** Resolved earn action; orchestrator must map domain events here. */
  readonly actionKey: string;
  /** Admin-only explicit grant size (still bounded by caps / max single). */
  readonly adminOverrideAmountMinor?: number;
  readonly occurredAtIso: string;
  readonly targetPostId?: number;
  readonly targetUserId?: number;
  /** Self-engagement (e.g. like own post) must not earn — set by orchestrator. */
  readonly isSelfTarget?: boolean;
  readonly depth?: EngagementDepth;
  /** 0–1 quality score for engagement (orchestrator computes dwell + substance heuristics). */
  readonly engagementQuality?: number;
  readonly dwellTimeSeconds?: number;
}

export interface CapSnapshot {
  readonly dailyEarnedMinor: RewardMinorAmount;
  readonly monthlyEarnedMinor: RewardMinorAmount;
  /** Grants in rolling 60-minute window (orchestrator). */
  readonly grantsLastHourCount?: number;
  /** Grants in rolling ~5-minute window when burst cap is configured. */
  readonly grantsLastFiveMinutesCount?: number;
  /** Seconds since last earn involving same target (post/user), if known. */
  readonly secondsSinceLastEarnSameTarget?: number;
  /** Completed earns for this actor+target today (UTC day), when per-target daily cap is configured. */
  readonly sameTargetEarnCountToday?: number;
}

export interface AntiFarmingSignals {
  readonly grantsLastHourCount?: number;
  readonly grantsLastFiveMinutesCount?: number;
  readonly secondsSinceLastEarnSameTarget?: number;
  readonly accountAgeDays?: number;
  readonly sameTargetEarnCountToday?: number;
}

export interface RedemptionRequest {
  readonly pointsMinor: RewardMinorAmount;
  readonly requestedAtIso: string;
}

export interface RedemptionSnapshot {
  readonly balanceMinor: RewardMinorAmount;
  readonly lastRedemptionAtIso?: string | null;
  /** When true, all spends / checkout redemption are blocked (trust, fraud, or admin freeze). */
  readonly rewardsFrozen?: boolean;
}

export type RuleDenyReasonCode =
  | "unknown_action"
  | "non_earning_surface"
  | "self_target"
  | "engagement_not_qualified"
  | "quality_below_threshold"
  | "dwell_below_threshold"
  | "anti_farming_velocity"
  | "anti_farming_burst_velocity"
  | "anti_farming_same_target_cooldown"
  | "anti_farming_same_target_daily_cap"
  | "account_too_new_for_engagement_earn"
  | "below_min_grant_after_caps"
  | "daily_cap_exhausted"
  | "monthly_cap_exhausted";

export interface RuleDecision {
  readonly allowGrant: boolean;
  readonly amountMinor: RewardMinorAmount;
  readonly rawAmountMinor: RewardMinorAmount;
  readonly cappedBy: "none" | "daily" | "monthly" | "single_grant" | "min_grant";
  readonly denyReasons: readonly RuleDenyReasonCode[];
  readonly meta: {
    readonly actionKey: string;
    readonly resolvedEarnAction: EarnActionKey | null;
    readonly engineVersion: string;
  };
}

export type RedemptionDenyReasonCode =
  | "below_min_balance"
  | "insufficient_balance"
  | "above_max_per_redemption"
  | "cooldown_active"
  | "non_positive_amount"
  | "rewards_frozen"
  | "product_not_eligible"
  | "below_min_order_after_discount"
  | "above_checkout_discount_cap"
  | "no_discount_room";

export interface RedemptionDecision {
  readonly allow: boolean;
  readonly denyReasons: readonly RedemptionDenyReasonCode[];
}

export type ReversalKind = "full_clawback" | "partial_clawback" | "deny_stale" | "deny_over_redeemed";

export interface ReversalLine {
  readonly amountMinor: RewardMinorAmount;
  readonly reason: RewardSpendReasonKey;
  readonly kind: ReversalKind;
}

export interface RefundDisputeFacts {
  readonly occurredAtIso: string;
  readonly originalGrantAtIso: string;
  readonly originalGrantMinor: RewardMinorAmount;
  /** Points already clawed back for this source idempotency scope. */
  readonly alreadyReversedMinor: RewardMinorAmount;
  /** Points user redeemed after original grant (policy: may block full clawback). */
  readonly redeemedSinceGrantMinor: RewardMinorAmount;
  readonly isFullRefund: boolean;
  readonly isChargeback: boolean;
}

export interface ReversalPlan {
  readonly lines: readonly ReversalLine[];
  readonly deniedReason?: "beyond_max_age" | "nothing_to_claw_back" | "would_exceed_original_grant";
}
