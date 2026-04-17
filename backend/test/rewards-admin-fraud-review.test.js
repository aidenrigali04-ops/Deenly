const { reviewRewardFraudFlag } = require("../src/modules/admin/rewards-admin-queries");

function fraudRow(overrides = {}) {
  return {
    id: 1,
    flag_type: "test_flag",
    severity: "low",
    status: "open",
    subject_user_id: 5,
    related_entity_type: null,
    related_entity_id: null,
    reward_ledger_entry_id: null,
    referral_attribution_id: null,
    seller_boost_purchase_id: null,
    reviewer_user_id: null,
    reviewed_at: null,
    metadata: {},
    created_at: new Date("2025-01-01T00:00:00.000Z"),
    updated_at: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides
  };
}

describe("reviewRewardFraudFlag", () => {
  it("dismisses an open flag and writes admin audit row", async () => {
    const dismissed = fraudRow({
      status: "dismissed",
      reviewer_user_id: 7,
      reviewed_at: new Date("2025-01-02T00:00:00.000Z"),
      metadata: { admin_review: { action: "dismiss" } }
    });
    const responses = [{ rowCount: 1, rows: [fraudRow({ status: "open" })] }, { rowCount: 1, rows: [dismissed] }, { rowCount: 1, rows: [] }];
    let i = 0;
    const client = { query: jest.fn(() => Promise.resolve(responses[i++])) };
    const db = { withTransaction: jest.fn((fn) => fn(client)) };
    const out = await reviewRewardFraudFlag(db, { id: 1, reviewerUserId: 7, action: "dismiss", notes: "spam" });
    expect(out.ok).toBe(true);
    expect(out.flag.status).toBe("dismissed");
    expect(client.query).toHaveBeenCalledTimes(3);
    const insertSql = String(client.query.mock.calls[2][0]);
    expect(insertSql).toContain("INSERT INTO rewards_admin_actions");
  });

  it("returns notFound when flag missing", async () => {
    const client = { query: jest.fn(() => Promise.resolve({ rowCount: 0, rows: [] })) };
    const db = { withTransaction: jest.fn((fn) => fn(client)) };
    const out = await reviewRewardFraudFlag(db, { id: 99, reviewerUserId: 1, action: "dismiss" });
    expect(out.ok).toBe(false);
    expect(out.notFound).toBe(true);
  });

  it("returns conflict when already dismissed", async () => {
    const client = {
      query: jest.fn(() => Promise.resolve({ rowCount: 1, rows: [fraudRow({ status: "dismissed" })] }))
    };
    const db = { withTransaction: jest.fn((fn) => fn(client)) };
    const out = await reviewRewardFraudFlag(db, { id: 1, reviewerUserId: 1, action: "confirm" });
    expect(out.ok).toBe(false);
    expect(out.conflict).toBe(true);
  });

  it("throws on invalid action", async () => {
    const db = { withTransaction: jest.fn() };
    await expect(reviewRewardFraudFlag(db, { id: 1, reviewerUserId: 1, action: "nope" })).rejects.toMatchObject({
      code: "INVALID_FRAUD_REVIEW_ACTION"
    });
  });
});
