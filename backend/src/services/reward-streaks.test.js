const { createStreakService } = require("./reward-streaks");
const {
  makeDbStub,
  makeRewardConfigStub,
  makeAnalyticsStub,
} = require("./__test-helpers__/reward-stubs");

function buildDeps(account) {
  const { db } = makeDbStub();
  const analytics = makeAnalyticsStub();
  const updates = [];

  db.on(/UPDATE reward_accounts/, (sql, params) => {
    updates.push({ sql, params });
    return { rowCount: 1, rows: [] };
  });

  const ledgerService = {
    ensureAccount: jest.fn(async () => ({ ...account })),
    creditPoints: jest.fn(async ({ amount }) => ({
      ledgerEntryId: "bonus-1",
      amount,
      balanceAfter: account.balance + amount,
      wasCapped: false,
      capRemaining: 9999,
    })),
  };

  const rulesEngine = {
    computeStreakMultiplier: jest.fn(async (days) => {
      if (days >= 31) return 3.0;
      if (days >= 14) return 2.0;
      if (days >= 7) return 1.5;
      return 1.0;
    }),
  };

  const rewardConfig = makeRewardConfigStub();
  const svc = createStreakService({
    db, rewardConfig, rulesEngine, ledgerService, analytics,
  });

  return { svc, db, analytics, updates, ledgerService, rulesEngine };
}

const today = new Date().toISOString().slice(0, 10);
const yesterday = (() => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
})();
const twoDaysAgo = (() => {
  const d = new Date(); d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
})();

