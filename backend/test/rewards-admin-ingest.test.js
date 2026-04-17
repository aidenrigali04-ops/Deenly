const queries = require("../src/modules/admin/rewards-admin-queries");

describe("ingestHeuristicFraudFlags", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("inserts rows from heuristic items with dedupe fingerprint", async () => {
    jest.spyOn(queries, "buildHeuristicFraudFlagItems").mockResolvedValue({
      items: [
        {
          flagType: "checkout_redemption_velocity",
          severity: "medium",
          entityType: "user",
          entityId: "7",
          summary: "5 checkouts",
          metadata: { buyerUserId: 7 },
          detectedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      thresholds: { redemptionVelocityWindowHours: 24 }
    });
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: 101 }] })
    };
    const out = await queries.ingestHeuristicFraudFlags(db, {});
    expect(out.inserted).toBe(1);
    expect(out.skipped).toBe(0);
    expect(db.query).toHaveBeenCalledTimes(1);
    const sql = String(db.query.mock.calls[0][0]);
    expect(sql).toContain("INSERT INTO reward_fraud_flags");
    expect(sql).toContain("heuristicFingerprint");
  });
});
