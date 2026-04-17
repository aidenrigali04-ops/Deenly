import type { CapApplyResult } from "./caps";
import type { RewardsRulesConfig } from "./config";
import { REWARDS_RULES_ENGINE_VERSION } from "./config";
import { evaluateAntiFarming } from "./anti-farming";
import { applyEarnCaps } from "./caps";
import { mergeAntiFarmingSignals } from "./signals";
import type {
  AntiFarmingSignals,
  CapSnapshot,
  EarnActionKey,
  EngagementFacts,
  RuleDecision,
  RuleDenyReasonCode
} from "./types";
import { EARN_ACTION_KEYS, NON_EARNING_SURFACE_KEYS } from "./types";

const ENGAGEMENT_QUALITY_ACTIONS: ReadonlySet<EarnActionKey> = new Set([
  "qualified_comment",
  "qualified_reaction"
]);

export function isEarnActionKey(value: string): value is EarnActionKey {
  return (EARN_ACTION_KEYS as readonly string[]).includes(value);
}

export function isNonEarningSurfaceKey(value: string): boolean {
  return (NON_EARNING_SURFACE_KEYS as readonly string[]).includes(value);
}

/**
 * When a positive raw grant becomes zero after caps, surface the most specific deny codes.
 */
export function denyReasonsWhenGrantBlockedByCaps(
  rawAmountMinor: number,
  capped: CapApplyResult
): readonly RuleDenyReasonCode[] {
  if (rawAmountMinor <= 0) {
    return ["below_min_grant_after_caps"];
  }
  if (capped.amountMinor > 0) {
    return [];
  }
  if (capped.cappedBy === "daily") {
    return ["daily_cap_exhausted"];
  }
  if (capped.cappedBy === "monthly") {
    return ["monthly_cap_exhausted"];
  }
  return ["below_min_grant_after_caps"];
}

function gateEarnEligibility(
  facts: EngagementFacts,
  cfg: RewardsRulesConfig
): RuleDenyReasonCode[] {
  const deny: RuleDenyReasonCode[] = [];

  const passiveGuard = cfg.antiFarming.blockPassiveSurfaces && facts.actionKey !== "admin_grant";

  const surface = facts.surfaceKey != null ? String(facts.surfaceKey).trim() : "";
  if (passiveGuard && surface.length > 0 && isNonEarningSurfaceKey(surface)) {
    deny.push("non_earning_surface");
    return deny;
  }

  if (passiveGuard && isNonEarningSurfaceKey(facts.actionKey)) {
    deny.push("non_earning_surface");
    return deny;
  }

  if (!isEarnActionKey(facts.actionKey)) {
    deny.push("unknown_action");
    return deny;
  }

  const key = facts.actionKey as EarnActionKey;

  if (facts.isSelfTarget && (key === "qualified_comment" || key === "qualified_reaction")) {
    deny.push("self_target");
  }

  if (cfg.earn.requireQualifiedDepth.includes(key)) {
    if (facts.depth !== "qualified") {
      deny.push("engagement_not_qualified");
    }
  }

  if (ENGAGEMENT_QUALITY_ACTIONS.has(key)) {
    const q = facts.engagementQuality;
    if (typeof q !== "number" || !Number.isFinite(q) || q < cfg.earn.minQualityForEngagementEarn) {
      deny.push("quality_below_threshold");
    }
  }

  if (key === "qualified_reaction") {
    const dwell = facts.dwellTimeSeconds;
    if (
      typeof dwell !== "number" ||
      !Number.isFinite(dwell) ||
      dwell < cfg.earn.minDwellSecondsForReaction
    ) {
      deny.push("dwell_below_threshold");
    }
  }

  return deny;
}

export function computeRawEarnAmount(
  action: EarnActionKey,
  facts: EngagementFacts,
  cfg: RewardsRulesConfig
): number {
  if (action === "admin_grant") {
    const o = facts.adminOverrideAmountMinor;
    if (typeof o === "number" && Number.isFinite(o) && o >= 0) {
      return Math.floor(o);
    }
    return Math.floor(cfg.earn.actionPointsMinor.admin_grant ?? 0);
  }

  const base = cfg.earn.actionPointsMinor[action];
  const baseAmount = typeof base === "number" && Number.isFinite(base) ? Math.max(0, Math.floor(base)) : 0;

  if (!ENGAGEMENT_QUALITY_ACTIONS.has(action)) {
    return baseAmount;
  }

  const q = facts.engagementQuality;
  if (typeof q !== "number" || !Number.isFinite(q)) {
    return 0;
  }
  const t = cfg.earn.minQualityForEngagementEarn;
  if (q < t) {
    return 0;
  }
  const scale = Math.min(1, (q - t) / Math.max(1e-6, 1 - t));
  return Math.floor(baseAmount * scale);
}

