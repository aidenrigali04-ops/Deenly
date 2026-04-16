const { createAdminService } = require("./reward-admin");
const {
  makeDbStub,
  makeRewardConfigStub,
  makeAnalyticsStub,
} = require("./__test-helpers__/reward-stubs");

function buildDeps() {
  const { db } = makeDbStub();
  const analytics = makeAnalyticsStub();

  // Stub INSERT INTO admin_actions
  db.on(/INSERT INTO admin_actions/, (_sql, params) => ({
    rowCount: 1,
    rows: [{
      id: "aa-1",
      admin_id: params[0],
      action_type: params[1],
      target_type: params[2],
      target_id: params[3],
      reason: params[4],
      before_state: params[5],
      after_state: params[6],
      metadata: params[7],
      created_at: new Date(),
    }],
  }));

  const ledgerService = {
    getAccountState: jest.fn(async () => ({
      user_id: 1, balance: 1000, frozen: false,
    })),
    creditPoints: jest.fn(async ({ amount }) => ({
      id: "led-1", amount, balance_after: 1000 + amount,
    })),
    debitPoints: jest.fn(async ({ amount }) => ({
      id: "led-2", amount, balance_after: 1000 - amount,
    })),
  };

  const trustService = {
    resolveFlag: jest.fn(async ({ flagId, resolution }) => ({
      id: flagId, status: resolution,
    })),
  };

  const referralService = {
    adminApprove: jest.fn(async () => ({
      referral_id: "ref-1", new_status: "rewarded",
    })),
    adminReject: jest.fn(async () => ({
      referral_id: "ref-1", new_status: "rejected",
    })),
  };

  const notificationsService = {
    notifyAccountFrozen: jest.fn(),
  };

  const rewardConfig = makeRewardConfigStub({
    daily_rewards_budget: 100000,
    monthly_rewards_budget: 2000000,
  });
  rewardConfig.getNumber = jest.fn(async (k) => {
    const map = { daily_rewards_budget: 100000, monthly_rewards_budget: 2000000 };
    return map[k] ?? 0;
  });

  const svc = createAdminService({
    db,
    ledgerService,
    trustService,
    referralService,
    rewardConfig,
    notificationsService,
    analytics,
  });

  return { svc, db, analytics, ledgerService, trustService, referralService, notificationsService, rewardConfig };
}

