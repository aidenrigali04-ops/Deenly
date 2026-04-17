import {
  DEFAULT_REWARDS_RULES_CONFIG,
  REWARDS_RULES_ENGINE_VERSION,
  applyEarnCaps,
  computeRawEarnAmount,
  denyReasonsWhenGrantBlockedByCaps,
  earnActionToRewardEarnReasonKey,
  evaluateAntiFarming,
  evaluateEarnEligibility,
  evaluateEarnPipeline,
  evaluateRedemptionEligibility,
  isEarnActionKey,
  isNonEarningSurfaceKey,
  listEarnActionKeys,
  mergeRewardsRulesConfig,
  pickRefundClawbackRatio,
  planCheckoutProductRedemption,
  planReversalsForRefund,
  validateRewardsRulesConfig
} from "@/lib/rewards";

const baseFacts = {
  actorUserId: 1,
  occurredAtIso: "2026-01-15T12:00:00.000Z",
  targetPostId: 99,
  targetUserId: 2
};

describe("rewards rules config", () => {
  it("validates default rules bundle", () => {
    expect(validateRewardsRulesConfig(DEFAULT_REWARDS_RULES_CONFIG)).toEqual({ ok: true });
  });

  it("merges beta overrides", () => {
    const merged = mergeRewardsRulesConfig(DEFAULT_REWARDS_RULES_CONFIG, {
      caps: { maxEarnPerUserPerDayMinor: 100 }
    });
    expect(merged.caps.maxEarnPerUserPerDayMinor).toBe(100);
    const v = validateRewardsRulesConfig(merged);
    expect(v.ok).toBe(true);
  });

  it("re-syncs caps when rewardsBase is patched", () => {
    const merged = mergeRewardsRulesConfig(DEFAULT_REWARDS_RULES_CONFIG, {
      rewardsBase: { maxEarnPerUserPerMonthMinor: 12_000 }
    });
    expect(merged.rewardsBase.maxEarnPerUserPerMonthMinor).toBe(12_000);
    expect(merged.caps.maxEarnPerUserPerMonthMinor).toBe(12_000);
    const v = validateRewardsRulesConfig(merged);
    expect(v.ok).toBe(true);
  });

  it("merges partial earn.actionPointsMinor without dropping other actions", () => {
    const merged = mergeRewardsRulesConfig(DEFAULT_REWARDS_RULES_CONFIG, {
      earn: { actionPointsMinor: { signup_complete: 11 } }
    });
    expect(merged.earn.actionPointsMinor.signup_complete).toBe(11);
    expect(merged.earn.actionPointsMinor.first_post_published).toBe(150);
  });

  it("rejects unknown keys in merged actionPointsMinor", () => {
    const merged = mergeRewardsRulesConfig(DEFAULT_REWARDS_RULES_CONFIG, {
      earn: { actionPointsMinor: { not_a_real_action: 5 } as Record<string, number> }
    });
    const v = validateRewardsRulesConfig(merged);
    expect(v.ok).toBe(false);
  });
});

describe("passive / non-earning surfaces", () => {
  it("denies feed_scroll (no infinite passive earn path)", () => {
    expect(isNonEarningSurfaceKey("feed_scroll")).toBe(true);
    expect(isEarnActionKey("feed_scroll")).toBe(false);
    expect(listEarnActionKeys().includes("feed_scroll" as never)).toBe(false);
  });

  it("pipeline denies passive surface when blockPassiveSurfaces is true", () => {
    const facts = { ...baseFacts, actionKey: "feed_scroll", depth: "qualified" as const };
    const r = evaluateEarnPipeline(facts, {}, { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 }, DEFAULT_REWARDS_RULES_CONFIG);
    expect(r.allowGrant).toBe(false);
    expect(r.denyReasons).toContain("non_earning_surface");
    expect(r.meta.engineVersion).toBe(REWARDS_RULES_ENGINE_VERSION);
  });

  it("denies passive surfaceKey even if actionKey were mis-set to an earn action", () => {
    const facts = {
      ...baseFacts,
      surfaceKey: "feed_passive_scroll",
      actionKey: "qualified_reaction",
      depth: "qualified" as const,
      engagementQuality: 0.99,
      dwellTimeSeconds: 60
    };
    const r = evaluateEarnPipeline(facts, {}, { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 }, DEFAULT_REWARDS_RULES_CONFIG);
    expect(r.allowGrant).toBe(false);
    expect(r.denyReasons).toContain("non_earning_surface");
  });
});

