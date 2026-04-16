const { createChallengeService } = require("./reward-challenges");
const {
  makeDbStub,
  makeRewardConfigStub,
  makeAnalyticsStub,
} = require("./__test-helpers__/reward-stubs");

function buildDeps() {
  const { db } = makeDbStub();
  const analytics = makeAnalyticsStub();
  const ledgerService = {
    creditPoints: jest.fn(async ({ amount }) => ({
      ledgerEntryId: "led-chal-1",
      amount,
      balanceAfter: amount,
    })),
  };
  const svc = createChallengeService({
    db,
    ledgerService,
    rewardConfig: makeRewardConfigStub(),
    analytics,
  });
  return { svc, db, analytics, ledgerService };
}

describe("reward-challenges", () => {
  describe("enroll", () => {
    it("rejects 404 when challenge not found", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT \* FROM challenge_definitions/, () => ({ rowCount: 0, rows: [] }));
      await expect(
        svc.enroll({ userId: 1, challengeId: "c1" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects 422 when challenge has ended", async () => {
      const { svc, db } = buildDeps();
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      db.on(/SELECT \* FROM challenge_definitions/, () => ({
        rowCount: 1,
        rows: [{
          id: "c1", is_active: true,
          starts_at: new Date(Date.now() - 86400000 * 7),
          ends_at: pastDate,
          criteria: { count: 3 },
          max_participants: null,
        }],
      }));
      await expect(
        svc.enroll({ userId: 1, challengeId: "c1" })
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("rejects 422 when challenge is full", async () => {
      const { svc, db } = buildDeps();
      const futureDate = new Date(Date.now() + 86400000 * 7);
      db.on(/SELECT \* FROM challenge_definitions/, () => ({
        rowCount: 1,
        rows: [{
          id: "c1", is_active: true,
          starts_at: new Date(Date.now() - 86400000),
          ends_at: futureDate,
          criteria: { count: 3 },
          max_participants: 5,
        }],
      }));
      db.on(/COUNT\(\*\)::int AS cnt FROM user_challenges/, () => ({
        rowCount: 1, rows: [{ cnt: 5 }],
      }));
      await expect(
        svc.enroll({ userId: 1, challengeId: "c1" })
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("enrolls successfully and emits event", async () => {
      const { svc, db, analytics } = buildDeps();
      const futureDate = new Date(Date.now() + 86400000 * 7);
      db.on(/SELECT \* FROM challenge_definitions/, () => ({
        rowCount: 1,
        rows: [{
          id: "c1", is_active: true, challenge_type: "daily",
          starts_at: new Date(Date.now() - 86400000),
          ends_at: futureDate,
          criteria: { count: 3 },
          max_participants: null,
        }],
      }));
      db.on(/INSERT INTO user_challenges/, () => ({
        rowCount: 1,
        rows: [{
          id: "uc1", user_id: 1, challenge_id: "c1",
          target: 3, progress: 0, status: "active",
          enrolled_at: new Date(), expires_at: futureDate,
        }],
      }));
      const result = await svc.enroll({ userId: 1, challengeId: "c1" });
      expect(result.id).toBe("uc1");
      expect(analytics.events[0].name).toBe("rewards.challenge.enrolled");
    });

    it("returns 409 for duplicate enrollment (23505)", async () => {
      const { svc, db } = buildDeps();
      const futureDate = new Date(Date.now() + 86400000 * 7);
      db.on(/SELECT \* FROM challenge_definitions/, () => ({
        rowCount: 1,
        rows: [{
          id: "c1", is_active: true, challenge_type: "daily",
          starts_at: new Date(Date.now() - 86400000),
          ends_at: futureDate,
          criteria: { count: 1 },
          max_participants: null,
        }],
      }));
      const err = new Error("duplicate");
      err.code = "23505";
      db.on(/INSERT INTO user_challenges/, () => { throw err; });
      await expect(
        svc.enroll({ userId: 1, challengeId: "c1" })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe("processEvent", () => {
    it("increments progress for matching challenge", async () => {
      const { svc, db, analytics } = buildDeps();
      db.on(/SELECT uc\.\*[\s\S]*FROM user_challenges uc/, () => ({
        rowCount: 1,
        rows: [{
          id: "uc1", challenge_id: "c1", user_id: 1,
          status: "active", progress: 1, target: 3,
          criteria: { action: "purchase" },
          reward_points: 200, title: "Buy 3 items",
          merchant_user_id: null,
        }],
      }));
      db.on(/UPDATE user_challenges/, () => ({ rowCount: 1, rows: [] }));

      const res = await svc.processEvent({
        userId: 1,
        eventType: "purchase",
        metadata: {},
      });
      expect(res.progressed).toHaveLength(1);
      expect(res.progressed[0].progress).toBe(2);
      expect(res.completed).toHaveLength(0);
      expect(analytics.events[0].name).toBe("rewards.challenge.progressed");
    });

    it("auto-completes and credits reward at target", async () => {
      const { svc, db, analytics, ledgerService } = buildDeps();
      db.on(/SELECT uc\.\*[\s\S]*FROM user_challenges uc/, () => ({
        rowCount: 1,
        rows: [{
          id: "uc1", challenge_id: "c1", user_id: 1,
          status: "active", progress: 2, target: 3,
          criteria: { action: "purchase" },
          reward_points: 200, title: "Buy 3 items",
          merchant_user_id: null,
        }],
      }));
      db.on(/UPDATE user_challenges/, () => ({ rowCount: 1, rows: [] }));

      const res = await svc.processEvent({
        userId: 1,
        eventType: "purchase",
        metadata: {},
      });
      expect(res.completed).toHaveLength(1);
      expect(res.completed[0].reward_points).toBe(200);
      expect(ledgerService.creditPoints).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          amount: 200,
          source: "challenge_reward",
          idempotencyKey: "challenge-reward-uc1",
        })
      );
      expect(analytics.events.some((e) => e.name === "rewards.challenge.completed")).toBe(true);
    });

    it("skips challenges where event type does not match criteria", async () => {
      const { svc, db, ledgerService } = buildDeps();
      db.on(/SELECT uc\.\*[\s\S]*FROM user_challenges uc/, () => ({
        rowCount: 1,
        rows: [{
          id: "uc1", challenge_id: "c1", user_id: 1,
          status: "active", progress: 0, target: 1,
          criteria: { action: "review" },
          reward_points: 50, title: "Write a review",
          merchant_user_id: null,
        }],
      }));
      const res = await svc.processEvent({
        userId: 1,
        eventType: "purchase",
        metadata: {},
      });
      expect(res.progressed).toHaveLength(0);
      expect(res.completed).toHaveLength(0);
      expect(ledgerService.creditPoints).not.toHaveBeenCalled();
    });

    it("respects merchant filter in criteria", async () => {
      const { svc, db, ledgerService } = buildDeps();
      db.on(/SELECT uc\.\*[\s\S]*FROM user_challenges uc/, () => ({
        rowCount: 1,
        rows: [{
          id: "uc1", challenge_id: "c1", user_id: 1,
          status: "active", progress: 0, target: 1,
          criteria: { action: "purchase", merchant_user_id: 42 },
          reward_points: 100, title: "Buy from Store X",
          merchant_user_id: 42,
        }],
      }));
      // wrong merchant
      const res = await svc.processEvent({
        userId: 1,
        eventType: "purchase",
        metadata: { merchantUserId: 99 },
      });
      expect(res.progressed).toHaveLength(0);
      expect(ledgerService.creditPoints).not.toHaveBeenCalled();
    });
  });
});
