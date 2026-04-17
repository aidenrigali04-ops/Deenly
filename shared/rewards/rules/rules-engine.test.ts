import { describe, expect, it } from "vitest";
import { applyEarnCaps } from "./caps";
import { DEFAULT_REWARDS_RULES_CONFIG, mergeRewardsRulesConfig } from "./config";
import { denyReasonsWhenGrantBlockedByCaps, evaluateEarnEligibility, evaluateEarnPipeline } from "./engine";
import { planCheckoutProductRedemption } from "./checkout-redemption";
import { evaluateRedemptionEligibility } from "./redemption-eligibility";
import {
  computeRefundClawbackTargetMinor,
  netClawbackCeilingMinor,
  pickRefundClawbackRatio,
  planReversalsForRefund,
  remainingGrantAfterReversalsMinor
} from "./reversal";
import { mergeAntiFarmingSignals } from "./signals";
import { validateRewardsRulesConfig } from "./validate-rules-config";

const baseFacts = {
  actorUserId: 1,
  occurredAtIso: "2026-01-15T12:00:00.000Z",
  surfaceKey: "post_detail",
  actionKey: "qualified_reaction",
  targetPostId: 99,
  depth: "qualified" as const,
  engagementQuality: 0.9,
  dwellTimeSeconds: 10,
  isSelfTarget: false
};

describe("validateRewardsRulesConfig", () => {
  it("accepts default rules config", () => {
    expect(validateRewardsRulesConfig(DEFAULT_REWARDS_RULES_CONFIG).ok).toBe(true);
  });

  it("rejects burst cap greater than hourly cap", () => {
    const bad = mergeRewardsRulesConfig(DEFAULT_REWARDS_RULES_CONFIG, {
      antiFarming: { maxGrantsPerRollingHour: 10, maxGrantsPerRollingFiveMinutes: 20 }
    });
    const r = validateRewardsRulesConfig(bad);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.issues.some((i) => i.path.includes("maxGrantsPerRollingFiveMinutes"))).toBe(
      true
    );
  });
});

describe("applyEarnCaps", () => {
  const caps = DEFAULT_REWARDS_RULES_CONFIG.caps;

  it("applies daily headroom before monthly", () => {
    const raw = 500;
    const snap = { dailyEarnedMinor: caps.maxEarnPerUserPerDayMinor - 100, monthlyEarnedMinor: 0 };
    const r = applyEarnCaps(raw, snap, caps);
    expect(r.amountMinor).toBe(100);
    expect(r.cappedBy).toBe("daily");
  });

  it("applies monthly headroom when daily has room", () => {
    const raw = 2_000;
    const snap = {
      dailyEarnedMinor: 0,
      monthlyEarnedMinor: caps.maxEarnPerUserPerMonthMinor - 300
    };
    const r = applyEarnCaps(raw, snap, caps);
    expect(r.amountMinor).toBe(300);
    expect(r.cappedBy).toBe("monthly");
  });

  it("zeros sub-minimum grants after caps", () => {
    const tight = { ...caps, minGrantMinor: 50 };
    const r = applyEarnCaps(40, { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 }, tight);
    expect(r.amountMinor).toBe(0);
    expect(r.cappedBy).toBe("min_grant");
  });

  it("respects single-grant ceiling", () => {
    const r = applyEarnCaps(5_000, { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 }, caps);
    expect(r.amountMinor).toBeLessThanOrEqual(caps.maxSingleGrantMinor);
    if (r.amountMinor < 5_000) {
      expect(["single_grant", "daily", "monthly", "min_grant"]).toContain(r.cappedBy);
    }
  });
});

describe("denyReasonsWhenGrantBlockedByCaps", () => {
  it("maps daily exhaustion", () => {
    expect(
      denyReasonsWhenGrantBlockedByCaps(10, { amountMinor: 0, cappedBy: "daily" }).includes("daily_cap_exhausted")
    ).toBe(true);
  });
});