describe("earn eligibility", () => {
  it("denies unknown action", () => {
    const facts = { ...baseFacts, actionKey: "totally_unknown" };
    const r = evaluateEarnEligibility(facts, {}, DEFAULT_REWARDS_RULES_CONFIG);
    expect(r.eligible).toBe(false);
    expect(r.denyReasons).toContain("unknown_action");
  });

  it("denies self-target comment", () => {
    const facts = {
      ...baseFacts,
      actionKey: "qualified_comment",
      depth: "qualified" as const,
      engagementQuality: 0.9,
      isSelfTarget: true
    };
    const r = evaluateEarnEligibility(facts, {}, DEFAULT_REWARDS_RULES_CONFIG);
    expect(r.eligible).toBe(false);
    expect(r.denyReasons).toContain("self_target");
  });

  it("denies comment without qualified depth", () => {
    const facts = {
      ...baseFacts,
      actionKey: "qualified_comment",
      depth: "surface" as const,
      engagementQuality: 0.9
    };
    const r = evaluateEarnEligibility(facts, {}, DEFAULT_REWARDS_RULES_CONFIG);
    expect(r.eligible).toBe(false);
    expect(r.denyReasons).toContain("engagement_not_qualified");
  });

  it("denies reaction with insufficient dwell", () => {
    const facts = {
      ...baseFacts,
      actionKey: "qualified_reaction",
      depth: "qualified" as const,
      engagementQuality: 0.8,
      dwellTimeSeconds: 1
    };
    const r = evaluateEarnEligibility(facts, {}, DEFAULT_REWARDS_RULES_CONFIG);
    expect(r.eligible).toBe(false);
    expect(r.denyReasons).toContain("dwell_below_threshold");
  });

  it("denies reaction with low quality", () => {
    const facts = {
      ...baseFacts,
      actionKey: "qualified_reaction",
      depth: "qualified" as const,
      engagementQuality: 0.1,
      dwellTimeSeconds: 10
    };
    const r = evaluateEarnEligibility(facts, {}, DEFAULT_REWARDS_RULES_CONFIG);
    expect(r.eligible).toBe(false);
    expect(r.denyReasons).toContain("quality_below_threshold");
  });

  it("allows qualified reaction when gates pass", () => {
    const facts = {
      ...baseFacts,
      actionKey: "qualified_reaction",
      depth: "qualified" as const,
      engagementQuality: 0.8,
      dwellTimeSeconds: 10
    };
    const r = evaluateEarnEligibility(facts, { grantsLastHourCount: 0 }, DEFAULT_REWARDS_RULES_CONFIG);
    expect(r.eligible).toBe(true);
  });

  it("eligibility false when daily cap leaves no room after raw compute", () => {
    const facts = {
      ...baseFacts,
      actionKey: "signup_complete"
    };
    const r = evaluateEarnEligibility(
      facts,
      {},
      DEFAULT_REWARDS_RULES_CONFIG,
      { dailyEarnedMinor: DEFAULT_REWARDS_RULES_CONFIG.caps.maxEarnPerUserPerDayMinor, monthlyEarnedMinor: 0 }
    );
    expect(r.eligible).toBe(false);
    expect(r.denyReasons).toContain("daily_cap_exhausted");
  });
});

