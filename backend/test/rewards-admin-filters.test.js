const {
  parseLedgerListFilters,
  parseReferralQueueFilters,
  parseFraudFlagQueueFilters,
  getRewardsFraudThresholds
} = require("../src/modules/admin/rewards-admin-queries");

describe("rewards-admin query filters", () => {
  it("parseLedgerListFilters caps limit and defaults", () => {
    const f = parseLedgerListFilters({});
    expect(f.limit).toBe(50);
    expect(f.offset).toBe(0);
    expect(f.userId).toBeNull();
  });

  it("parseLedgerListFilters accepts valid entryKind", () => {
    const f = parseLedgerListFilters({ entryKind: "reversal", userId: "12" });
    expect(f.entryKind).toBe("reversal");
    expect(f.userId).toBe(12);
  });

  it("parseLedgerListFilters ignores invalid entryKind", () => {
    const f = parseLedgerListFilters({ entryKind: "hack" });
    expect(f.entryKind).toBeNull();
  });

  it("parseReferralQueueFilters defaults status to null (queue both)", () => {
    const f = parseReferralQueueFilters({});
    expect(f.status).toBeNull();
    expect(f.referrerUserId).toBeNull();
  });

  it("parseReferralQueueFilters accepts pending_clear", () => {
    const f = parseReferralQueueFilters({ status: "pending_clear" });
    expect(f.status).toBe("pending_clear");
  });

  it("parseFraudFlagQueueFilters defaults open+triaged slice size", () => {
    const f = parseFraudFlagQueueFilters({});
    expect(f.status).toBeNull();
    expect(f.limit).toBe(30);
    expect(f.offset).toBe(0);
  });

  it("parseFraudFlagQueueFilters accepts queueStatus", () => {
    const f = parseFraudFlagQueueFilters({ queueStatus: "confirmed", queueLimit: "5", queueOffset: "10" });
    expect(f.status).toBe("confirmed");
    expect(f.limit).toBe(5);
    expect(f.offset).toBe(10);
  });

  it("getRewardsFraudThresholds uses config when present", () => {
    const th = getRewardsFraudThresholds({
      rewardsFraudThresholds: {
        redemptionVelocityWindowHours: 48,
        redemptionVelocityMinCount: 5
      }
    });
    expect(th.redemptionVelocityWindowHours).toBe(48);
    expect(th.redemptionVelocityMinCount).toBe(5);
    expect(th.reversalBurstWindowDays).toBe(7);
  });
});
