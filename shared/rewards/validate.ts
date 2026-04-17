import type {
  BoostsCampaignDomainConfig,
  BoostsDomainConfig,
  DeenlyRewardsPlatformConfig,
  FeedRankingModifierCapsConfig,
  RankingModifiersDomainConfig,
  ReferralsDomainConfig,
  RewardsDomainConfig,
  RewardsGrowthDomainBundle,
  TrustSignalsDomainConfig,
  ValidationIssue,
  ValidationResult
} from "./types";

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function isFiniteNonNegative(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

/** Runtime validation (no Zod — repo has no schema runtime lib on clients). */
export function validateRewardsDomainConfig(c: RewardsDomainConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!c.currencyCode || c.currencyCode.length < 3 || c.currencyCode.length > 32) {
    issues.push(issue("rewards.currencyCode", "Must be 3–32 chars."));
  }
  if (![0, 2, 3].includes(c.pointsDecimals)) {
    issues.push(issue("rewards.pointsDecimals", "Must be 0, 2, or 3."));
  }
  if (!isFinitePositive(c.maxEarnPerUserPerDayMinor)) {
    issues.push(issue("rewards.maxEarnPerUserPerDayMinor", "Must be a finite positive number."));
  }
  if (!isFinitePositive(c.maxEarnPerUserPerMonthMinor)) {
    issues.push(issue("rewards.maxEarnPerUserPerMonthMinor", "Must be a finite positive number."));
  }
  if (c.maxEarnPerUserPerMonthMinor < c.maxEarnPerUserPerDayMinor) {
    issues.push(issue("rewards", "maxEarnPerUserPerMonthMinor must be >= maxEarnPerUserPerDayMinor."));
  }
  if (!isFinitePositive(c.minGrantMinor)) {
    issues.push(issue("rewards.minGrantMinor", "Must be a finite positive number."));
  }
  if (!isFinitePositive(c.maxSingleGrantMinor)) {
    issues.push(issue("rewards.maxSingleGrantMinor", "Must be a finite positive number."));
  }
  if (c.minGrantMinor > c.maxSingleGrantMinor) {
    issues.push(issue("rewards", "minGrantMinor must be <= maxSingleGrantMinor."));
  }
  if (c.maxSingleGrantMinor > c.maxEarnPerUserPerDayMinor) {
    issues.push(issue("rewards", "maxSingleGrantMinor should not exceed maxEarnPerUserPerDayMinor."));
  }
  if (c.maxSingleGrantMinor > c.maxEarnPerUserPerMonthMinor) {
    issues.push(issue("rewards", "maxSingleGrantMinor should not exceed maxEarnPerUserPerMonthMinor."));
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

export function validateReferralsDomainConfig(c: ReferralsDomainConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!Number.isInteger(c.attributionWindowDays) || c.attributionWindowDays < 1 || c.attributionWindowDays > 365) {
    issues.push(issue("referrals.attributionWindowDays", "Must be integer 1–365."));
  }
  if (!Number.isInteger(c.maxReferrerRewardsPerDay) || c.maxReferrerRewardsPerDay < 0) {
    issues.push(issue("referrals.maxReferrerRewardsPerDay", "Must be non-negative integer."));
  }
  if (!Number.isInteger(c.defaultCodeMaxRedemptions) || c.defaultCodeMaxRedemptions < 1) {
    issues.push(issue("referrals.defaultCodeMaxRedemptions", "Must be integer >= 1."));
  }
  if (!Number.isInteger(c.cooldownHoursBetweenSelfChecks) || c.cooldownHoursBetweenSelfChecks < 0) {
    issues.push(issue("referrals.cooldownHoursBetweenSelfChecks", "Must be non-negative integer."));
  }
  if (!Number.isInteger(c.referrerRewardPointsMinor) || c.referrerRewardPointsMinor < 0) {
    issues.push(issue("referrals.referrerRewardPointsMinor", "Must be non-negative integer."));
  }
  if (!Number.isInteger(c.refereeRewardPointsMinor) || c.refereeRewardPointsMinor < 0) {
    issues.push(issue("referrals.refereeRewardPointsMinor", "Must be non-negative integer."));
  }
  if (!Number.isInteger(c.minQualifyingOrderAmountMinor) || c.minQualifyingOrderAmountMinor < 0) {
    issues.push(issue("referrals.minQualifyingOrderAmountMinor", "Must be non-negative integer."));
  }
  if (!Array.isArray(c.qualifyingOrderKinds) || c.qualifyingOrderKinds.length === 0) {
    issues.push(issue("referrals.qualifyingOrderKinds", "Must be a non-empty string array."));
  } else {
    for (const k of c.qualifyingOrderKinds) {
      if (typeof k !== "string" || !k.trim() || k.length > 32) {
        issues.push(issue("referrals.qualifyingOrderKinds", "Each kind must be a non-empty string (max 32)."));
        break;
      }
    }
  }
  if (!Number.isInteger(c.holdClearHoursAfterOrder) || c.holdClearHoursAfterOrder < 0) {
    issues.push(issue("referrals.holdClearHoursAfterOrder", "Must be non-negative integer."));
  }
  if (typeof c.allowBuyerIsSellerForQualification !== "boolean") {
    issues.push(issue("referrals.allowBuyerIsSellerForQualification", "Must be boolean."));
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

export function validateBoostsDomainConfig(c: BoostsDomainConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!c.tierWeights?.length) {
    issues.push(issue("boosts.tierWeights", "At least one tier weight is required."));
  }
  const keys = new Set<string>();
  for (const row of c.tierWeights) {
    if (keys.has(row.tierKey)) {
      issues.push(issue(`boosts.tierWeights.${row.tierKey}`, "Duplicate tierKey."));
    }
    keys.add(row.tierKey);
    if (!isFiniteNonNegative(row.weight)) {
      issues.push(issue(`boosts.tierWeights.${row.tierKey}.weight`, "Must be finite and >= 0."));
    }
  }
  if (!isFinitePositive(c.maxCombinedWeight)) {
    issues.push(issue("boosts.maxCombinedWeight", "Must be finite and > 0."));
  }
  const maxTierWeight = Math.max(...c.tierWeights.map((r) => r.weight), 0);
  if (maxTierWeight > c.maxCombinedWeight + 1e-9) {
    issues.push(issue("boosts", "Each tier weight must be <= maxCombinedWeight (single active tier)."));
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

export function validateRankingModifiersDomainConfig(c: RankingModifiersDomainConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  const keys = new Set<string>();
  for (const row of c.entries) {
    if (keys.has(row.key)) {
      issues.push(issue(`rankingModifiers.entries.${row.key}`, "Duplicate key."));
    }
    keys.add(row.key);
    if (!Number.isFinite(row.boostCap) || row.boostCap < 0 || row.boostCap > 1) {
      issues.push(issue(`rankingModifiers.entries.${row.key}.boostCap`, "Must be between 0 and 1 inclusive."));
    }
    if (!row.description?.trim()) {
      issues.push(issue(`rankingModifiers.entries.${row.key}.description`, "Description is required."));
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

export function validateRewardsGrowthBundle(bundle: RewardsGrowthDomainBundle): ValidationResult {
  const parts: ValidationResult[] = [
    validateRewardsDomainConfig(bundle.rewards),
    validateReferralsDomainConfig(bundle.referrals),
    validateBoostsDomainConfig(bundle.boosts),
    validateRankingModifiersDomainConfig(bundle.rankingModifiers)
  ];
  const issues: ValidationIssue[] = [];
  for (const p of parts) {
    if (!p.ok) {
      issues.push(...p.issues);
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

export function validateTrustSignalsDomainConfig(c: TrustSignalsDomainConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (typeof c.trustSignalsEnabled !== "boolean") {
    issues.push(issue("trustSignals.trustSignalsEnabled", "Must be boolean."));
  }
  for (const key of [
    "rewardsEarnFlagPointsMinor",
    "rewardsSpendFlagPointsMinor",
    "refundRapidFlagWithinHours",
    "boostBudgetFlagMinor"
  ] as const) {
    const v = c[key];
    if (!Number.isInteger(v) || v < 0) {
      issues.push(issue(`trustSignals.${key}`, "Must be a non-negative integer."));
    }
  }
  if (c.refundRapidFlagWithinHours < 1) {
    issues.push(issue("trustSignals.refundRapidFlagWithinHours", "Must be >= 1 when signals are used."));
  }
  if (!Array.isArray(c.rankingReportCategoriesForFlag) || c.rankingReportCategoriesForFlag.length === 0) {
    issues.push(issue("trustSignals.rankingReportCategoriesForFlag", "Must be a non-empty string array."));
  } else {
    for (const cat of c.rankingReportCategoriesForFlag) {
      if (typeof cat !== "string" || !cat.trim() || cat.length > 64) {
        issues.push(issue("trustSignals.rankingReportCategoriesForFlag", "Each category must be a non-empty string (max 64)."));
        break;
      }
    }
  }
  for (const k of [
    "referralFlagSameEmailDomain",
    "referralFlagDisposableRefereeEmail",
    "referralFlagSharedSignupIp",
    "referralBlockDisposableEmail"
  ] as const) {
    if (typeof c[k] !== "boolean") {
      issues.push(issue(`trustSignals.${k}`, "Must be boolean."));
    }
  }
  if (!Array.isArray(c.disposableEmailDomains)) {
    issues.push(issue("trustSignals.disposableEmailDomains", "Must be an array of domain strings."));
  } else if (c.disposableEmailDomains.length === 0) {
    issues.push(issue("trustSignals.disposableEmailDomains", "Must contain at least one domain pattern."));
  } else {
    for (const d of c.disposableEmailDomains) {
      if (typeof d !== "string" || !d.trim() || d.length > 128) {
        issues.push(issue("trustSignals.disposableEmailDomains", "Each entry must be a non-empty string (max 128)."));
        break;
      }
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

export function validateBoostsCampaignDomainConfig(c: BoostsCampaignDomainConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(c.suggestedPackageDurationDays) || c.suggestedPackageDurationDays.length === 0) {
    issues.push(issue("boostCampaigns.suggestedPackageDurationDays", "Must be a non-empty number array."));
  } else {
    for (const d of c.suggestedPackageDurationDays) {
      if (!Number.isInteger(d) || d < 1 || d > 365) {
        issues.push(issue("boostCampaigns.suggestedPackageDurationDays", "Each duration must be integer 1–365."));
        break;
      }
    }
  }
  if (!Number.isInteger(c.minCampaignDurationDays) || c.minCampaignDurationDays < 1) {
    issues.push(issue("boostCampaigns.minCampaignDurationDays", "Must be integer >= 1."));
  }
  if (!Number.isInteger(c.maxCampaignDurationDays) || c.maxCampaignDurationDays < 1) {
    issues.push(issue("boostCampaigns.maxCampaignDurationDays", "Must be integer >= 1."));
  }
  if (c.maxCampaignDurationDays < c.minCampaignDurationDays) {
    issues.push(issue("boostCampaigns", "maxCampaignDurationDays must be >= minCampaignDurationDays."));
  }
  if (!Number.isInteger(c.defaultDraftDurationDays) || c.defaultDraftDurationDays < 1) {
    issues.push(issue("boostCampaigns.defaultDraftDurationDays", "Must be integer >= 1."));
  }
  if (c.defaultDraftDurationDays < c.minCampaignDurationDays || c.defaultDraftDurationDays > c.maxCampaignDurationDays) {
    issues.push(issue("boostCampaigns.defaultDraftDurationDays", "Must fall within min/max campaign duration."));
  }
  if (!Number.isInteger(c.dailyCapImpressionsMin) || c.dailyCapImpressionsMin < 1) {
    issues.push(issue("boostCampaigns.dailyCapImpressionsMin", "Must be integer >= 1."));
  }
  if (!Number.isInteger(c.dailyCapImpressionsMax) || c.dailyCapImpressionsMax < 1) {
    issues.push(issue("boostCampaigns.dailyCapImpressionsMax", "Must be integer >= 1."));
  }
  if (c.dailyCapImpressionsMax < c.dailyCapImpressionsMin) {
    issues.push(issue("boostCampaigns", "dailyCapImpressionsMax must be >= dailyCapImpressionsMin."));
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

export function validateFeedRankingModifierCapsConfig(c: FeedRankingModifierCapsConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  const nonNegKeys: (keyof FeedRankingModifierCapsConfig)[] = [
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
    "weightSellerOpenReports"
  ];
  for (const k of nonNegKeys) {
    const v = c[k];
    if (!Number.isFinite(v) || v < 0) {
      issues.push(issue(`feedRankingModifierCaps.${String(k)}`, "Must be finite and >= 0."));
    }
  }
  const frac = c.boostMaxFractionOfCombined;
  if (!Number.isFinite(frac) || frac <= 0 || frac > 1) {
    issues.push(issue("feedRankingModifierCaps.boostMaxFractionOfCombined", "Must be in (0, 1]."));
  }
  const combined = c.combinedPositiveCap;
  const capBoost = c.capBoostTierAdditive;
  if (Number.isFinite(combined) && combined > 0 && Number.isFinite(capBoost) && Number.isFinite(frac)) {
    if (capBoost > combined * frac + 1e-9) {
      issues.push(
        issue(
          "feedRankingModifierCaps",
          "capBoostTierAdditive must not exceed combinedPositiveCap * boostMaxFractionOfCombined (non-pay-to-win)."
        )
      );
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}

export function validateDeenlyRewardsPlatformConfig(c: DeenlyRewardsPlatformConfig): ValidationResult {
  const parts: ValidationResult[] = [
    validateRewardsGrowthBundle(c.growth),
    validateTrustSignalsDomainConfig(c.trustSignals),
    validateBoostsCampaignDomainConfig(c.boostCampaigns),
    validateFeedRankingModifierCapsConfig(c.feedRankingModifierCaps)
  ];
  const issues: ValidationIssue[] = [];
  for (const p of parts) {
    if (!p.ok) {
      issues.push(...p.issues);
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true };
}
