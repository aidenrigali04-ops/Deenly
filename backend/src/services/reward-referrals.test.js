const { createReferralService } = require("./reward-referrals");
const {
  makeDbStub,
  makeRewardConfigStub,
  makeAnalyticsStub,
} = require("./__test-helpers__/reward-stubs");

function buildDeps() {
  const { db } = makeDbStub();
  const analytics = makeAnalyticsStub();
  const rewardConfig = makeRewardConfigStub({
    referral_monthly_cap: 10,
    referral_min_purchase_minor: 1000,
    referral_hold_days: 14,
    referral_referrer_reward_dp: 500,
    referral_referee_discount_minor: 300,
  });
  rewardConfig.getNumber = jest.fn(async (k) => {
    const map = {
      referral_monthly_cap: 10,
      referral_min_purchase_minor: 1000,
      referral_hold_days: 14,
      referral_referrer_reward_dp: 500,
      referral_referee_discount_minor: 300,
    };
    return map[k] ?? 0;
  });

  const ledgerService = {
    creditPoints: jest.fn(async ({ amount }) => ({
      ledgerEntryId: "led-1",
      amount,
      balanceAfter: amount,
      wasCapped: false,
    })),
  };

  const svc = createReferralService({ db, ledgerService, rewardConfig, analytics });
  return { svc, db, analytics, ledgerService, rewardConfig };
}

describe("reward-referrals", () => {
  describe("attributeSignup", () => {
    it("returns invalid_code when code not found", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT \* FROM referral_codes/, () => ({ rowCount: 0, rows: [] }));
      const res = await svc.attributeSignup({
        refereeUserId: 2,
        referralCode: "NOPE1234",
      });
      expect(res).toEqual({ attributed: false, referralId: null, rejectedReason: "invalid_code" });
    });

    it("blocks self-referral", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT \* FROM referral_codes/, () => ({
        rowCount: 1,
        rows: [{ id: "rc1", user_id: 5, code: "ABC123", is_active: true }],
      }));
      const res = await svc.attributeSignup({
        refereeUserId: 5,
        referralCode: "ABC123",
      });
      expect(res.rejectedReason).toBe("self_referral");
    });

    it("blocks when monthly cap exceeded", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT \* FROM referral_codes/, () => ({
        rowCount: 1,
        rows: [{ id: "rc1", user_id: 1, code: "ABC123", is_active: true }],
      }));
      db.on(/COUNT\(\*\)::int AS cnt FROM referral_relationships[\s\S]*referrer_user_id/, () => ({
        rowCount: 1,
        rows: [{ cnt: 10 }], // at cap
      }));
      const res = await svc.attributeSignup({
        refereeUserId: 2,
        referralCode: "ABC123",
      });
      expect(res.rejectedReason).toBe("monthly_cap_exceeded");
    });

    it("blocks device overlap and emits fraud event", async () => {
      const { svc, db, analytics } = buildDeps();
      db.on(/SELECT \* FROM referral_codes/, () => ({
        rowCount: 1,
        rows: [{ id: "rc1", user_id: 1, code: "ABC123", is_active: true }],
      }));
      // monthly cap OK
      db.on(/COUNT\(\*\)::int AS cnt FROM referral_relationships[\s\S]*referrer_user_id = \$1[\s\S]*date_trunc/, () => ({
        rowCount: 1, rows: [{ cnt: 2 }],
      }));
      // device overlap
      db.on(/COUNT\(\*\)::int AS cnt FROM referral_relationships[\s\S]*device_fingerprint/, () => ({
        rowCount: 1, rows: [{ cnt: 1 }],
      }));
      const res = await svc.attributeSignup({
        refereeUserId: 2,
        referralCode: "ABC123",
        deviceFingerprint: "fp-dup",
      });
      expect(res.rejectedReason).toBe("device_overlap");
      expect(analytics.events.some((e) => e.name === "growth.referral.fraud_detected")).toBe(true);
    });

    it("attributes successfully on clean input", async () => {
      const { svc, db, analytics } = buildDeps();
      db.on(/SELECT \* FROM referral_codes/, () => ({
        rowCount: 1,
        rows: [{ id: "rc1", user_id: 1, code: "ABC123", is_active: true }],
      }));
      db.on(/COUNT\(\*\)::int AS cnt/, () => ({
        rowCount: 1, rows: [{ cnt: 0 }],
      }));
      db.on(/INSERT INTO referral_relationships/, () => ({
        rowCount: 1, rows: [{ id: "ref-1" }],
      }));
      db.on(/UPDATE referral_codes/, () => ({ rowCount: 1, rows: [] }));
      db.on(/INSERT INTO referral_events/, () => ({ rowCount: 1, rows: [] }));

      const res = await svc.attributeSignup({
        refereeUserId: 2,
        referralCode: "ABC123",
      });
      expect(res).toEqual({ attributed: true, referralId: "ref-1", rejectedReason: null });
      expect(analytics.events.some((e) => e.name === "growth.referral.attributed")).toBe(true);
    });
  });

  describe("evaluateQualifyingPurchase", () => {
    it("returns not qualified when no pending referral", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT \* FROM referral_relationships[\s\S]*referee_user_id/, () => ({
        rowCount: 0, rows: [],
      }));
      const res = await svc.evaluateQualifyingPurchase({
        refereeUserId: 2, orderId: 100, orderAmountMinor: 5000,
      });
      expect(res.qualified).toBe(false);
    });

    it("rejects when order below minimum purchase", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT \* FROM referral_relationships/, () => ({
        rowCount: 1,
        rows: [{ id: "ref-1", referrer_user_id: 1, referee_user_id: 2, status: "pending" }],
      }));
      const res = await svc.evaluateQualifyingPurchase({
        refereeUserId: 2, orderId: 100, orderAmountMinor: 500, // below 1000 min
      });
      expect(res.qualified).toBe(false);
    });

    it("qualifies and creates reward holds", async () => {
      const { svc, db, analytics } = buildDeps();
      db.on(/SELECT \* FROM referral_relationships/, () => ({
        rowCount: 1,
        rows: [{ id: "ref-1", referrer_user_id: 1, referee_user_id: 2, status: "pending" }],
      }));
      db.on(/UPDATE referral_relationships/, () => ({ rowCount: 1, rows: [] }));
      db.on(/INSERT INTO referral_rewards/, (_sql, params) => ({
        rowCount: 1,
        rows: [{ id: `rr-${params[2]}`, referral_id: params[0], beneficiary_user_id: params[1], amount: params[2] }],
      }));
      db.on(/INSERT INTO referral_events/, () => ({ rowCount: 1, rows: [] }));

      const res = await svc.evaluateQualifyingPurchase({
        refereeUserId: 2, orderId: 100, orderAmountMinor: 5000,
      });
      expect(res.qualified).toBe(true);
      expect(res.rewards).toHaveLength(2);
      expect(analytics.events.some((e) => e.name === "growth.referral.qualified")).toBe(true);
    });
  });

  describe("adminReject", () => {
    it("rejects 404 for missing referral", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT \* FROM referral_relationships WHERE id/, () => ({
        rowCount: 0, rows: [],
      }));
      await expect(
        svc.adminReject({ referralId: "x", adminUserId: 1, reason: "fraud" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects already-resolved referral with 409", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT \* FROM referral_relationships WHERE id/, () => ({
        rowCount: 1, rows: [{ id: "ref-1", status: "rewarded", referrer_user_id: 1 }],
      }));
      await expect(
        svc.adminReject({ referralId: "ref-1", adminUserId: 1, reason: "fraud" })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