describe("passive surface and infinite-scroll earn prevention", () => {
  it("denies qualified engagement when surface is a passive feed key", () => {
    const d = evaluateEarnPipeline(
      { ...baseFacts, surfaceKey: "feed_scroll" },
      {},
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(d.allowGrant).toBe(false);
    expect(d.denyReasons).toContain("non_earning_surface");
  });

  it("denies when action key is a passive-only signal even if surface is empty", () => {
    const d = evaluateEarnPipeline(
      { ...baseFacts, surfaceKey: undefined, actionKey: "feed_passive_scroll" },
      {},
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(d.allowGrant).toBe(false);
    expect(d.denyReasons[0]).toBe("non_earning_surface");
  });

  it("allows admin_grant on passive surface (ops path)", () => {
    const d = evaluateEarnPipeline(
      {
        ...baseFacts,
        surfaceKey: "feed_scroll",
        actionKey: "admin_grant",
        adminOverrideAmountMinor: 100,
        depth: "surface"
      },
      {},
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(d.allowGrant).toBe(true);
    expect(d.amountMinor).toBe(100);
  });
});

describe("qualified earn gates", () => {
  it("requires dwell for reactions", () => {
    const d = evaluateEarnPipeline(
      { ...baseFacts, dwellTimeSeconds: 0.5 },
      {},
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(d.allowGrant).toBe(false);
    expect(d.denyReasons).toContain("dwell_below_threshold");
  });

  it("denies self-target reactions", () => {
    const d = evaluateEarnPipeline(
      { ...baseFacts, isSelfTarget: true },
      {},
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(d.allowGrant).toBe(false);
    expect(d.denyReasons).toContain("self_target");
  });

  it("allows a healthy engagement path", () => {
    const d = evaluateEarnPipeline(
      baseFacts,
      { grantsLastHourCount: 0, secondsSinceLastEarnSameTarget: 120 },
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(d.allowGrant).toBe(true);
    expect(d.amountMinor).toBeGreaterThan(0);
  });
});

describe("anti-farming extensions", () => {
  const cfg = mergeRewardsRulesConfig(DEFAULT_REWARDS_RULES_CONFIG, {
    antiFarming: {
      maxGrantsPerRollingFiveMinutes: 5,
      minAccountAgeDaysForEngagementEarn: 3,
      maxEarnsSameTargetPerCalendarDay: 3
    }
  });

  it("blocks burst velocity when five-minute count exceeds configured cap", () => {
    const d = evaluateEarnPipeline(
      baseFacts,
      { grantsLastFiveMinutesCount: 5 },
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 0, grantsLastFiveMinutesCount: 5 },
      cfg
    );
    expect(d.allowGrant).toBe(false);
    expect(d.denyReasons).toContain("anti_farming_burst_velocity");
  });

  it("blocks engagement earns for accounts younger than configured days", () => {
    const d = evaluateEarnPipeline(
      baseFacts,
      { accountAgeDays: 2 },
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 },
      cfg
    );
    expect(d.allowGrant).toBe(false);
    expect(d.denyReasons).toContain("account_too_new_for_engagement_earn");
  });

  it("does not apply account-age gate to non-engagement earns", () => {
    const d = evaluateEarnPipeline(
      {
        ...baseFacts,
        actionKey: "signup_complete",
        depth: "surface",
        dwellTimeSeconds: undefined,
        engagementQuality: undefined
      },
      { accountAgeDays: 0 },
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 },
      cfg
    );
    expect(d.allowGrant).toBe(true);
  });

  it("blocks when same-target daily count is at configured cap", () => {
    const d = evaluateEarnPipeline(
      baseFacts,
      { sameTargetEarnCountToday: 3 },
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 0, sameTargetEarnCountToday: 3 },
      cfg
    );
    expect(d.allowGrant).toBe(false);
    expect(d.denyReasons).toContain("anti_farming_same_target_daily_cap");
  });
});

describe("mergeAntiFarmingSignals", () => {
  it("prefers explicit signals but falls back to cap snapshot counters", () => {
    const merged = mergeAntiFarmingSignals(
      { dailyEarnedMinor: 0, monthlyEarnedMinor: 0, grantsLastHourCount: 9, sameTargetEarnCountToday: 2 },
      { grantsLastHourCount: 1 }
    );
    expect(merged.grantsLastHourCount).toBe(1);
    expect(merged.sameTargetEarnCountToday).toBe(2);
  });
});

describe("evaluateEarnEligibility", () => {
  it("matches evaluateEarnPipeline allow flag for a standard earn", () => {
    const snap = { dailyEarnedMinor: 0, monthlyEarnedMinor: 0 };
    const e = evaluateEarnEligibility(baseFacts, { grantsLastHourCount: 0 }, DEFAULT_REWARDS_RULES_CONFIG, snap);
    const p = evaluateEarnPipeline(baseFacts, { grantsLastHourCount: 0 }, snap, DEFAULT_REWARDS_RULES_CONFIG);
    expect(e.eligible).toBe(p.allowGrant);
  });
});

describe("redemption eligibility", () => {
  const snap = { balanceMinor: 5_000, lastRedemptionAtIso: null as string | null };

  it("blocks when rewards are frozen", () => {
    const r = evaluateRedemptionEligibility(
      { pointsMinor: 1_000, requestedAtIso: "2026-01-10T10:00:00.000Z" },
      { ...snap, rewardsFrozen: true },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(r.allow).toBe(false);
    expect(r.denyReasons).toContain("rewards_frozen");
  });

  it("enforces cooldown between redemptions", () => {
    const r = evaluateRedemptionEligibility(
      { pointsMinor: 500, requestedAtIso: "2026-01-02T02:00:00.000Z" },
      { balanceMinor: 5_000, lastRedemptionAtIso: "2026-01-01T12:00:00.000Z" },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(r.allow).toBe(false);
    expect(r.denyReasons).toContain("cooldown_active");
  });

  it("requires min balance before any redemption", () => {
    const r = evaluateRedemptionEligibility(
      { pointsMinor: 500, requestedAtIso: "2026-01-10T10:00:00.000Z" },
      { balanceMinor: 400, lastRedemptionAtIso: null },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(r.allow).toBe(false);
    expect(r.denyReasons).toContain("below_min_balance");
  });

  it("allows a valid redemption request", () => {
    const r = evaluateRedemptionEligibility(
      { pointsMinor: 500, requestedAtIso: "2026-01-10T10:00:00.000Z" },
      snap,
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(r.allow).toBe(true);
  });
});

describe("planCheckoutProductRedemption", () => {
  it("returns rewards_frozen without attempting discount math", () => {
    const plan = planCheckoutProductRedemption(
      {
        listPriceMinor: 1_000,
        productRewardsEligible: true,
        redeemEnabled: true,
        snapshot: { balanceMinor: 50_000, rewardsFrozen: true },
        requestedAtIso: "2026-01-10T10:00:00.000Z"
      },
      DEFAULT_REWARDS_RULES_CONFIG
    );
    expect(plan.allow).toBe(false);
    expect(plan.denyReasons).toContain("rewards_frozen");
    expect(plan.pointsToSpend).toBe(0);
  });
});

describe("reversal helpers", () => {
  const reversal = DEFAULT_REWARDS_RULES_CONFIG.reversal;

  it("computes remaining grant after partial reversals", () => {
    expect(remainingGrantAfterReversalsMinor(1_000, 250)).toBe(750);
  });

  it("computes net clawback ceiling net of redemptions", () => {
    expect(netClawbackCeilingMinor(800, 500)).toBe(300);
  });

  it("aligns computeRefundClawbackTargetMinor with planReversalsForRefund line amount", () => {
    const facts = {
      occurredAtIso: "2026-02-01T00:00:00.000Z",
      originalGrantAtIso: "2026-01-01T00:00:00.000Z",
      originalGrantMinor: 1_000,
      alreadyReversedMinor: 0,
      redeemedSinceGrantMinor: 700,
      isFullRefund: false,
      isChargeback: false
    };
    const target = computeRefundClawbackTargetMinor(facts, reversal);
    const plan = planReversalsForRefund(facts, reversal);
    expect(plan.lines.length).toBe(1);
    expect(plan.lines[0]!.amountMinor).toBe(target);
    expect(target).toBe(300);
  });

  it("returns beyond_max_age with no lines when grant is too old", () => {
    const plan = planReversalsForRefund(
      {
        occurredAtIso: "2026-06-01T00:00:00.000Z",
        originalGrantAtIso: "2025-01-01T00:00:00.000Z",
        originalGrantMinor: 500,
        alreadyReversedMinor: 0,
        redeemedSinceGrantMinor: 0,
        isFullRefund: true,
        isChargeback: false
      },
      reversal
    );
    expect(plan.lines.length).toBe(0);
    expect(plan.deniedReason).toBe("beyond_max_age");
  });

  it("selects chargeback ratio over partial refund", () => {
    const r = pickRefundClawbackRatio({ isChargeback: true, isFullRefund: false }, reversal);
    expect(r).toBe(reversal.chargebackClawbackRatio);
  });
});
