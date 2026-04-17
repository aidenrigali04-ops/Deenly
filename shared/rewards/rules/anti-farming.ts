import type { RewardsRulesAntiFarmingConfig } from "./config";
import type { AntiFarmingSignals, EarnActionKey, EngagementFacts, RuleDenyReasonCode } from "./types";

export interface AntiFarmingResult {
  readonly ok: boolean;
  readonly denyReasons: readonly RuleDenyReasonCode[];
}

const ENGAGEMENT_EARN_ACTIONS: ReadonlySet<EarnActionKey> = new Set(["qualified_comment", "qualified_reaction"]);

function hasEarnTarget(facts: EngagementFacts): boolean {
  return facts.targetPostId != null || facts.targetUserId != null;
}

export function evaluateAntiFarming(
  facts: EngagementFacts,
  signals: AntiFarmingSignals,
  cfg: RewardsRulesAntiFarmingConfig
): AntiFarmingResult {
  const deny: RuleDenyReasonCode[] = [];

  const count = signals.grantsLastHourCount;
  if (typeof count === "number" && Number.isFinite(count) && count >= cfg.maxGrantsPerRollingHour) {
    deny.push("anti_farming_velocity");
  }

  const burstLimit = cfg.maxGrantsPerRollingFiveMinutes;
  if (typeof burstLimit === "number" && Number.isInteger(burstLimit) && burstLimit >= 1) {
    const burstCount = signals.grantsLastFiveMinutesCount;
    if (typeof burstCount === "number" && Number.isFinite(burstCount) && burstCount >= burstLimit) {
      deny.push("anti_farming_burst_velocity");
    }
  }

  const gap = signals.secondsSinceLastEarnSameTarget;
  if (
    typeof gap === "number" &&
    Number.isFinite(gap) &&
    gap < cfg.minSecondsBetweenGrantsSameTarget &&
    hasEarnTarget(facts)
  ) {
    deny.push("anti_farming_same_target_cooldown");
  }

  const minAge = cfg.minAccountAgeDaysForEngagementEarn;
  if (minAge > 0 && ENGAGEMENT_EARN_ACTIONS.has(facts.actionKey as EarnActionKey)) {
    const age = signals.accountAgeDays;
    if (typeof age !== "number" || !Number.isFinite(age) || age < minAge) {
      deny.push("account_too_new_for_engagement_earn");
    }
  }

  const perDay = cfg.maxEarnsSameTargetPerCalendarDay;
  if (typeof perDay === "number" && Number.isInteger(perDay) && perDay >= 1 && hasEarnTarget(facts)) {
    const n = signals.sameTargetEarnCountToday;
    if (typeof n === "number" && Number.isFinite(n) && n >= perDay) {
      deny.push("anti_farming_same_target_daily_cap");
    }
  }

  return deny.length ? { ok: false, denyReasons: deny } : { ok: true, denyReasons: [] };
}
