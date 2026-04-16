const { createRewardLedgerService } = require("./reward-ledger");
const {
  makeDbStub,
  makeRewardConfigStub,
  makeAnalyticsStub,
} = require("./__test-helpers__/reward-stubs");

/**
 * Build a ledger DB stub pre-wired with a single in-memory account.
 * Mutations through the handlers update the row so SELECT ... FOR UPDATE
 * sees the latest state within a test.
 */
function makeLedgerDb({ account, entries = [] } = {}) {
  const { db, client } = makeDbStub();
  const state = {
    account: account || {
      user_id: 1,
      balance: 0,
      lifetime_earned: 0,
      lifetime_redeemed: 0,
      rolling_12m_points: 0,
      tier: "explorer",
      points_earned_today: 0,
      points_earned_today_date: null,
      streak_current: 0,
      streak_longest: 0,
      streak_multiplier: 1.0,
      streak_shields_remaining: 0,
      streak_last_checkin_date: null,
      tier_qualified_at: null,
      tier_grace_until: null,
      last_activity_at: null,
      is_frozen: false,
    },
    entries,
  };

  // SELECT account (with or without FOR UPDATE)
  db.on(/SELECT \* FROM reward_accounts WHERE user_id/, () => ({
    rowCount: 1,
    rows: [{ ...state.account }],
  }));

  // INSERT new account (race path) — no-op
  db.on(/INSERT INTO reward_accounts/, () => ({
    rowCount: 0,
    rows: [],
  }));

  // Idempotency lookup
  db.on(/SELECT id, amount, balance_after FROM reward_ledger_entries\s+WHERE idempotency_key/, (_sql, params) => {
    const key = params[0];
    const hit = state.entries.find((e) => e.idempotency_key === key);
    return hit
      ? { rowCount: 1, rows: [{ id: hit.id, amount: hit.amount, balance_after: hit.balance_after }] }
      : { rowCount: 0, rows: [] };
  });

  // INSERT ledger entry
  db.on(/INSERT INTO reward_ledger_entries/, (sql, params) => {
    const isCredit = /'credit'/.test(sql);
    const id = `entry-${state.entries.length + 1}`;
    const [userId, amount, balanceAfter, source] = params;
    const entry = {
      id,
      user_id: userId,
      type: isCredit ? "credit" : "debit",
      amount,
      balance_after: balanceAfter,
      source,
      idempotency_key: isCredit ? params[10] : params[9],
    };
    state.entries.push(entry);
    return { rowCount: 1, rows: [{ id }] };
  });

  // UPDATE account balance
  db.on(/UPDATE reward_accounts SET/, (sql, params) => {
    if (/balance = \$1/.test(sql) && /points_earned_today/.test(sql)) {
      // creditPoints update
      state.account.balance = params[0];
      state.account.lifetime_earned = params[1];
      state.account.points_earned_today = params[2];
      state.account.points_earned_today_date = params[3];
    } else if (/balance = \$1/.test(sql)) {
      // debitPoints update
      state.account.balance = params[0];
      state.account.lifetime_redeemed = params[1];
    }
    return { rowCount: 1, rows: [] };
  });

  // voidEntry: fetch single entry by id
  db.on(/SELECT \* FROM reward_ledger_entries WHERE id = \$1/, (_sql, params) => {
    const hit = state.entries.find((e) => e.id === params[0]);
    return hit ? { rowCount: 1, rows: [hit] } : { rowCount: 0, rows: [] };
  });
  db.on(/UPDATE reward_ledger_entries SET voided_at/, (_sql, params) => {
    const hit = state.entries.find((e) => e.id === params[1]);
    if (hit) hit.voided_at = new Date();
    return { rowCount: 1, rows: [] };
  });

  return { db, client, state };
}