describe("caps", () => {
  it("applies daily cap", () => {
    const r = applyEarnCaps(
      500,
      { dailyEarnedMinor: 4800, monthlyEarnedMinor: 0 },
      DEFAULT_REWARDS_RULES_CONFIG.caps
    );
    expect(r.amountMinor).toBe(200);
    expect(r.cappedBy).toBe("daily");
  });

  it("applies monthly cap when tighter than daily room", () => {
    const r = applyEarnCaps(
      5000,
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 49_900 },
      DEFAULT_REWARDS_RULES_CONFIG.caps
    );
    expect(r.amountMinor).toBe(100);
    expect(r.cappedBy).toBe("monthly");
  });

  it("records last-binding cap when single-grant then monthly both shrink", () => {
    const r = applyEarnCaps(
      5000,
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 49_950 },
      DEFAULT_REWARDS_RULES_CONFIG.caps
    );
    expect(r.amountMinor).toBe(50);
    expect(r.cappedBy).toBe("monthly");
  });

  it("pipeline reports daily cap exhausted when raw > 0 but no daily room", () => {
    const facts = {
      ...baseFacts,
      actionKey: "qualified_reaction",
      depth: "qualified" as const,
      engagementQuality: 0.99,
      dwellTimeSeconds: 10
    };
    const r = evaluateEarnPipeline(
      facts,
      {},
      { dailyEarnedMinor: 5000, monthlyEarnedMinor: 0 },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(r.allowGrant).toBe(false);
    expect(r.denyReasons).toContain("daily_cap_exhausted");
  });

  it("pipeline reports monthly cap exhausted when monthly headroom is zero", () => {
    const facts = {
      ...baseFacts,
      actionKey: "signup_complete"
    };
    const monthlyCap = DEFAULT_REWARDS_RULES_CONFIG.caps.maxEarnPerUserPerMonthMinor;
    const r = evaluateEarnPipeline(
      facts,
      {},
      { dailyEarnedMinor: 0, monthlyEarnedMinor: monthlyCap },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(r.allowGrant).toBe(false);
    expect(r.denyReasons).toContain("monthly_cap_exhausted");
  });

  it("denyReasonsWhenGrantBlockedByCaps maps cappedBy to codes", () => {
    expect(denyReasonsWhenGrantBlockedByCaps(100, { amountMinor: 0, cappedBy: "daily" })).toEqual([
      "daily_cap_exhausted"
    ]);
    expect(denyReasonsWhenGrantBlockedByCaps(50, { amountMinor: 0, cappedBy: "monthly" })).toEqual([
      "monthly_cap_exhausted"
    ]);
    expect(denyReasonsWhenGrantBlockedByCaps(0, { amountMinor: 0, cappedBy: "none" })).toEqual([
      "below_min_grant_after_caps"
    ]);
  });
});

describe("anti-farming", () => {
  it("uses snapshot grantsLastHourCount when signals omit it (eligibility)", () => {
    const facts = { ...baseFacts, actionKey: "signup_complete" };
    const snap = {
      dailyEarnedMinor: 0,
      monthlyEarnedMinor: 0,
      grantsLastHourCount: DEFAULT_REWARDS_RULES_CONFIG.antiFarming.maxGrantsPerRollingHour
    };
    const r = evaluateEarnEligibility(facts, {}, DEFAULT_REWARDS_RULES_CONFIG, snap);
    expect(r.eligible).toBe(false);
    expect(r.denyReasons).toContain("anti_farming_velocity");
  });

  it("denies high velocity", () => {
    const facts = { ...baseFacts, actionKey: "signup_complete" };
    const r = evaluateAntiFarming(
      facts,
      { grantsLastHourCount: DEFAULT_REWARDS_RULES_CONFIG.antiFarming.maxGrantsPerRollingHour },
      DEFAULT_REWARDS_RULES_CONFIG.antiFarming
    );
    expect(r.ok).toBe(false);
    expect(r.denyReasons).toContain("anti_farming_velocity");
  });

  it("denies same-target cooldown when gap too small", () => {
    const facts = { ...baseFacts, actionKey: "qualified_comment", depth: "qualified" as const, engagementQuality: 0.9 };
    const r = evaluateAntiFarming(
      facts,
      { secondsSinceLastEarnSameTarget: 10 },
      DEFAULT_REWARDS_RULES_CONFIG.antiFarming
    );
    expect(r.ok).toBe(false);
    expect(r.denyReasons).toContain("anti_farming_same_target_cooldown");
  });
});

