import type { RewardMinorAmount } from "../types";
import type { RewardsRulesReversalConfig } from "./config";
import type { RefundDisputeFacts, ReversalLine, ReversalPlan } from "./types";

/** Pure helper — same ratio selection as {@link planReversalsForRefund} (for tests / services). */
export function pickRefundClawbackRatio(
  facts: Pick<RefundDisputeFacts, "isChargeback" | "isFullRefund">,
  cfg: RewardsRulesReversalConfig
): number {
  if (facts.isChargeback) {
    return cfg.chargebackClawbackRatio;
  }
  if (facts.isFullRefund) {
    return cfg.fullRefundClawbackRatio;
  }
  return cfg.partialRefundClawbackRatio;
}

/** Points still subject to clawback after prior reversals (never negative). */
export function remainingGrantAfterReversalsMinor(
  originalGrantMinor: RewardMinorAmount,
  alreadyReversedMinor: RewardMinorAmount
): RewardMinorAmount {
  const o = Math.max(0, Math.floor(originalGrantMinor));
  const r = Math.max(0, Math.floor(alreadyReversedMinor));
  return Math.max(0, o - r) as RewardMinorAmount;
}

/**
 * Maximum points that may still be clawed back for this grant scope, net of post-grant redemptions.
 * Matches the ceiling used inside {@link planReversalsForRefund}.
 */
export function netClawbackCeilingMinor(
  remainingGrantMinor: RewardMinorAmount,
  redeemedSinceGrantMinor: RewardMinorAmount
): RewardMinorAmount {
  const rem = Math.max(0, Math.floor(remainingGrantMinor));
  const red = Math.max(0, Math.floor(redeemedSinceGrantMinor));
  return Math.max(0, rem - red) as RewardMinorAmount;
}

/**
 * Target clawback minor units from ratio policy before min() with the net ceiling — pure arithmetic helper.
 */
export function computeRatioClawbackTargetMinor(
  remainingGrantMinor: RewardMinorAmount,
  ratio: number
): RewardMinorAmount {
  const rem = Math.max(0, Math.floor(remainingGrantMinor));
  const rt = Math.max(0, Math.min(1, ratio));
  return Math.floor(rem * rt) as RewardMinorAmount;
}

/**
 * Single-step clawback sizing for refund/dispute flows (same math as {@link planReversalsForRefund} lines[0]).
 */
export function computeRefundClawbackTargetMinor(
  facts: RefundDisputeFacts,
  cfg: RewardsRulesReversalConfig
): RewardMinorAmount {
  const remaining = remainingGrantAfterReversalsMinor(facts.originalGrantMinor, facts.alreadyReversedMinor);
  const ratioTarget = computeRatioClawbackTargetMinor(remaining, pickRefundClawbackRatio(facts, cfg));
  const ceiling = netClawbackCeilingMinor(remaining, facts.redeemedSinceGrantMinor);
  return Math.min(ratioTarget, ceiling) as RewardMinorAmount;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(a - b) / 86_400_000;
}

/**
 * Pure reversal planner — ledger applies lines with idempotency.
 *
 * **Deferred (future sprints):** multi-line-item orders, net-of-tax, balance-aware clawback caps,
 * Stripe dispute lifecycle beyond a single ratio bucket.
 */
export function planReversalsForRefund(
  facts: RefundDisputeFacts,
  cfg: RewardsRulesReversalConfig
): ReversalPlan {
  const ageDays = daysBetween(facts.originalGrantAtIso, facts.occurredAtIso);
  if (ageDays > cfg.maxReversalAgeDays) {
    return { lines: [], deniedReason: "beyond_max_age" };
  }

  const remainingGrant = remainingGrantAfterReversalsMinor(facts.originalGrantMinor, facts.alreadyReversedMinor);
  if (remainingGrant <= 0) {
    return { lines: [], deniedReason: "nothing_to_claw_back" };
  }

  const ratioTarget = computeRatioClawbackTargetMinor(remainingGrant, pickRefundClawbackRatio(facts, cfg));
  const clawableCeiling = netClawbackCeilingMinor(remainingGrant, facts.redeemedSinceGrantMinor);
  const target = computeRefundClawbackTargetMinor(facts, cfg);

  if (target <= 0) {
    if (ratioTarget > 0 && clawableCeiling <= 0) {
      return { lines: [], deniedReason: "would_exceed_original_grant" };
    }
    return { lines: [], deniedReason: "nothing_to_claw_back" };
  }

  const kind: ReversalLine["kind"] = facts.isChargeback
    ? "partial_clawback"
    : facts.isFullRefund
      ? "full_clawback"
      : "partial_clawback";

  const line: ReversalLine = {
    amountMinor: target,
    reason: "admin_adjustment",
    kind
  };

  return { lines: [line] };
}
