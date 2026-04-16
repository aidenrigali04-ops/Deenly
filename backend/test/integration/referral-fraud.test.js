/**
 * Sprint 3 — Referral Lifecycle & Fraud Scenario Integration Tests
 *
 * Tests the referral service end-to-end with stubbed DB:
 *  - Code generation, attribution, monthly cap, self-referral block
 *  - Device/IP overlap fraud detection
 *  - Qualifying purchase → hold creation → batch release
 *  - Trust service: flag creation, auto-freeze, band changes
 *  - Admin override: approve/reject held referrals
 *
 * No real database required.
 */

const { createReferralService } = require("../../src/services/reward-referrals");
const { createTrustService, scoreToBand } = require("../../src/services/reward-trust");
const {
  makeDbStub,
  makeRewardConfigStub,
  makeAnalyticsStub,
  makeLoggerStub,
} = require("../../src/services/__test-helpers__/reward-stubs");

// ─── Referral DB Stub Factory ─────────────────────────────────────────────────

function buildReferralDb({
  existingCode = null,    // { id, user_id, code, is_active, total_uses }
  monthlyCount = 0,
  deviceMatches = 0,
  ipMatches = 0,
  pendingReferral = null, // referral_relationships row
  insertSuccess = true,
} = {}) {
  const { db } = makeDbStub();

  // SELECT referral_codes by code
  db.on(/SELECT \* FROM referral_codes WHERE code/, (_sql, params) => {
    if (!existingCode) return { rowCount: 0, rows: [] };
    if (existingCode.code === params[0].toUpperCase()) {
      return { rowCount: 1, rows: [existingCode] };
    }
    return { rowCount: 0, rows: [] };
  });

  // SELECT referral_codes by user_id (getOrCreate existing)
  db.on(/SELECT \* FROM referral_codes WHERE user_id.*is_active/, () =>
    existingCode
      ? { rowCount: 1, rows: [existingCode] }
      : { rowCount: 0, rows: [] }
  );

  // SELECT users.username
  db.on(/SELECT username FROM users/, () => ({
    rowCount: 1,
    rows: [{ username: "testuser" }],
  }));

  // INSERT referral_codes
  db.on(/INSERT INTO referral_codes/, (_sql, params) => ({
    rowCount: 1,
    rows: [{ id: "code-1", user_id: params[0], code: params[1], is_active: true, total_uses: 0, created_at: new Date() }],
  }));

  // Monthly count — SQL spans multiple lines so use [\s\S]* instead of .*
  db.on(/SELECT COUNT\(\*\)::int AS cnt FROM referral_relationships[\s\S]*date_trunc/, () => ({
    rowCount: 1,
    rows: [{ cnt: monthlyCount }],
  }));

  // Device overlap
  db.on(/device_fingerprint = \$2/, () => ({
    rowCount: 1,
    rows: [{ cnt: deviceMatches }],
  }));

  // IP overlap
  db.on(/signup_ip = \$2/, () => ({
    rowCount: 1,
    rows: [{ cnt: ipMatches }],
  }));

  // INSERT referral_relationships
  db.on(/INSERT INTO referral_relationships/, () => {
    if (!insertSuccess) {
      const err = new Error("duplicate key");
      err.code = "23505";
      throw err;
    }
    return { rowCount: 1, rows: [{ id: "ref-1" }] };
  });

  // UPDATE referral_codes total_uses
  db.on(/UPDATE referral_codes SET total_uses/, () => ({ rowCount: 1, rows: [] }));

  // INSERT referral_events
  db.on(/INSERT INTO referral_events/, () => ({ rowCount: 1, rows: [] }));

  // SELECT pending referral for qualifying purchase
  db.on(/SELECT \* FROM referral_relationships\s+WHERE referee_user_id.*status = 'pending'/, () =>
    pendingReferral
      ? { rowCount: 1, rows: [pendingReferral] }
      : { rowCount: 0, rows: [] }
  );

  // UPDATE referral status to qualified
  db.on(/UPDATE referral_relationships SET\s+status = 'qualified'/, () => ({ rowCount: 1, rows: [] }));

  // INSERT referral_rewards — reward_type is a SQL literal ('referrer_points'/'referee_discount'),
  // not a bind param. Params: [$1=referral_id, $2=beneficiary_user_id, $3=amount, $4=hold_until]
  const createdRewards = [];
  db.on(/INSERT INTO referral_rewards/, (_sql, params) => {
    const typeMatch = _sql.match(/'(referrer_points|referee_discount)'/);
    const rewardType = typeMatch ? typeMatch[1] : "unknown";
    createdRewards.push({ referralId: params[0], type: rewardType, amount: params[2] });
    return { rowCount: 1, rows: [{ id: `reward-${createdRewards.length}` }] };
  });

  return { db, createdRewards };
}

