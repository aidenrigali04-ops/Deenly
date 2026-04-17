import type { ValidationIssue, ValidationResult } from "../types";
import type { RewardsRulesConfig } from "./config";
import { EARN_ACTION_KEYS } from "./types";

const EARN_SET = new Set<string>(EARN_ACTION_KEYS as readonly string[]);

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

export function validateRewardsRulesConfig(c: RewardsRulesConfig): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!c.rewardsBase?.currencyCode) {
    issues.push(issue("rewardsBase", "rewardsBase.currencyCode is required."));
  }

  for (const key of EARN_ACTION_KEYS) {
    const v = c.earn.actionPointsMinor[key];
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) {
      issues.push(issue(`earn.actionPointsMinor.${key}`, "Must be finite and >= 0."));
    }
  }
  for (const key of Object.keys(c.earn.actionPointsMinor)) {
    if (!EARN_SET.has(key)) {
      issues.push(issue(`earn.actionPointsMinor.${key}`, `Unknown action key; must be one of ${EARN_ACTION_KEYS.join(", ")}.`));
    }
  }

  for (const req of c.earn.requireQualifiedDepth) {
    if (!EARN_SET.has(req)) {
      issues.push(issue("earn.requireQualifiedDepth", `Invalid action "${req}".`));
    }
  }

  const q = c.earn.minQualityForEngagementEarn;
  if (!Number.isFinite(q) || q < 0 || q > 1) {
    issues.push(issue("earn.minQualityForEngagementEarn", "Must be between 0 and 1."));
  }

  const dwell = c.earn.minDwellSecondsForReaction;
  if (!Number.isFinite(dwell) || dwell < 0 || dwell > 3600) {
    issues.push(issue("earn.minDwellSecondsForReaction", "Must be between 0 and 3600."));
  }

  const { caps } = c;
  if (!Number.isFinite(caps.maxEarnPerUserPerDayMinor) || caps.maxEarnPerUserPerDayMinor < 1) {
    issues.push(issue("caps.maxEarnPerUserPerDayMinor", "Must be >= 1."));
  }
  if (!Number.isFinite(caps.maxEarnPerUserPerMonthMinor) || caps.maxEarnPerUserPerMonthMinor < 1) {
    issues.push(issue("caps.maxEarnPerUserPerMonthMinor", "Must be >= 1."));
  }
  if (caps.maxEarnPerUserPerMonthMinor < caps.maxEarnPerUserPerDayMinor) {
    issues.push(issue("caps", "monthly cap must be >= daily cap."));
  }
  if (!Number.isFinite(caps.maxSingleGrantMinor) || caps.maxSingleGrantMinor < 1) {
    issues.push(issue("caps.maxSingleGrantMinor", "Must be >= 1."));
  }
  if (caps.minGrantMinor > caps.maxSingleGrantMinor) {
    issues.push(issue("caps", "minGrantMinor must be <= maxSingleGrantMinor."));
  }

  const af = c.antiFarming;
  if (!Number.isInteger(af.maxGrantsPerRollingHour) || af.maxGrantsPerRollingHour < 1) {
    issues.push(issue("antiFarming.maxGrantsPerRollingHour", "Must be integer >= 1."));
  }
  const burst = af.maxGrantsPerRollingFiveMinutes;
  if (burst !== undefined) {
    if (!Number.isInteger(burst) || burst < 1) {
      issues.push(issue("antiFarming.maxGrantsPerRollingFiveMinutes", "When set, must be an integer >= 1."));
    } else if (burst > af.maxGrantsPerRollingHour) {
      issues.push(
        issue(
          "antiFarming.maxGrantsPerRollingFiveMinutes",
          "Must be <= antiFarming.maxGrantsPerRollingHour."
        )
      );
    }
  }
  if (!Number.isInteger(af.minAccountAgeDaysForEngagementEarn) || af.minAccountAgeDaysForEngagementEarn < 0) {
    issues.push(issue("antiFarming.minAccountAgeDaysForEngagementEarn", "Must be an integer >= 0."));
  }
  const sameTargetDaily = af.maxEarnsSameTargetPerCalendarDay;
  if (sameTargetDaily !== undefined && (!Number.isInteger(sameTargetDaily) || sameTargetDaily < 1)) {
    issues.push(
      issue("antiFarming.maxEarnsSameTargetPerCalendarDay", "When set, must be an integer >= 1.")
    );
  }
  if (!Number.isFinite(af.minSecondsBetweenGrantsSameTarget) || af.minSecondsBetweenGrantsSameTarget < 0) {
    issues.push(issue("antiFarming.minSecondsBetweenGrantsSameTarget", "Must be >= 0."));
  }

  const r = c.redemption;
  if (!Number.isFinite(r.minBalanceMinor) || r.minBalanceMinor < 0) {
    issues.push(issue("redemption.minBalanceMinor", "Must be >= 0."));
  }
  if (!Number.isFinite(r.maxPointsPerRedemptionMinor) || r.maxPointsPerRedemptionMinor < 1) {
    issues.push(issue("redemption.maxPointsPerRedemptionMinor", "Must be >= 1."));
  }
  if (!Number.isFinite(r.cooldownHoursBetweenRedemptions) || r.cooldownHoursBetweenRedemptions < 0) {
    issues.push(issue("redemption.cooldownHoursBetweenRedemptions", "Must be >= 0."));
  }
  if (!Number.isFinite(r.minOrderAmountRemainingMinor) || r.minOrderAmountRemainingMinor < 0) {
    issues.push(issue("redemption.minOrderAmountRemainingMinor", "Must be >= 0."));
  }
  if (!Number.isInteger(r.maxCheckoutDiscountBps) || r.maxCheckoutDiscountBps < 0 || r.maxCheckoutDiscountBps > 10_000) {
    issues.push(issue("redemption.maxCheckoutDiscountBps", "Must be an integer from 0 to 10000."));
  }
  if (!Number.isInteger(r.pointsPerFiatMinorUnit) || r.pointsPerFiatMinorUnit < 1) {
    issues.push(issue("redemption.pointsPerFiatMinorUnit", "Must be integer >= 1."));
  }

  const rv = c.reversal;
  if (!Number.isFinite(rv.fullRefundClawbackRatio) || rv.fullRefundClawbackRatio < 0 || rv.fullRefundClawbackRatio > 1) {
    issues.push(issue("reversal.fullRefundClawbackRatio", "Must be between 0 and 1."));
  }
  if (!Number.isFinite(rv.chargebackClawbackRatio) || rv.chargebackClawbackRatio < 0 || rv.chargebackClawbackRatio > 1) {
    issues.push(issue("reversal.chargebackClawbackRatio", "Must be between 0 and 1."));
  }
  if (!Number.isFinite(rv.partialRefundClawbackRatio) || rv.partialRefundClawbackRatio < 0 || rv.partialRefundClawbackRatio > 1) {
    issues.push(issue("reversal.partialRefundClawbackRatio", "Must be between 0 and 1."));
  }
  if (!Number.isInteger(rv.maxReversalAgeDays) || rv.maxReversalAgeDays < 1) {
    issues.push(issue("reversal.maxReversalAgeDays", "Must be integer >= 1."));
  }

  return issues.length ? { ok: false, issues } : { ok: true };
}
