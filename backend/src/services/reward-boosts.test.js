const { createBoostService } = require("./reward-boosts");
const {
  makeDbStub,
  makeRewardConfigStub,
  makeAnalyticsStub,
} = require("./__test-helpers__/reward-stubs");

function buildDeps() {
  const { db, client } = makeDbStub();
  const analytics = makeAnalyticsStub();
  const trustService = {
    getProfile: jest.fn(async () => ({ band: "good" })),
  };
  const svc = createBoostService({
    db,
    rewardConfig: makeRewardConfigStub(),
    trustService,
    analytics,
  });
  return { svc, db, client, analytics, trustService };
}

describe("reward-boosts", () => {
  describe("createBoost", () => {
    it("rejects invalid boost type", async () => {
      const { svc } = buildDeps();
      await expect(
        svc.createBoost({ sellerId: 1, listingId: "L1", type: "mega", budgetMinor: 1000, multiplier: 1.5, durationHours: 24 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("requires exactly one of listingId or storeId", async () => {
      const { svc } = buildDeps();
      // neither
      await expect(
        svc.createBoost({ sellerId: 1, type: "standard", budgetMinor: 1000, multiplier: 1.5, durationHours: 24 })
      ).rejects.toMatchObject({ statusCode: 400 });
      // both
      await expect(
        svc.createBoost({ sellerId: 1, listingId: "L1", storeId: "S1", type: "standard", budgetMinor: 1000, multiplier: 1.5, durationHours: 24 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects budget below type minimum", async () => {
      const { svc } = buildDeps();
      // standard min = 500
      await expect(
        svc.createBoost({ sellerId: 1, listingId: "L1", type: "standard", budgetMinor: 100, multiplier: 1.5, durationHours: 24 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects durationHours outside 1..720", async () => {
      const { svc } = buildDeps();
      await expect(
        svc.createBoost({ sellerId: 1, listingId: "L1", type: "standard", budgetMinor: 1000, multiplier: 1.5, durationHours: 0 })
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        svc.createBoost({ sellerId: 1, listingId: "L1", type: "standard", budgetMinor: 1000, multiplier: 1.5, durationHours: 721 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("creates draft boost on valid input", async () => {
      const { svc, db } = buildDeps();
      db.on(/INSERT INTO seller_boosts/, () => ({
        rowCount: 1,
        rows: [{
          id: "b1", seller_id: 1, listing_id: "L1", store_id: null,
          type: "standard", status: "draft", budget_minor: 1000,
          spent_minor: 0, multiplier: 1.5, duration_hours: 24,
          starts_at: null, ends_at: null, paused_at: null,
          completed_at: null, cancelled_at: null, cancel_reason: null,
          payment_reference: null, created_at: new Date(), updated_at: new Date(),
        }],
      }));
      const boost = await svc.createBoost({
        sellerId: 1, listingId: "L1", type: "standard",
        budgetMinor: 1000, multiplier: 1.5, durationHours: 24,
      });
      expect(boost.id).toBe("b1");
      expect(boost.status).toBe("draft");
    });
  });

  describe("activateBoost", () => {
    it("rejects when boost not found", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT \* FROM seller_boosts/, () => ({ rowCount: 0, rows: [] }));
      await expect(
        svc.activateBoost({ boostId: "b1", sellerId: 1 })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects when status is not draft", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT \* FROM seller_boosts/, () => ({
        rowCount: 1,
        rows: [{ id: "b1", seller_id: 1, status: "active", type: "standard", duration_hours: 24, budget_minor: 1000 }],
      }));
      await expect(
        svc.activateBoost({ boostId: "b1", sellerId: 1 })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("trust gate: rejects poor or high_risk sellers", async () => {
      const { svc, db, trustService } = buildDeps();
      db.on(/SELECT \* FROM seller_boosts/, () => ({
        rowCount: 1,
        rows: [{ id: "b1", seller_id: 1, status: "draft", type: "standard", duration_hours: 24, budget_minor: 1000 }],
      }));
      trustService.getProfile.mockResolvedValueOnce({ band: "poor" });
      await expect(
        svc.activateBoost({ boostId: "b1", sellerId: 1 })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("activates valid draft and sets start/end times", async () => {
      const { svc, db, analytics } = buildDeps();
      db.on(/SELECT \* FROM seller_boosts/, () => ({
        rowCount: 1,
        rows: [{ id: "b1", seller_id: 1, status: "draft", type: "standard", duration_hours: 24, budget_minor: 1000, multiplier: 1.5 }],
      }));
      db.on(/UPDATE seller_boosts/, () => ({
        rowCount: 1,
        rows: [{
          id: "b1", seller_id: 1, status: "active", type: "standard",
          budget_minor: 1000, spent_minor: 0, multiplier: 1.5,
          duration_hours: 24,
          starts_at: new Date(), ends_at: new Date(Date.now() + 24 * 3600000),
          listing_id: null, store_id: null, paused_at: null,
          completed_at: null, cancelled_at: null, cancel_reason: null,
          payment_reference: null, created_at: new Date(), updated_at: new Date(),
        }],
      }));
      const boost = await svc.activateBoost({ boostId: "b1", sellerId: 1 });
      expect(boost.status).toBe("active");
      expect(boost.starts_at).toBeDefined();
    });
  });

  describe("pauseBoost", () => {
    it("rejects when not active", async () => {
      const { svc, db } = buildDeps();
      db.on(/UPDATE seller_boosts/, () => ({ rowCount: 0, rows: [] }));
      await expect(
        svc.pauseBoost({ boostId: "b1", sellerId: 1 })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe("cancelBoost", () => {
    it("cancels an active boost", async () => {
      const { svc, db } = buildDeps();
      db.on(/UPDATE seller_boosts/, () => ({
        rowCount: 1,
        rows: [{
          id: "b1", seller_id: 1, status: "cancelled", type: "standard",
          budget_minor: 1000, spent_minor: 200, multiplier: 1.5,
          duration_hours: 24,
          starts_at: new Date(), ends_at: null, paused_at: null,
          completed_at: null, cancelled_at: new Date(), cancel_reason: "user request",
          listing_id: "L1", store_id: null,
          payment_reference: null, created_at: new Date(), updated_at: new Date(),
        }],
      }));
      const boost = await svc.cancelBoost({ boostId: "b1", sellerId: 1, reason: "user request" });
      expect(boost.status).toBe("cancelled");
    });
  });

  describe("getListingMultiplier", () => {
    it("returns 1.0 when no active boost", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT multiplier FROM seller_boosts/, () => ({ rowCount: 0, rows: [] }));
      expect(await svc.getListingMultiplier("L1")).toBe(1.0);
    });

    it("returns boost multiplier when active", async () => {
      const { svc, db } = buildDeps();
      db.on(/SELECT multiplier FROM seller_boosts/, () => ({
        rowCount: 1, rows: [{ multiplier: 2.0 }],
      }));
      expect(await svc.getListingMultiplier("L1")).toBe(2.0);
    });
  });

  describe("recordSpend", () => {
    it("rejects non-positive amount", async () => {
      const { svc } = buildDeps();
      await expect(
        svc.recordSpend({ boostId: "b1", amountMinor: 0 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("completes boost when budget is exhausted", async () => {
      const { svc, db, client } = buildDeps();
      // FOR UPDATE returns active boost with 10 remaining
      client.query.mockImplementation(async (sql, params) => {
        if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return { rowCount: 0, rows: [] };
        if (/FOR UPDATE/.test(sql)) {
          return {
            rowCount: 1,
            rows: [{
              id: "b1", seller_id: 1, status: "active",
              budget_minor: 1000, spent_minor: 990, multiplier: 1.5,
              listing_id: "L1", store_id: null, type: "standard",
              duration_hours: 24,
              starts_at: new Date(), ends_at: new Date(Date.now() + 3600000),
              paused_at: null, completed_at: null, cancelled_at: null,
              cancel_reason: null, payment_reference: null,
              created_at: new Date(), updated_at: new Date(),
            }],
          };
        }
        if (/INSERT INTO boost_spend_events/.test(sql)) return { rowCount: 1, rows: [] };
        if (/UPDATE seller_boosts/.test(sql)) {
          return {
            rowCount: 1,
            rows: [{
              id: "b1", seller_id: 1, status: "completed",
              budget_minor: 1000, spent_minor: 1000, multiplier: 1.5,
              listing_id: "L1", store_id: null, type: "standard",
              duration_hours: 24,
              starts_at: new Date(), ends_at: new Date(),
              paused_at: null, completed_at: new Date(), cancelled_at: null,
              cancel_reason: null, payment_reference: null,
              created_at: new Date(), updated_at: new Date(),
            }],
          };
        }
        return { rowCount: 0, rows: [] };
      });

      const boost = await svc.recordSpend({ boostId: "b1", amountMinor: 50 });
      expect(boost.status).toBe("completed");
    });
  });
});