describe("reward-ledger", () => {
  describe("creditPoints", () => {
    it("rejects invalid credit source", async () => {
      const { db } = makeLedgerDb();
      const svc = createRewardLedgerService({
        db,
        config: {},
        rewardConfig: makeRewardConfigStub(),
      });
      await expect(
        svc.creditPoints({ userId: 1, amount: 10, source: "not_a_source" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects non-positive / non-integer amounts", async () => {
      const { db } = makeLedgerDb();
      const svc = createRewardLedgerService({
        db,
        config: {},
        rewardConfig: makeRewardConfigStub(),
      });
      await expect(
        svc.creditPoints({ userId: 1, amount: 0, source: "purchase" })
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        svc.creditPoints({ userId: 1, amount: 1.5, source: "purchase" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("short-circuits on existing idempotency key", async () => {
      const { db } = makeLedgerDb({
        entries: [
          { id: "existing", amount: 250, balance_after: 250, idempotency_key: "earn:order-1" },
        ],
      });
      const svc = createRewardLedgerService({
        db,
        config: {},
        rewardConfig: makeRewardConfigStub(),
      });
      const result = await svc.creditPoints({
        userId: 1,
        amount: 250,
        source: "purchase",
        idempotencyKey: "earn:order-1",
      });
      expect(result).toEqual({
        ledgerEntryId: "existing",
        amount: 250,
        balanceAfter: 250,
        wasCapped: false,
        capRemaining: 0,
      });
      // no getClient() call should have happened
      expect(db.getClient).not.toHaveBeenCalled();
    });

    it("credits happy path and emits analytics", async () => {
      const { db, state } = makeLedgerDb();
      const analytics = makeAnalyticsStub();
      const svc = createRewardLedgerService({
        db,
        config: {},
        rewardConfig: makeRewardConfigStub({ daily_earn_cap: 5000 }),
        analytics,
      });
      const result = await svc.creditPoints({
        userId: 1,
        amount: 500,
        source: "purchase",
        sourceRefId: "order-1",
        multiplierApplied: 1.5,
      });
      expect(result.amount).toBe(500);
      expect(result.balanceAfter).toBe(500);
      expect(result.wasCapped).toBe(false);
      expect(state.account.balance).toBe(500);
      expect(state.account.lifetime_earned).toBe(500);
      expect(analytics.events[0]).toMatchObject({
        name: "rewards.points.earned",
        payload: expect.objectContaining({
          user_id: 1,
          amount: 500,
          source: "purchase",
          balance_after: 500,
          multiplier_applied: 1.5,
        }),
      });
    });

    it("caps amount to remaining daily allowance and reports wasCapped", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { db, state } = makeLedgerDb({
        account: {
          user_id: 1,
          balance: 4000,
          lifetime_earned: 4000,
          lifetime_redeemed: 0,
          rolling_12m_points: 4000,
          tier: "explorer",
          points_earned_today: 4800,
          points_earned_today_date: today,
          streak_current: 0,
          streak_longest: 0,
          streak_multiplier: 1.0,
          streak_shields_remaining: 0,
          streak_last_checkin_date: null,
          is_frozen: false,
        },
      });
      const svc = createRewardLedgerService({
        db,
        config: {},
        rewardConfig: makeRewardConfigStub({ daily_earn_cap: 5000 }),
      });
      const result = await svc.creditPoints({
        userId: 1,
        amount: 500,
        source: "purchase",
      });
      expect(result.amount).toBe(200); // 5000 - 4800
      expect(result.wasCapped).toBe(true);
      expect(state.account.balance).toBe(4200);
    });

    it("returns zero-earn (no ledger row) when cap already reached", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { db, state } = makeLedgerDb({
        account: {
          user_id: 1,
          balance: 5000,
          lifetime_earned: 5000,
          lifetime_redeemed: 0,
          rolling_12m_points: 5000,
          tier: "explorer",
          points_earned_today: 5000,
          points_earned_today_date: today,
          streak_current: 0, streak_longest: 0, streak_multiplier: 1.0,
          streak_shields_remaining: 0, streak_last_checkin_date: null,
          is_frozen: false,
        },
      });
      const svc = createRewardLedgerService({
        db,
        config: {},
        rewardConfig: makeRewardConfigStub({ daily_earn_cap: 5000 }),
      });
      const result = await svc.creditPoints({
        userId: 1,
        amount: 500,
        source: "purchase",
      });
      expect(result).toEqual({
        ledgerEntryId: null,
        amount: 0,
        balanceAfter: 5000,
        wasCapped: true,
        capRemaining: 0,
      });
      expect(state.account.balance).toBe(5000); // unchanged
    });

    it("rejects when account is frozen", async () => {
      const { db } = makeLedgerDb({
        account: {
          user_id: 1, balance: 100, lifetime_earned: 100, lifetime_redeemed: 0,
          rolling_12m_points: 100, tier: "explorer",
          points_earned_today: 0, points_earned_today_date: null,
          streak_current: 0, streak_longest: 0, streak_multiplier: 1.0,
          streak_shields_remaining: 0, streak_last_checkin_date: null,
          is_frozen: true,
        },
      });
      const svc = createRewardLedgerService({
        db, config: {}, rewardConfig: makeRewardConfigStub(),
      });
      await expect(
        svc.creditPoints({ userId: 1, amount: 100, source: "purchase" })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("skipDailyCap bypasses cap check", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { db, state } = makeLedgerDb({
        account: {
          user_id: 1, balance: 5000, lifetime_earned: 5000, lifetime_redeemed: 0,
          rolling_12m_points: 5000, tier: "explorer",
          points_earned_today: 5000, points_earned_today_date: today,
          streak_current: 0, streak_longest: 0, streak_multiplier: 1.0,
          streak_shields_remaining: 0, streak_last_checkin_date: null,
          is_frozen: false,
        },
      });
      const svc = createRewardLedgerService({
        db, config: {},
        rewardConfig: makeRewardConfigStub({ daily_earn_cap: 5000 }),
      });
      const result = await svc.creditPoints({
        userId: 1,
        amount: 1000,
        source: "manual_credit",
        skipDailyCap: true,
      });
      expect(result.amount).toBe(1000);
      expect(state.account.balance).toBe(6000);
    });
  });

  describe("debitPoints", () => {
    it("rejects invalid debit source", async () => {
      const { db } = makeLedgerDb();
      const svc = createRewardLedgerService({
        db, config: {}, rewardConfig: makeRewardConfigStub(),
      });
      await expect(
        svc.debitPoints({ userId: 1, amount: 100, source: "purchase" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects insufficient balance with 422", async () => {
      const { db } = makeLedgerDb({
        account: {
          user_id: 1, balance: 50, lifetime_earned: 50, lifetime_redeemed: 0,
          rolling_12m_points: 50, tier: "explorer",
          points_earned_today: 0, points_earned_today_date: null,
          streak_current: 0, streak_longest: 0, streak_multiplier: 1.0,
          streak_shields_remaining: 0, streak_last_checkin_date: null,
          is_frozen: false,
        },
      });
      const svc = createRewardLedgerService({
        db, config: {}, rewardConfig: makeRewardConfigStub(),
      });
      await expect(
        svc.debitPoints({ userId: 1, amount: 100, source: "redemption" })
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("allows fraud_void even when frozen", async () => {
      const { db, state } = makeLedgerDb({
        account: {
          user_id: 1, balance: 500, lifetime_earned: 500, lifetime_redeemed: 0,
          rolling_12m_points: 500, tier: "explorer",
          points_earned_today: 0, points_earned_today_date: null,
          streak_current: 0, streak_longest: 0, streak_multiplier: 1.0,
          streak_shields_remaining: 0, streak_last_checkin_date: null,
          is_frozen: true,
        },
      });
      const svc = createRewardLedgerService({
        db, config: {}, rewardConfig: makeRewardConfigStub(),
      });
      const result = await svc.debitPoints({
        userId: 1, amount: 250, source: "fraud_void",
      });
      expect(result.amount).toBe(250);
      expect(state.account.balance).toBe(250);
    });

    it("emits rewards.points.redeemed on redemption source", async () => {
      const { db } = makeLedgerDb({
        account: {
          user_id: 1, balance: 500, lifetime_earned: 500, lifetime_redeemed: 0,
          rolling_12m_points: 500, tier: "explorer",
          points_earned_today: 0, points_earned_today_date: null,
          streak_current: 0, streak_longest: 0, streak_multiplier: 1.0,
          streak_shields_remaining: 0, streak_last_checkin_date: null,
          is_frozen: false,
        },
      });
      const analytics = makeAnalyticsStub();
      const svc = createRewardLedgerService({
        db, config: {}, rewardConfig: makeRewardConfigStub(), analytics,
      });
      await svc.debitPoints({ userId: 1, amount: 200, source: "redemption" });
      expect(analytics.events[0].name).toBe("rewards.points.redeemed");
    });
  });

  describe("voidEntry", () => {
    it("rejects a 404 when entry does not exist", async () => {
      const { db } = makeLedgerDb();
      const svc = createRewardLedgerService({
        db, config: {}, rewardConfig: makeRewardConfigStub(),
      });
      await expect(
        svc.voidEntry({ ledgerEntryId: "missing", reason: "fraud" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects double-void with 409", async () => {
      const { db } = makeLedgerDb({
        entries: [
          {
            id: "e1", user_id: 1, type: "credit", amount: 100,
            voided_at: new Date(),
          },
        ],
      });
      const svc = createRewardLedgerService({
        db, config: {}, rewardConfig: makeRewardConfigStub(),
      });
      await expect(
        svc.voidEntry({ ledgerEntryId: "e1", reason: "fraud" })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