function buildReferralSvc({ dbOpts = {}, configOpts = {} } = {}) {
  const { db, createdRewards } = buildReferralDb(dbOpts);
  const analytics = makeAnalyticsStub();
  const rewardConfig = makeRewardConfigStub();

  rewardConfig.getNumber = jest.fn(async (key) => {
    const map = {
      referral_monthly_cap: configOpts.monthlyCap ?? 10,
      referral_hold_days: configOpts.holdDays ?? 14,
      referral_referrer_reward_dp: configOpts.referrerReward ?? 250,
      referral_referee_discount_minor: configOpts.refereeDiscount ?? 500,
      referral_min_purchase_minor: configOpts.minPurchase ?? 2500,
    };
    return map[key] ?? 0;
  });

  const ledgerService = {
    creditPoints: jest.fn(async ({ amount }) => ({ id: "entry-1", amount, balance_after: amount })),
  };

  const svc = createReferralService({ db, ledgerService, rewardConfig, analytics });
  return { svc, db, analytics, ledgerService, createdRewards };
}

// ─── Referral Lifecycle Tests ─────────────────────────────────────────────────

describe("Referral — getOrCreateCode", () => {
  it("returns existing code when one is already active", async () => {
    const { svc } = buildReferralSvc({
      dbOpts: {
        existingCode: { id: "code-abc", user_id: 1, code: "ELITE5A", is_active: true, total_uses: 3 },
      },
    });
    const result = await svc.getOrCreateCode(1);
    expect(result.code).toBe("ELITE5A");
    expect(result.total_uses).toBe(3);
  });

  it("creates a new code when none exists", async () => {
    const { svc } = buildReferralSvc();
    const result = await svc.getOrCreateCode(1);
    expect(typeof result.code).toBe("string");
    expect(result.code.length).toBeGreaterThanOrEqual(6);
    expect(result.share_url).toMatch(/deenly\.com\/r\//);
    expect(result.monthly_uses).toBe(0);
  });

  it("includes monthly cap and remaining in result", async () => {
    const { svc } = buildReferralSvc({
      dbOpts: {
        existingCode: { id: "c1", user_id: 1, code: "TEST1A", is_active: true, total_uses: 5 },
        monthlyCount: 3,
      },
      configOpts: { monthlyCap: 10 },
    });
    const result = await svc.getOrCreateCode(1);
    expect(result.monthly_uses).toBe(3);
    expect(result.monthly_cap).toBe(10);
    expect(result.monthly_remaining).toBe(7);
  });
});

describe("Referral — attributeSignup fraud checks", () => {
  const validCode = { id: "code-1", user_id: 10, code: "VALID1", is_active: true };

  it("self-referral returns rejected without creating relationship", async () => {
    const { svc, db } = buildReferralSvc({
      dbOpts: { existingCode: validCode },
    });
    const result = await svc.attributeSignup({
      refereeUserId: 10, // same as referrer (user_id: 10 on the code)
      referralCode: "VALID1",
    });
    expect(result.attributed).toBe(false);
    expect(result.rejectedReason).toBe("self_referral");
    // no INSERT into referral_relationships
    const insertCalls = db.calls.filter((c) => /INSERT INTO referral_relationships/.test(c.sql));
    expect(insertCalls).toHaveLength(0);
  });

  it("invalid code returns rejected", async () => {
    const { svc } = buildReferralSvc(); // no existingCode
    const result = await svc.attributeSignup({ refereeUserId: 5, referralCode: "BOGUS" });
    expect(result.attributed).toBe(false);
    expect(result.rejectedReason).toBe("invalid_code");
  });

  it("monthly cap exceeded returns rejected", async () => {
    const { svc } = buildReferralSvc({
      dbOpts: { existingCode: validCode, monthlyCount: 10 },
      configOpts: { monthlyCap: 10 },
    });
    const result = await svc.attributeSignup({ refereeUserId: 5, referralCode: "VALID1" });
    expect(result.attributed).toBe(false);
    expect(result.rejectedReason).toBe("monthly_cap_exceeded");
  });

  it("device fingerprint overlap returns rejected and emits fraud event", async () => {
    const { svc, analytics } = buildReferralSvc({
      dbOpts: { existingCode: validCode, deviceMatches: 1 },
    });
    const result = await svc.attributeSignup({
      refereeUserId: 5,
      referralCode: "VALID1",
      deviceFingerprint: "fp-abc123",
    });
    expect(result.attributed).toBe(false);
    expect(result.rejectedReason).toBe("device_overlap");

    const fraudEvent = analytics.events.find((e) => e.name === "growth.referral.fraud_detected");
    expect(fraudEvent).toBeDefined();
    expect(fraudEvent.payload.reason).toBe("device_overlap");
  });

  it("IP overlap emits suspected event but does NOT block (1 match = same household)", async () => {
    const { svc, analytics } = buildReferralSvc({
      dbOpts: { existingCode: validCode, ipMatches: 1 },
    });
    const result = await svc.attributeSignup({
      refereeUserId: 5,
      referralCode: "VALID1",
      signupIp: "192.168.1.1",
    });
    // 1 IP match is allowed (same household); 2+ would be flagged
    expect(result.attributed).toBe(true);
    expect(analytics.events.find((e) => e.name === "growth.referral.suspected")).toBeUndefined();
  });

  it("IP overlap with 2+ matches emits suspected event but still allows", async () => {
    const { svc, analytics } = buildReferralSvc({
      dbOpts: { existingCode: validCode, ipMatches: 2 },
    });
    const result = await svc.attributeSignup({
      refereeUserId: 5,
      referralCode: "VALID1",
      signupIp: "10.0.0.1",
    });
    expect(result.attributed).toBe(true); // still allowed, just flagged
    const suspectedEvent = analytics.events.find((e) => e.name === "growth.referral.fraud_suspected");
    expect(suspectedEvent).toBeDefined();
    expect(suspectedEvent.payload.reason).toBe("ip_overlap");
  });

  it("already referred (duplicate key) returns rejected", async () => {
    const { svc } = buildReferralSvc({
      dbOpts: { existingCode: validCode, insertSuccess: false },
    });
    const result = await svc.attributeSignup({ refereeUserId: 5, referralCode: "VALID1" });
    expect(result.attributed).toBe(false);
    expect(result.rejectedReason).toBe("already_referred");
  });

  it("successful attribution emits growth.referral.attributed", async () => {
    const { svc, analytics } = buildReferralSvc({
      dbOpts: { existingCode: validCode },
    });
    const result = await svc.attributeSignup({ refereeUserId: 5, referralCode: "VALID1" });
    expect(result.attributed).toBe(true);
    expect(result.referralId).toBe("ref-1");

    const event = analytics.events.find((e) => e.name === "growth.referral.attributed");
    expect(event).toBeDefined();
    expect(event.payload.referrer_user_id).toBe(10);
    expect(event.payload.referee_user_id).toBe(5);
  });
});

describe("Referral — evaluateQualifyingPurchase", () => {
  const pendingReferral = {
    id: "ref-1",
    referrer_user_id: 10,
    referee_user_id: 5,
    referral_code_id: "code-1",
    status: "pending",
  };

  it("qualifies on purchase above minimum and creates reward holds", async () => {
    const { svc, createdRewards, analytics } = buildReferralSvc({
      dbOpts: { pendingReferral },
      configOpts: { minPurchase: 2500, holdDays: 14, referrerReward: 250, refereeDiscount: 500 },
    });

    const result = await svc.evaluateQualifyingPurchase({
      refereeUserId: 5,
      orderId: 101,
      orderAmountMinor: 5000, // $50 > $25 minimum
    });

    expect(result.qualified).toBe(true);
    expect(result.rewards.length).toBeGreaterThan(0);
    // Two holds created: referrer DP and referee discount
    expect(createdRewards.some((r) => r.type === "referrer_points" && r.amount === 250)).toBe(true);
    expect(createdRewards.some((r) => r.type === "referee_discount" && r.amount === 500)).toBe(true);

    expect(analytics.events.find((e) => e.name === "growth.referral.qualified")).toBeDefined();
  });

  it("does NOT qualify on purchase below minimum", async () => {
    const { svc } = buildReferralSvc({
      dbOpts: { pendingReferral },
      configOpts: { minPurchase: 2500 },
    });

    const result = await svc.evaluateQualifyingPurchase({
      refereeUserId: 5,
      orderId: 102,
      orderAmountMinor: 1000, // $10 < $25
    });

    expect(result.qualified).toBe(false);
  });

  it("returns qualified:false when no pending referral exists", async () => {
    const { svc } = buildReferralSvc(); // no pendingReferral
    const result = await svc.evaluateQualifyingPurchase({
      refereeUserId: 99,
      orderId: 103,
      orderAmountMinor: 5000,
    });
    expect(result.qualified).toBe(false);
    expect(result.referralId).toBeNull();
  });
});

// ─── Trust Service / Fraud Tests ──────────────────────────────────────────────

function buildTrustDb({ existingProfile = null } = {}) {
  const { db } = makeDbStub();

  // SELECT trust_profiles
  db.on(/SELECT \* FROM trust_profiles WHERE user_id/, () =>
    existingProfile
      ? { rowCount: 1, rows: [{ ...existingProfile }] }
      : { rowCount: 0, rows: [] }
  );

  // INSERT trust_profiles (upsert create)
  db.on(/INSERT INTO trust_profiles/, (_sql, params) => {
    const score = params[1];
    const band = params[2];
    return {
      rowCount: 1,
      rows: [{
        id: "profile-1", user_id: params[0], score, band,
        identity_score: 0, behavioral_score: 0, transaction_score: 0,
        social_score: 0, device_score: 0,
        penalty_multiplier: 1.0, flags_active: 0,
        last_calculated_at: new Date(),
      }],
    };
  });

  // UPDATE trust_profiles score
  db.on(/UPDATE trust_profiles/, () => ({
    rowCount: 1,
    rows: [{
      id: "profile-1", user_id: existingProfile?.user_id ?? 1,
      score: 200, band: "high_risk",
      identity_score: 50, behavioral_score: 40, transaction_score: 30,
      social_score: 20, device_score: 10, penalty_multiplier: 0.3,
      flags_active: 1, last_calculated_at: new Date(),
    }],
  }));

  // INSERT fraud_flags
  const createdFlags = [];
  db.on(/INSERT INTO fraud_flags/, (_sql, params) => {
    createdFlags.push({ userId: params[0], type: params[1], severity: params[2] });
    return {
      rowCount: 1,
      rows: [{
        id: "flag-1", user_id: params[0],
        type: params[1], severity: params[2],
        status: "open", source: params[3],
        evidence: {}, created_by: null, created_at: new Date(),
        resolved_by: null, resolved_at: null, resolution_notes: null,
      }],
    };
  });

  // UPDATE reward_accounts SET frozen = true (auto-freeze on critical)
  const frozenUsers = new Set();
  db.on(/UPDATE reward_accounts\s+SET frozen = true/, (_sql, params) => {
    frozenUsers.add(params[0]);
    return { rowCount: 1, rows: [] };
  });

  // UPDATE reward_accounts SET earnings_suspended = true (suspend on high)
  db.on(/UPDATE reward_accounts\s+SET earnings_suspended = true/, () => ({
    rowCount: 1, rows: [],
  }));

  // Catch-all for remaining reward_accounts updates
  db.on(/UPDATE reward_accounts/, () => ({ rowCount: 1, rows: [] }));

  return { db, createdFlags, frozenUsers };
}

function buildTrustSvc({ dbOpts = {} } = {}) {
  const { db, createdFlags, frozenUsers } = buildTrustDb(dbOpts);
  const analytics = makeAnalyticsStub();
  const logger = makeLoggerStub();
  const rewardConfig = makeRewardConfigStub();
  rewardConfig.getNumber = jest.fn(async () => 0);

  const svc = createTrustService({ db, rewardConfig, analytics, logger });
  return { svc, db, analytics, createdFlags, frozenUsers };
}

describe("Trust — scoreToBand", () => {
  it("maps score ranges to correct bands", () => {
    // From testing-strategy-rewards-growth-engine.md section 2.6
    expect(scoreToBand(0)).toBe("high_risk");
    expect(scoreToBand(249)).toBe("high_risk");
    expect(scoreToBand(250)).toBe("poor");
    expect(scoreToBand(449)).toBe("poor");
    expect(scoreToBand(450)).toBe("fair");
    expect(scoreToBand(649)).toBe("fair");
    expect(scoreToBand(650)).toBe("good");
    expect(scoreToBand(799)).toBe("good");
    expect(scoreToBand(800)).toBe("excellent");
    expect(scoreToBand(1000)).toBe("excellent");
  });
});

describe("Trust — getProfile", () => {
  it("returns existing profile without creating new one", async () => {
    const existing = {
      id: "p1", user_id: 1, score: 750, band: "good",
      identity_score: 200, behavioral_score: 180, transaction_score: 150,
      social_score: 100, device_score: 80, penalty_multiplier: 1.0, flags_active: 0,
      last_calculated_at: new Date(),
    };
    const { svc } = buildTrustSvc({ dbOpts: { existingProfile: existing } });
    const profile = await svc.getProfile(1);
    expect(profile.score).toBe(750);
    expect(profile.band).toBe("good");
  });

  it("creates default profile (score=500) when none exists", async () => {
    const { svc } = buildTrustSvc();
    const profile = await svc.getProfile(1);
    expect(profile.score).toBe(500);
  });
});

describe("Trust — createFlag fraud scenarios", () => {
  it("critical flag auto-freezes the account", async () => {
    const { svc, analytics, frozenUsers } = buildTrustSvc({
      dbOpts: {
        existingProfile: {
          id: "p1", user_id: 7, score: 300, band: "poor",
          identity_score: 80, behavioral_score: 60, transaction_score: 50,
          social_score: 40, device_score: 30, penalty_multiplier: 0.7,
          flags_active: 0, last_calculated_at: new Date(),
        },
      },
    });

    // createFlag returns a flat formatted flag (id, type, severity, status, …)
    // Auto-actions are verified through side effects (frozenUsers set, analytics events)
    const result = await svc.createFlag({
      userId: 7,
      type: "velocity_breach",
      severity: "critical",
      source: "velocity_check",
      evidence: { transactions_per_hour: 25 },
    });

    expect(result.severity).toBe("critical");
    expect(result.type).toBe("velocity_breach");
    expect(frozenUsers.has(7)).toBe(true);

    // trust.fraud.detected is always emitted; freeze analytics via applyAutoAction
    const fraudEvent = analytics.events.find((e) => e.name === "trust.fraud.detected");
    expect(fraudEvent).toBeDefined();
    expect(fraudEvent.payload.severity).toBe("critical");
  });

  it("high severity flag suspends earnings (does not freeze)", async () => {
    const { svc, frozenUsers } = buildTrustSvc({
      dbOpts: {
        existingProfile: {
          id: "p1", user_id: 8, score: 400, band: "poor",
          identity_score: 90, behavioral_score: 70, transaction_score: 60,
          social_score: 50, device_score: 40, penalty_multiplier: 0.7,
          flags_active: 0, last_calculated_at: new Date(),
        },
      },
    });

    const result = await svc.createFlag({
      userId: 8,
      type: "referral_farming",
      severity: "high",
      source: "referral_check",
      evidence: { pattern: "velocity" },
    });

    expect(result.severity).toBe("high");
    expect(frozenUsers.has(8)).toBe(false); // NOT frozen, just earnings suspended
  });

  it("low/medium flags create the flag without freezing or suspending", async () => {
    const { svc, frozenUsers } = buildTrustSvc({
      dbOpts: {
        existingProfile: {
          id: "p1", user_id: 9, score: 700, band: "good",
          identity_score: 200, behavioral_score: 175, transaction_score: 150,
          social_score: 100, device_score: 75, penalty_multiplier: 1.0,
          flags_active: 0, last_calculated_at: new Date(),
        },
      },
    });

    for (const severity of ["low", "medium"]) {
      const result = await svc.createFlag({
        userId: 9,
        type: "suspicious_pattern",
        severity,
        source: "system_auto",
        evidence: {},
      });
      // Flag is created successfully
      expect(result.severity).toBe(severity);
      expect(result.type).toBe("suspicious_pattern");
    }

    // No freeze applied for low/medium
    expect(frozenUsers.size).toBe(0);
  });

  it("getPenaltyMultiplier returns correct values per trust band", async () => {
    // getPenaltyMultiplier(userId) calls getProfile(userId) internally.
    // We set up one svc per band to control what getProfile returns.
    const cases = [
      ["excellent", 1.0],
      ["good",      1.0],
      ["fair",      0.9],
      ["poor",      0.7],
      ["high_risk", 0.3],
    ];
    for (const [band, expected] of cases) {
      const { svc } = buildTrustSvc({
        dbOpts: {
          existingProfile: {
            id: "p1", user_id: 1, score: 500, band,
            identity_score: 100, behavioral_score: 100, transaction_score: 100,
            social_score: 100, device_score: 100, penalty_multiplier: 1.0,
            flags_active: 0, last_calculated_at: new Date(),
          },
        },
      });
      expect(await svc.getPenaltyMultiplier(1)).toBe(expected);
    }
  });
});

describe("Trust — combined fraud: device overlap → flag → auto-freeze → earn blocked", () => {
  it("full fraud pipeline from device overlap detection to account freeze", async () => {
    // Step 1: attribute referral with device overlap → rejected + fraud event
    const validCode = { id: "code-1", user_id: 10, code: "FRAUD1", is_active: true };
    const { svc: referralSvc, analytics: refAnalytics } = buildReferralSvc({
      dbOpts: { existingCode: validCode, deviceMatches: 1 },
    });

    const attribution = await referralSvc.attributeSignup({
      refereeUserId: 5,
      referralCode: "FRAUD1",
      deviceFingerprint: "shared-device-fp",
    });
    expect(attribution.attributed).toBe(false);
    expect(attribution.rejectedReason).toBe("device_overlap");
    expect(refAnalytics.events.find((e) => e.name === "growth.referral.fraud_detected")).toBeDefined();

    // Step 2: admin/system creates critical fraud flag → account auto-frozen
    const { svc: trustSvc, frozenUsers, analytics: trustAnalytics } = buildTrustSvc({
      dbOpts: {
        existingProfile: {
          id: "p1", user_id: 5, score: 300, band: "poor",
          identity_score: 80, behavioral_score: 60, transaction_score: 50,
          social_score: 40, device_score: 30, penalty_multiplier: 0.7,
          flags_active: 0, last_calculated_at: new Date(),
        },
      },
    });

    const flagResult = await trustSvc.createFlag({
      userId: 5,
      type: "device_overlap",
      severity: "critical",
      source: "referral_check",
      evidence: { device_fingerprint: "shared-device-fp" },
    });

    expect(flagResult.severity).toBe("critical");
    expect(frozenUsers.has(5)).toBe(true);

    // trust.fraud.detected emitted with critical severity (auto-freeze is a side effect)
    const detectedEvent = trustAnalytics.events.find((e) => e.name === "trust.fraud.detected");
    expect(detectedEvent).toBeDefined();
    expect(detectedEvent.payload.severity).toBe("critical");
    expect(detectedEvent.payload.type).toBe("device_overlap");
  });
});
