const { createTierService } = require("./reward-tiers");
const {
  makeDbStub,
  makeRewardConfigStub,
  makeAnalyticsStub,
} = require("./__test-helpers__/reward-stubs");

function buildDeps(account, overrides = {}) {
  const { db } = makeDbStub();
  const analytics = makeAnalyticsStub();
  const updates = [];

  db.on(/UPDATE reward_accounts/, (sql, params) => {
    updates.push({ sql, params });
    return { rowCount: 1, rows: [] };
  });

  const ledgerService = {
    ensureAccount: jest.fn(async () => ({ ...account })),
  };

  const rulesEngine = {
    computeQualifiedTier: jest.fn(async () => overrides.tierResult || {
      qualifiedTier: "explorer",
      nextTier: "member",
      nextThreshold: 500,
      progress: 0,
    }),
  };

  const rewardConfig = makeRewardConfigStub({
    tier_multiplier: 1.0,
    streak_shields: 2,
    tier_grace_period_days: 30,
  });
  rewardConfig.getNumber = jest.fn(async (k) => {
    if (k === "tier_grace_period_days") return 30;
    return 0;
  });

  const svc = createTierService({
    db, rewardConfig, rulesEngine, ledgerService, analytics,
  });

  return { svc, db, analytics, updates, rulesEngine, ledgerService };
}

const baseAccount = {
  user_id: 1,
  tier: "member",
  rolling_12m_points: 600,
  tier_qualified_at: new Date("2025-01-01"),
  tier_grace_until: null,
};

describe("reward-tiers", () => {
  it("returns tier info with next-tier progress", async () => {
    const { svc } = buildDeps(baseAccount, {
      tierResult: {
        qualifiedTier: "member",
        nextTier: "insider",
        nextThreshold: 2500,
        progress: 0.24,
      },
    });
    const info = await svc.getTierInfo(1);
    expect(info.tier).toBe("member");
    expect(info.qualified_tier).toBe("member");
    expect(info.next_tier).toBe("insider");
    expect(info.progress).toBe(0.24);
  });

  it("requalify is a no-op when qualified tier equals current", async () => {
    const { svc, analytics, updates } = buildDeps(baseAccount, {
      tierResult: { qualifiedTier: "member", nextTier: "insider", nextThreshold: 2500, progress: 0.2 },
    });
    const res = await svc.requalify(1);
    expect(res).toEqual({ changed: false, previousTier: "member", newTier: "member", direction: null });
    expect(analytics.events).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("requalify clears lingering grace when same-tier", async () => {
    const acct = { ...baseAccount, tier_grace_until: new Date("2026-05-01") };
    const { svc, updates } = buildDeps(acct, {
      tierResult: { qualifiedTier: "member", nextTier: "insider", nextThreshold: 2500, progress: 0.2 },
    });
    await svc.requalify(1);
    expect(updates.some((u) => /tier_grace_until = NULL/.test(u.sql))).toBe(true);
  });

  it("upgrade: applies tier, resets shields, emits rewards.tier.upgraded", async () => {
    const { svc, analytics, updates } = buildDeps(baseAccount, {
      tierResult: { qualifiedTier: "insider", nextTier: "vip", nextThreshold: 10000, progress: 0.1 },
    });
    const res = await svc.requalify(1);
    expect(res).toMatchObject({ changed: true, direction: "upgrade", newTier: "insider" });
    expect(updates.some((u) => /tier = \$1/.test(u.sql) && u.params[0] === "insider")).toBe(true);
    expect(updates.some((u) => /streak_shields_remaining = \$1/.test(u.sql))).toBe(true);
    expect(analytics.events[0].name).toBe("rewards.tier.upgraded");
  });

  it("downgrade path: starts grace period first, does not change tier", async () => {
    const { svc, analytics, updates } = buildDeps(baseAccount, {
      tierResult: { qualifiedTier: "explorer", nextTier: "member", nextThreshold: 500, progress: 0.5 },
    });
    const res = await svc.requalify(1);
    expect(res).toEqual({ changed: false, previousTier: "member", newTier: "member", direction: null });
    expect(updates.some((u) => /tier_grace_until = \$1/.test(u.sql))).toBe(true);
    expect(analytics.events[0].name).toBe("rewards.tier.grace_started");
  });

  it("downgrade path: still-in-grace does not change tier", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10);
    const acct = { ...baseAccount, tier_grace_until: future };
    const { svc, analytics, updates } = buildDeps(acct, {
      tierResult: { qualifiedTier: "explorer", nextTier: "member", nextThreshold: 500, progress: 0.2 },
    });
    const res = await svc.requalify(1);
    expect(res.changed).toBe(false);
    expect(updates).toHaveLength(0);
    expect(analytics.events).toHaveLength(0);
  });

  it("downgrade path: expired grace performs downgrade and emits event", async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24);
    const acct = { ...baseAccount, tier_grace_until: past };
    const { svc, analytics, updates } = buildDeps(acct, {
      tierResult: { qualifiedTier: "explorer", nextTier: "member", nextThreshold: 500, progress: 0.2 },
    });
    const res = await svc.requalify(1);
    expect(res).toMatchObject({ changed: true, direction: "downgrade", newTier: "explorer" });
    expect(updates.some((u) => /tier = \$1/.test(u.sql) && u.params[0] === "explorer")).toBe(true);
    expect(analytics.events[0].name).toBe("rewards.tier.downgraded");
  });

  it("recalcRolling12m aggregates credits and writes the value", async () => {
    const { db } = makeDbStub();
    db.on(/SELECT COALESCE\(SUM\(amount\), 0\)::int AS total/, () => ({
      rowCount: 1,
      rows: [{ total: 1234 }],
    }));
    const writes = [];
    db.on(/UPDATE reward_accounts SET rolling_12m_points/, (_sql, params) => {
      writes.push(params);
      return { rowCount: 1, rows: [] };
    });
    const svc = createTierService({
      db,
      rewardConfig: makeRewardConfigStub(),
      rulesEngine: { computeQualifiedTier: jest.fn() },
      ledgerService: { ensureAccount: jest.fn() },
    });
    const total = await svc.recalcRolling12m(7);
    expect(total).toBe(1234);
    expect(writes[0]).toEqual([1234, 7]);
  });
});