const EMPTY_CAP_SNAPSHOT: CapSnapshot = { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 };

/**
 * Eligibility only — mirrors {@link evaluateEarnPipeline} gates + caps (no ledger I/O).
 * Pass `snapshot` so velocity / same-target hints on the snapshot are honored when signals omit them.
 */
export function evaluateEarnEligibility(
  facts: EngagementFacts,
  signals: AntiFarmingSignals,
  cfg: RewardsRulesConfig,
  snapshot: CapSnapshot = EMPTY_CAP_SNAPSHOT
): { readonly eligible: boolean; readonly denyReasons: readonly RuleDenyReasonCode[] } {
  const deny = [...gateEarnEligibility(facts, cfg)];
  if (deny.length) {
    return { eligible: false, denyReasons: deny };
  }
  const key = facts.actionKey as EarnActionKey;
  const mergedSignals = mergeAntiFarmingSignals(snapshot, signals);
  const af = evaluateAntiFarming(facts, mergedSignals, cfg.antiFarming);
  if (!af.ok) {
    return { eligible: false, denyReasons: [...deny, ...af.denyReasons] };
  }
  const raw = computeRawEarnAmount(key, facts, cfg);
  const capped = applyEarnCaps(raw, snapshot, cfg.caps);
  if (capped.amountMinor <= 0) {
    return {
      eligible: false,
      denyReasons: [...deny, ...denyReasonsWhenGrantBlockedByCaps(raw, capped)]
    };
  }
  return { eligible: true, denyReasons: [] };
}

export function evaluateEarnPipeline(
  facts: EngagementFacts,
  signals: AntiFarmingSignals,
  snapshot: CapSnapshot,
  cfg: RewardsRulesConfig
): RuleDecision {
  const metaBase = {
    actionKey: facts.actionKey,
    engineVersion: REWARDS_RULES_ENGINE_VERSION
  } as const;

  const denyReasons: RuleDenyReasonCode[] = [...gateEarnEligibility(facts, cfg)];

  if (denyReasons.length) {
    return {
      allowGrant: false,
      amountMinor: 0,
      rawAmountMinor: 0,
      cappedBy: "none",
      denyReasons,
      meta: {
        ...metaBase,
        resolvedEarnAction: isEarnActionKey(facts.actionKey) ? facts.actionKey : null
      }
    };
  }

  const resolved = facts.actionKey as EarnActionKey;
  const mergedSignals = mergeAntiFarmingSignals(snapshot, signals);
  const af = evaluateAntiFarming(facts, mergedSignals, cfg.antiFarming);
  if (!af.ok) {
    return {
      allowGrant: false,
      amountMinor: 0,
      rawAmountMinor: 0,
      cappedBy: "none",
      denyReasons: [...denyReasons, ...af.denyReasons],
      meta: { ...metaBase, resolvedEarnAction: resolved }
    };
  }

  const rawAmountMinor = computeRawEarnAmount(resolved, facts, cfg);
  const capped = applyEarnCaps(rawAmountMinor, snapshot, cfg.caps);

  if (capped.amountMinor <= 0) {
    return {
      allowGrant: false,
      amountMinor: 0,
      rawAmountMinor: rawAmountMinor,
      cappedBy: capped.cappedBy,
      denyReasons: [...denyReasons, ...denyReasonsWhenGrantBlockedByCaps(rawAmountMinor, capped)],
      meta: { ...metaBase, resolvedEarnAction: resolved }
    };
  }

  return {
    allowGrant: true,
    amountMinor: capped.amountMinor,
    rawAmountMinor,
    cappedBy: capped.cappedBy,
    denyReasons: [],
    meta: { ...metaBase, resolvedEarnAction: resolved }
  };
}

export { evaluateRedemptionEligibility } from "./redemption-eligibility";