describe("reward-streaks", () => {
  describe("checkIn", () => {
    it("returns alreadyCheckedIn when same day", async () => {
      const { svc, ledgerService } = buildDeps({
        user_id: 1, balance: 100,
        streak_current: 5, streak_longest: 5,
        streak_multiplier: 1.0, streak_shields_remaining: 2,
        streak_last_checkin_date: today,
        tier: "member", is_frozen: false,
      });
      const res = await svc.checkIn(1);
      expect(res.checkedIn).toBe(false);
      expect(res.alreadyCheckedIn).toBe(true);
      expect(res.bonusPoints).toBe(0);
      expect(ledgerService.creditPoints).not.toHaveBeenCalled();
    });

    it("throws 403 when frozen", async () => {
      const { svc } = buildDeps({
        user_id: 1, balance: 100,
        streak_current: 5, streak_longest: 5,
        streak_multiplier: 1.0, streak_shields_remaining: 2,
        streak_last_checkin_date: yesterday,
        tier: "member", is_frozen: true,
      });
      await expect(svc.checkIn(1)).rejects.toMatchObject({ statusCode: 403 });
    });

    it("increments streak on consecutive day", async () => {
      const { svc, ledgerService, updates, analytics } = buildDeps({
        user_id: 1, balance: 100,
        streak_current: 6, streak_longest: 6,
        streak_multiplier: 1.0, streak_shields_remaining: 2,
        streak_last_checkin_date: yesterday,
        tier: "member", is_frozen: false,
      });
      const res = await svc.checkIn(1);
      expect(res.checkedIn).toBe(true);
      expect(res.streakCurrent).toBe(7);
      expect(res.streakMultiplier).toBe(1.5); // 7 → 1.5x
      expect(res.bonusPoints).toBe(5);
      expect(ledgerService.creditPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          amount: 5,
          source: "streak_bonus",
          idempotencyKey: `streak-checkin-1-${today}`,
        })
      );
      // Should have UPDATE for streak columns
      expect(updates.some((u) => /streak_current = \$1/.test(u.sql) && u.params[0] === 7)).toBe(true);
      // Analytics: continued event
      expect(analytics.events.some((e) => e.name === "rewards.streak.continued")).toBe(true);
    });

    it("emits milestone event at day 7", async () => {
      const { svc, analytics } = buildDeps({
        user_id: 1, balance: 0,
        streak_current: 6, streak_longest: 6,
        streak_multiplier: 1.0, streak_shields_remaining: 0,
        streak_last_checkin_date: yesterday,
        tier: "explorer", is_frozen: false,
      });
      await svc.checkIn(1);
      expect(analytics.events.some((e) =>
        e.name === "rewards.streak.milestone" && e.payload.streak_days === 7
      )).toBe(true);
    });

    it("resets streak to 1 after a missed day", async () => {
      const { svc, analytics } = buildDeps({
        user_id: 1, balance: 100,
        streak_current: 10, streak_longest: 10,
        streak_multiplier: 1.5, streak_shields_remaining: 0,
        streak_last_checkin_date: twoDaysAgo,
        tier: "member", is_frozen: false,
      });
      const res = await svc.checkIn(1);
      expect(res.streakCurrent).toBe(1);
      expect(res.streakMultiplier).toBe(1.0);
      // Should emit streak started since it's a reset
      expect(analytics.events.some((e) => e.name === "rewards.streak.started")).toBe(true);
    });

    it("resets to 1 on first-ever check-in", async () => {
      const { svc } = buildDeps({
        user_id: 1, balance: 0,
        streak_current: 0, streak_longest: 0,
        streak_multiplier: 1.0, streak_shields_remaining: 0,
        streak_last_checkin_date: null,
        tier: "explorer", is_frozen: false,
      });
      const res = await svc.checkIn(1);
      expect(res.streakCurrent).toBe(1);
    });

    it("keeps streak_longest as the higher value", async () => {
      const { svc, updates } = buildDeps({
        user_id: 1, balance: 0,
        streak_current: 3, streak_longest: 20,
        streak_multiplier: 1.0, streak_shields_remaining: 0,
        streak_last_checkin_date: yesterday,
        tier: "explorer", is_frozen: false,
      });
      await svc.checkIn(1);
      // newStreak=4, longest should remain 20
      const write = updates.find((u) => /streak_longest = \$2/.test(u.sql));
      expect(write.params[1]).toBe(20);
    });
  });

  describe("getStreakState", () => {
    it("returns checked_in_today true if last_checkin is today", async () => {
      const { svc } = buildDeps({
        user_id: 1, balance: 0,
        streak_current: 5, streak_longest: 5,
        streak_multiplier: 1.5, streak_shields_remaining: 1,
        streak_last_checkin_date: today,
        tier: "explorer", is_frozen: false,
      });
      const s = await svc.getStreakState(1);
      expect(s.checked_in_today).toBe(true);
      expect(s.current).toBe(5);
    });
  });

  describe("batchBreakDetection", () => {
    it("uses shield when available, breaks streak otherwise", async () => {
      const { db } = makeDbStub();
      const analytics = makeAnalyticsStub();
      const updates = [];

      // Return 2 users: one with shield, one without
      db.on(/SELECT user_id[\s\S]*FROM reward_accounts/, () => ({
        rowCount: 2,
        rows: [
          { user_id: 1, streak_current: 5, streak_shields_remaining: 1, streak_last_checkin_date: twoDaysAgo, tier: "member" },
          { user_id: 2, streak_current: 8, streak_shields_remaining: 0, streak_last_checkin_date: twoDaysAgo, tier: "explorer" },
        ],
      }));
      db.on(/UPDATE reward_accounts/, (sql, params) => {
        updates.push({ sql, params });
        return { rowCount: 1, rows: [] };
      });

      const svc = createStreakService({
        db,
        rewardConfig: makeRewardConfigStub(),
        rulesEngine: {},
        ledgerService: {},
        analytics,
      });

      const res = await svc.batchBreakDetection();
      expect(res.processed).toBe(2);
      expect(res.shieldsUsed).toBe(1);
      expect(res.streaksBroken).toBe(1);
      expect(analytics.events.some((e) => e.name === "rewards.streak.shield_used" && e.payload.user_id === 1)).toBe(true);
      expect(analytics.events.some((e) => e.name === "rewards.streak.broken" && e.payload.user_id === 2)).toBe(true);
    });
  });
});
