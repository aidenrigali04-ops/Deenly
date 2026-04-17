import type { RewardsDomainConfig } from "../types";
import { REWARDS_DOMAIN_CONFIG } from "../config";
import type { EarnActionKey } from "./types";
import { EARN_ACTION_KEYS } from "./types";

/** Per-action base earn (minor units) before quality multipliers where applicable. */
export type EarnActionPointsTable = Partial<Record<EarnActionKey, number>>;

export interface RewardsRulesEarnConfig {
  readonly actionPointsMinor: EarnActionPointsTable;
  /** Minimum engagement quality (0–1) required for comment/reaction earns. */
  readonly minQualityForEngagementEarn: number;
  readonly minDwellSecondsForReaction: number;
  /** Actions that require `depth === "qualified"` to earn. */
  readonly requireQualifiedDepth: readonly EarnActionKey[];
}

export interface RewardsRulesCapsConfig {
  /** Should align with {@link RewardsDomainConfig.maxEarnPerUserPerDayMinor} unless beta overrides. */
  readonly maxEarnPerUserPerDayMinor: number;
  readonly maxEarnPerUserPerMonthMinor: number;
  readonly maxSingleGrantMinor: number;
  readonly minGrantMinor: number;
}

export interface RewardsRulesAntiFarmingConfig {
  readonly maxGrantsPerRollingHour: number;
  /**
   * Optional stricter burst cap (rolling ~5 minutes). When set, orchestrator must supply
   * {@link AntiFarmingSignals.grantsLastFiveMinutesCount}.
   */
  readonly maxGrantsPerRollingFiveMinutes?: number;
  readonly minSecondsBetweenGrantsSameTarget: number;
  /**
   * Minimum account age (days) before engagement earns (`qualified_comment`, `qualified_reaction`).
   * `0` disables — signup bonuses and non-engagement earns ignore this.
   */
  readonly minAccountAgeDaysForEngagementEarn: number;
  /**
   * Max completed earns involving the same target (post/user) per UTC calendar day for the actor.
   * Requires {@link AntiFarmingSignals.sameTargetEarnCountToday} from the orchestrator.
   */
  readonly maxEarnsSameTargetPerCalendarDay?: number;
  /** Reject any attempted earn whose surface key matches passive list (defense in depth). */
  readonly blockPassiveSurfaces: boolean;
}

export interface RewardsRulesRedemptionConfig {
  readonly minBalanceMinor: number;
  readonly maxPointsPerRedemptionMinor: number;
  readonly cooldownHoursBetweenRedemptions: number;
  /**
   * Minimum card charge (currency minor units) after applying points discount.
   * Must be >= Stripe minimums for the currency; configured per environment, not inlined in code paths.
   */
  readonly minOrderAmountRemainingMinor: number;
  /** Max discount as basis points of list price (0–10000). */
  readonly maxCheckoutDiscountBps: number;
  /** Whole points spent to discount one currency minor unit off the card total (>= 1). */
  readonly pointsPerFiatMinorUnit: number;
}

export interface RewardsRulesReversalConfig {
  readonly fullRefundClawbackRatio: number;
  readonly partialRefundClawbackRatio: number;
  readonly chargebackClawbackRatio: number;
  readonly maxReversalAgeDays: number;
}

export interface RewardsRulesConfig {
  readonly rewardsBase: RewardsDomainConfig;
  readonly earn: RewardsRulesEarnConfig;
  readonly caps: RewardsRulesCapsConfig;
  readonly antiFarming: RewardsRulesAntiFarmingConfig;
  readonly redemption: RewardsRulesRedemptionConfig;
  readonly reversal: RewardsRulesReversalConfig;
}

/** Bump when rule semantics change (store on ledger metadata in later sprints). */
export const REWARDS_RULES_ENGINE_VERSION = "1.2.0";

const DEFAULT_ACTION_POINTS: EarnActionPointsTable = {
  signup_complete: 250,
  first_post_published: 150,
  qualified_comment: 40,
  qualified_reaction: 15,
  referral_qualified: 500,
  purchase_completed: 100,
  daily_active_streak: 25,
  admin_grant: 0
};

function capsFromRewardsBase(r: RewardsDomainConfig): RewardsRulesCapsConfig {
  return {
    maxEarnPerUserPerDayMinor: r.maxEarnPerUserPerDayMinor,
    maxEarnPerUserPerMonthMinor: r.maxEarnPerUserPerMonthMinor,
    maxSingleGrantMinor: r.maxSingleGrantMinor,
    minGrantMinor: r.minGrantMinor
  };
}

/** Default rules config — tune via {@link mergeRewardsRulesConfig} in beta without code edits. */
export const DEFAULT_REWARDS_RULES_CONFIG: RewardsRulesConfig = {
  rewardsBase: REWARDS_DOMAIN_CONFIG,
  earn: {
    actionPointsMinor: DEFAULT_ACTION_POINTS,
    minQualityForEngagementEarn: 0.55,
    minDwellSecondsForReaction: 3,
    requireQualifiedDepth: ["qualified_comment", "qualified_reaction"]
  },
  caps: capsFromRewardsBase(REWARDS_DOMAIN_CONFIG),
  antiFarming: {
    maxGrantsPerRollingHour: 40,
    maxGrantsPerRollingFiveMinutes: 12,
    minSecondsBetweenGrantsSameTarget: 45,
    minAccountAgeDaysForEngagementEarn: 0,
    maxEarnsSameTargetPerCalendarDay: 8,
    blockPassiveSurfaces: true
  },
  redemption: {
    minBalanceMinor: 500,
    maxPointsPerRedemptionMinor: 10_000,
    cooldownHoursBetweenRedemptions: 24,
    minOrderAmountRemainingMinor: 50,
    maxCheckoutDiscountBps: 5000,
    pointsPerFiatMinorUnit: 100
  },
  reversal: {
    fullRefundClawbackRatio: 1,
    partialRefundClawbackRatio: 0.5,
    chargebackClawbackRatio: 1,
    maxReversalAgeDays: 120
  }
} as const satisfies RewardsRulesConfig;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = out[k];
    if (isPlainObject(cur) && isPlainObject(v)) {
      out[k] = deepMerge(cur as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

/**
 * Shallow-friendly merge for beta (env JSON → parsed object).
 * When the patch includes `rewardsBase`, {@link capsFromRewardsBase} is re-applied so daily/monthly
 * caps stay aligned with the domain slice (override `caps` alone if you need an intentional mismatch).
 * Does not validate — call {@link validateRewardsRulesConfig} after merge.
 */
export function mergeRewardsRulesConfig(
  base: RewardsRulesConfig,
  patch: Partial<Record<string, unknown>>
): RewardsRulesConfig {
  const merged = deepMerge(base as unknown as Record<string, unknown>, patch) as unknown as RewardsRulesConfig;
  if (patch && typeof patch === "object" && "rewardsBase" in patch && patch.rewardsBase != null) {
    return {
      ...merged,
      caps: capsFromRewardsBase(merged.rewardsBase)
    };
  }
  return merged;
}

export function listEarnActionKeys(): readonly EarnActionKey[] {
  return EARN_ACTION_KEYS;
}
