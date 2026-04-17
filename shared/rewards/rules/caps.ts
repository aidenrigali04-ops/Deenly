import type { RewardMinorAmount } from "../types";
import type { RewardsRulesCapsConfig } from "./config";
import type { CapSnapshot } from "./types";

export type CapApplied = "none" | "daily" | "monthly" | "single_grant" | "min_grant";

export interface CapApplyResult {
  readonly amountMinor: RewardMinorAmount;
  /** Last constraint that lowered the amount; `min_grant` when zeroed for sub-minimum. */
  readonly cappedBy: CapApplied;
}

function clampDown(
  prev: number,
  ceiling: number,
  cap: CapApplied,
  cappedBy: CapApplied
): { amount: number; cappedBy: CapApplied } {
  const n = Math.min(prev, Math.floor(ceiling));
  if (n < prev) {
    return { amount: n, cappedBy: cap };
  }
  return { amount: prev, cappedBy };
}

/**
 * Enforce single-grant, daily, monthly, then min-grant floor. Pure — snapshot is caller-supplied.
 */
export function applyEarnCaps(
  rawAmount: RewardMinorAmount,
  snapshot: CapSnapshot,
  caps: RewardsRulesCapsConfig
): CapApplyResult {
  let amount = Math.floor(rawAmount);
  let cappedBy: CapApplied = "none";

  ({ amount, cappedBy } = clampDown(amount, caps.maxSingleGrantMinor, "single_grant", cappedBy));

  const roomDaily = Math.max(0, caps.maxEarnPerUserPerDayMinor - snapshot.dailyEarnedMinor);
  ({ amount, cappedBy } = clampDown(amount, roomDaily, "daily", cappedBy));

  const roomMonthly = Math.max(0, caps.maxEarnPerUserPerMonthMinor - snapshot.monthlyEarnedMinor);
  ({ amount, cappedBy } = clampDown(amount, roomMonthly, "monthly", cappedBy));

  if (amount > 0 && amount < caps.minGrantMinor) {
    amount = 0;
    cappedBy = "min_grant";
  }

  return { amountMinor: amount as RewardMinorAmount, cappedBy };
}