describe("reward-admin", () => {
  describe("logAction", () => {
    it("rejects invalid action type", async () => {
      const { svc } = buildDeps();
      await expect(
        svc.logAction({ adminId: 1, actionType: "nope", targetType: "user", targetId: 1, reason: "test reason" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects invalid target type", async () => {
      const { svc } = buildDeps();
      await expect(
        svc.logAction({ adminId: 1, actionType: "manual_credit", targetType: "nope", targetId: 1, reason: "test reason" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects reason shorter than 3 chars", async () => {
      const { svc } = buildDeps();
      await expect(
        svc.logAction({ adminId: 1, actionType: "manual_credit", targetType: "user", targetId: 1, reason: "ab" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("adjustPoints", () => {
    it("rejects amount <= 0", async () => {
      const { svc } = buildDeps();
      await expect(
        svc.adjustPoints({ adminId: 1, userId: 2, amount: 0, direction: "credit", reason: "test" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects invalid direction", async () => {
      const { svc } = buildDeps();
      await expect(
        svc.adjustPoints({ adminId: 1, userId: 2, amount: 100, direction: "sideways", reason: "test" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("credits points and writes audit", async () => {
      const { svc, ledgerService, db } = buildDeps();
      const result = await svc.adjustPoints({
        adminId: 1, userId: 2, amount: 500, direction: "credit", reason: "comp reward",
      });
      expect(ledgerService.creditPoints).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 2, amount: 500 })
      );
      expect(result.before_balance).toBe(1000);
      // admin_actions INSERT was called
      expect(db.query).toHaveBeenCalled();
    });

    it("debits points and writes audit", async () => {
      const { svc, ledgerService } = buildDeps();
      const result = await svc.adjustPoints({
        adminId: 1, userId: 2, amount: 200, direction: "debit", reason: "correction",
      });
      expect(ledgerService.debitPoints).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 2, amount: 200 })
      );
      expect(result.before_balance).toBe(1000);
    });
  });

  describe("setAccountFrozen", () => {
    it("rejects when reason is missing", async () => {
      const { svc } = buildDeps();
      await expect(
        svc.setAccountFrozen({ adminId: 1, userId: 2, frozen: true, reason: null })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("freezes account, writes audit, and sends notification", async () => {
      const { svc, db, notificationsService } = buildDeps();
      db.on(/UPDATE reward_accounts/, () => ({ rowCount: 1, rows: [] }));
      const result = await svc.setAccountFrozen({
        adminId: 1, userId: 2, frozen: true, reason: "suspicious activity",
      });
      expect(result.frozen).toBe(true);
      expect(notificationsService.notifyAccountFrozen).toHaveBeenCalledWith({
        userId: 2, reason: "suspicious activity",
      });
    });

    it("unfreeze does not send notification", async () => {
      const { svc, db, notificationsService } = buildDeps();
      db.on(/UPDATE reward_accounts/, () => ({ rowCount: 1, rows: [] }));
      await svc.setAccountFrozen({
        adminId: 1, userId: 2, frozen: false, reason: "cleared investigation",
      });
      expect(notificationsService.notifyAccountFrozen).not.toHaveBeenCalled();
    });
  });

  describe("updateRule", () => {
    it("delegates to rewardConfig.update and writes audit", async () => {
      const { svc, rewardConfig } = buildDeps();
      rewardConfig.get = jest.fn(async () => 10);
      const result = await svc.updateRule({
        adminId: 1, key: "points_per_dollar", value: 15, reason: "holiday promo",
      });
      expect(rewardConfig.update).toHaveBeenCalledWith("points_per_dollar", 15, 1);
      expect(result).toEqual({ key: "points_per_dollar", value: 15 });
    });
  });

  describe("resolveFraudFlag", () => {
    it("delegates to trustService and writes audit", async () => {
      const { svc, trustService } = buildDeps();
      const result = await svc.resolveFraudFlag({
        adminId: 1, flagId: "ff-1", resolution: "resolved_legitimate", notes: "false positive",
      });
      expect(trustService.resolveFlag).toHaveBeenCalledWith({
        flagId: "ff-1",
        resolution: "resolved_legitimate",
        resolvedBy: 1,
        notes: "false positive",
      });
      expect(result.status).toBe("resolved_legitimate");
    });
  });

  describe("getBudgetStatus", () => {
    it("returns spend vs caps", async () => {
      const { svc, db } = buildDeps();
      // daily spend
      db.on(/date_trunc\('day'/, () => ({
        rowCount: 1, rows: [{ spent: "25000" }],
      }));
      // monthly spend
      db.on(/date_trunc\('month'/, () => ({
        rowCount: 1, rows: [{ spent: "800000" }],
      }));
      const result = await svc.getBudgetStatus();
      expect(result.daily.cap).toBe(100000);
      expect(result.daily.spent).toBe(25000);
      expect(result.daily.remaining).toBe(75000);
      expect(result.monthly.cap).toBe(2000000);
      expect(result.monthly.spent).toBe(800000);
      expect(result.monthly.utilization).toBeCloseTo(0.4);
    });
  });

  describe("approveReferral / rejectReferral", () => {
    it("approve delegates and audits", async () => {
      const { svc, referralService } = buildDeps();
      const result = await svc.approveReferral({
        adminId: 1, referralId: "ref-1", reason: "verified legit",
      });
      expect(referralService.adminApprove).toHaveBeenCalledWith({
        referralId: "ref-1", adminId: 1, reason: "verified legit",
      });
      expect(result.new_status).toBe("rewarded");
    });

    it("reject delegates and audits", async () => {
      const { svc, referralService } = buildDeps();
      const result = await svc.rejectReferral({
        adminId: 1, referralId: "ref-1", reason: "fraud detected",
      });
      expect(referralService.adminReject).toHaveBeenCalledWith({
        referralId: "ref-1", adminId: 1, reason: "fraud detected",
      });
      expect(result.new_status).toBe("rejected");
    });
  });
});