describe("redemption", () => {
  const snap = { balanceMinor: 600, lastRedemptionAtIso: null as string | null };

  it("denies below min balance", () => {
    const r = evaluateRedemptionEligibility(
      { pointsMinor: 100, requestedAtIso: "2026-01-15T12:00:00.000Z" },
      { balanceMinor: 400, lastRedemptionAtIso: null },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(r.allow).toBe(false);
    expect(r.denyReasons).toContain("below_min_balance");
  });

  it("denies above max per redemption", () => {
    const r = evaluateRedemptionEligibility(
      { pointsMinor: 20_000, requestedAtIso: "2026-01-15T12:00:00.000Z" },
      snap,
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(r.allow).toBe(false);
    expect(r.denyReasons).toContain("above_max_per_redemption");
  });

  it("denies insufficient balance", () => {
    const r = evaluateRedemptionEligibility(
      { pointsMinor: 650, requestedAtIso: "2026-01-15T12:00:00.000Z" },
      snap,
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(r.allow).toBe(false);
    expect(r.denyReasons).toContain("insufficient_balance");
  });

  it("denies during cooldown", () => {
    const r = evaluateRedemptionEligibility(
      { pointsMinor: 100, requestedAtIso: "2026-01-15T14:00:00.000Z" },
      {
        balanceMinor: 2000,
        lastRedemptionAtIso: "2026-01-15T12:30:00.000Z"
      },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(r.allow).toBe(false);
    expect(r.denyReasons).toContain("cooldown_active");
  });

  it("allows valid redemption", () => {
    const r = evaluateRedemptionEligibility(
      { pointsMinor: 100, requestedAtIso: "2026-01-20T12:00:00.000Z" },
      { balanceMinor: 2000, lastRedemptionAtIso: "2026-01-10T12:00:00.000Z" },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(r.allow).toBe(true);
  });
});

describe("reversal helpers", () => {
  it("pickRefundClawbackRatio matches refund shape", () => {
    const cfg = DEFAULT_REWARDS_RULES_CONFIG.reversal;
    expect(pickRefundClawbackRatio({ isChargeback: true, isFullRefund: false }, cfg)).toBe(cfg.chargebackClawbackRatio);
    expect(pickRefundClawbackRatio({ isChargeback: false, isFullRefund: true }, cfg)).toBe(cfg.fullRefundClawbackRatio);
    expect(pickRefundClawbackRatio({ isChargeback: false, isFullRefund: false }, cfg)).toBe(cfg.partialRefundClawbackRatio);
  });
});

describe("reversal", () => {
  it("denies stale reversal", () => {
    const plan = planReversalsForRefund(
      {
        occurredAtIso: "2026-06-01T00:00:00.000Z",
        originalGrantAtIso: "2025-01-01T00:00:00.000Z",
        originalGrantMinor: 100,
        alreadyReversedMinor: 0,
        redeemedSinceGrantMinor: 0,
        isFullRefund: true,
        isChargeback: false
      },
      DEFAULT_REWARDS_RULES_CONFIG.reversal
    );
    expect(plan.lines.length).toBe(0);
    expect(plan.deniedReason).toBe("beyond_max_age");
  });

  it("plans partial refund clawback", () => {
    const plan = planReversalsForRefund(
      {
        occurredAtIso: "2026-01-10T00:00:00.000Z",
        originalGrantAtIso: "2026-01-09T00:00:00.000Z",
        originalGrantMinor: 100,
        alreadyReversedMinor: 0,
        redeemedSinceGrantMinor: 0,
        isFullRefund: false,
        isChargeback: false
      },
      DEFAULT_REWARDS_RULES_CONFIG.reversal
    );
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].amountMinor).toBe(50);
  });

  it("returns nothing when already fully reversed", () => {
    const plan = planReversalsForRefund(
      {
        occurredAtIso: "2026-01-10T00:00:00.000Z",
        originalGrantAtIso: "2026-01-09T00:00:00.000Z",
        originalGrantMinor: 100,
        alreadyReversedMinor: 100,
        redeemedSinceGrantMinor: 0,
        isFullRefund: true,
        isChargeback: false
      },
      DEFAULT_REWARDS_RULES_CONFIG.reversal
    );
    expect(plan.deniedReason).toBe("nothing_to_claw_back");
  });

  it("caps clawback when redeemedSinceGrant consumes remaining headroom", () => {
    const plan = planReversalsForRefund(
      {
        occurredAtIso: "2026-01-10T00:00:00.000Z",
        originalGrantAtIso: "2026-01-09T00:00:00.000Z",
        originalGrantMinor: 100,
        alreadyReversedMinor: 0,
        redeemedSinceGrantMinor: 100,
        isFullRefund: true,
        isChargeback: false
      },
      DEFAULT_REWARDS_RULES_CONFIG.reversal
    );
    expect(plan.lines.length).toBe(0);
    expect(plan.deniedReason).toBe("would_exceed_original_grant");
  });

  it("reduces clawback when partial redeem headroom remains", () => {
    const plan = planReversalsForRefund(
      {
        occurredAtIso: "2026-01-10T00:00:00.000Z",
        originalGrantAtIso: "2026-01-09T00:00:00.000Z",
        originalGrantMinor: 100,
        alreadyReversedMinor: 0,
        redeemedSinceGrantMinor: 60,
        isFullRefund: true,
        isChargeback: false
      },
      DEFAULT_REWARDS_RULES_CONFIG.reversal
    );
    expect(plan.lines[0].amountMinor).toBe(40);
  });

  it("uses chargeback ratio for chargebacks", () => {
    const plan = planReversalsForRefund(
      {
        occurredAtIso: "2026-01-10T00:00:00.000Z",
        originalGrantAtIso: "2026-01-09T00:00:00.000Z",
        originalGrantMinor: 80,
        alreadyReversedMinor: 0,
        redeemedSinceGrantMinor: 0,
        isFullRefund: false,
        isChargeback: true
      },
      DEFAULT_REWARDS_RULES_CONFIG.reversal
    );
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].amountMinor).toBe(80);
  });
});

describe("ledger reason mapping", () => {
  it("maps engagement actions to qualified_engagement", () => {
    expect(earnActionToRewardEarnReasonKey("qualified_comment")).toBe("qualified_engagement");
    expect(earnActionToRewardEarnReasonKey("purchase_completed")).toBe("purchase_completed");
  });
});

describe("checkout redemption planner", () => {
  const snap = { balanceMinor: 50_000, lastRedemptionAtIso: null as string | null };
  const baseInput = {
    listPriceMinor: 10_000,
    productRewardsEligible: true,
    redeemEnabled: true,
    snapshot: snap,
    requestedAtIso: "2026-01-15T12:00:00.000Z"
  };

  it("denies ineligible product", () => {
    const plan = planCheckoutProductRedemption(
      { ...baseInput, productRewardsEligible: false },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(plan.allow).toBe(false);
    expect(plan.denyReasons).toContain("product_not_eligible");
  });

  it("returns full list price when redeem disabled", () => {
    const plan = planCheckoutProductRedemption({ ...baseInput, redeemEnabled: false }, DEFAULT_REWARDS_RULES_CONFIG);
    expect(plan.allow).toBe(true);
    expect(plan.pointsToSpend).toBe(0);
    expect(plan.chargedMinor).toBe(10_000);
  });

  it("respects max discount bps and min card remainder", () => {
    const plan = planCheckoutProductRedemption(
      {
        ...baseInput,
        listPriceMinor: 1000,
        requestedPointsMinor: 1_000_000
      },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(plan.allow).toBe(true);
    const maxByBps = Math.floor((1000 * DEFAULT_REWARDS_RULES_CONFIG.redemption.maxCheckoutDiscountBps) / 10_000);
    expect(plan.discountMinor).toBeLessThanOrEqual(maxByBps);
    expect(plan.chargedMinor).toBe(1000 - plan.discountMinor);
    expect(plan.chargedMinor).toBeGreaterThanOrEqual(
      DEFAULT_REWARDS_RULES_CONFIG.redemption.minOrderAmountRemainingMinor
    );
  });
});

describe("computeRawEarnAmount quality curve", () => {
  it("scales engagement earn with quality", () => {
    const base = { ...baseFacts, actionKey: "qualified_reaction", depth: "qualified" as const, dwellTimeSeconds: 10 };
    const low = computeRawEarnAmount(
      "qualified_reaction",
      { ...base, engagementQuality: 0.56 },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    const high = computeRawEarnAmount(
      "qualified_reaction",
      { ...base, engagementQuality: 0.99 },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(high).toBeGreaterThan(low);
  });
});
