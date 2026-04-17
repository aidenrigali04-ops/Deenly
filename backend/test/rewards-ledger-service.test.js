const { createRewardsLedgerService } = require("../src/modules/rewards/rewards-ledger-service");
const {
  InsufficientPointsError,
  InvalidReversalError,
  LedgerEntryNotFoundError
} = require("../src/modules/rewards/rewards-ledger-errors");
const { sumDeltaPointsFromRows } = require("../src/modules/rewards/balance-helpers");
const {
  createMemoryRewardsLedgerRepository,
  createMemoryDb
} = require("./helpers/memory-rewards-ledger-repository");

describe("balance-helpers sumDeltaPointsFromRows", () => {
  it("sums bigint-compatible values", () => {
    expect(
      String(
        sumDeltaPointsFromRows([
          { delta_points: "10" },
          { delta_points: -5 },
          { delta_points: "3" }
        ])
      )
    ).toBe("8");
  });
});

describe("createRewardsLedgerService (memory repository)", () => {
  function makeService() {
    const repository = createMemoryRewardsLedgerRepository();
    const db = createMemoryDb({ serializeTransactions: true });
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const service = createRewardsLedgerService({ db, analytics, logger: null, repository });
    return { service, analytics, repository };
  }

  it("earnPoints increases balance", async () => {
    const { service, analytics } = makeService();
    const r = await service.earnPoints({
      userId: 1,
      points: 100,
      reason: "signup_bonus",
      idempotencyKey: "earn-1"
    });
    expect(r.duplicate).toBe(false);
    expect(r.ledgerEntry.deltaPoints).toBe("100");
    const bal = await service.getBalance({ userId: 1 });
    expect(bal.balancePoints).toBe("100");
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "rewards_ledger_earn",
      expect.objectContaining({ userId: 1, points: "100" })
    );
  });

  it("earnPoints is idempotent on same idempotency key", async () => {
    const { service, analytics } = makeService();
    await service.earnPoints({
      userId: 2,
      points: 50,
      reason: "task",
      idempotencyKey: "idem-same"
    });
    const second = await service.earnPoints({
      userId: 2,
      points: 50,
      reason: "task",
      idempotencyKey: "idem-same"
    });
    expect(second.duplicate).toBe(true);
    const bal = await service.getBalance({ userId: 2 });
    expect(bal.balancePoints).toBe("50");
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "rewards_ledger_earn_duplicate",
      expect.objectContaining({ userId: 2 })
    );
  });

  it("spendPoints decreases balance", async () => {
    const { service } = makeService();
    await service.earnPoints({
      userId: 3,
      points: 80,
      reason: "credit",
      idempotencyKey: "e1"
    });
    const s = await service.spendPoints({
      userId: 3,
      points: 30,
      reason: "redemption",
      idempotencyKey: "s1"
    });
    expect(s.duplicate).toBe(false);
    expect(s.ledgerEntry.deltaPoints).toBe("-30");
    const bal = await service.getBalance({ userId: 3 });
    expect(bal.balancePoints).toBe("50");
  });

  it("spendPoints throws when insufficient balance", async () => {
    const { service } = makeService();
    await service.earnPoints({
      userId: 4,
      points: 10,
      reason: "small",
      idempotencyKey: "e1"
    });
    await expect(
      service.spendPoints({
        userId: 4,
        points: 50,
        reason: "too_much",
        idempotencyKey: "s-fail"
      })
    ).rejects.toBeInstanceOf(InsufficientPointsError);
    const bal = await service.getBalance({ userId: 4 });
    expect(bal.balancePoints).toBe("10");
  });

  it("reverseEntry compensates an earn and restores balance", async () => {
    const { service } = makeService();
    const earn = await service.earnPoints({
      userId: 5,
      points: 40,
      reason: "promo",
      idempotencyKey: "earn-r"
    });
    const rev = await service.reverseEntry({
      userId: 5,
      originalLedgerEntryId: earn.ledgerEntry.id,
      reason: "admin_correction",
      idempotencyKey: "rev-1"
    });
    expect(rev.duplicate).toBe(false);
    expect(rev.ledgerEntry.entryKind).toBe("reversal");
    expect(rev.ledgerEntry.deltaPoints).toBe("-40");
    const bal = await service.getBalance({ userId: 5 });
    expect(bal.balancePoints).toBe("0");
  });

  it("reverseEntry rejects second reversal of same original", async () => {
    const { service } = makeService();
    const earn = await service.earnPoints({
      userId: 6,
      points: 15,
      reason: "x",
      idempotencyKey: "e"
    });
    await service.reverseEntry({
      userId: 6,
      originalLedgerEntryId: earn.ledgerEntry.id,
      reason: "r1",
      idempotencyKey: "r-a"
    });
    await expect(
      service.reverseEntry({
        userId: 6,
        originalLedgerEntryId: earn.ledgerEntry.id,
        reason: "r2",
        idempotencyKey: "r-b"
      })
    ).rejects.toBeInstanceOf(InvalidReversalError);
  });

  it("getHistory returns paginated ledger rows", async () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i += 1) {
      await service.earnPoints({
        userId: 7,
        points: 1,
        reason: "step",
        idempotencyKey: `step-${i}`
      });
    }
    const first = await service.getHistory({ userId: 7, limit: 2 });
    expect(first.items.length).toBe(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await service.getHistory({ userId: 7, limit: 10, cursor: first.nextCursor });
    expect(second.items.length).toBeGreaterThanOrEqual(3);
  });

  it("getBalance and getHistory are empty for unknown user", async () => {
    const { service } = makeService();
    const bal = await service.getBalance({ userId: 999 });
    expect(bal.balancePoints).toBe("0");
    const hist = await service.getHistory({ userId: 999, limit: 10 });
    expect(hist.items).toEqual([]);
    expect(hist.nextCursor).toBeNull();
  });

  it("concurrent spends cannot overdraw (serialized like FOR UPDATE)", async () => {
    const { service } = makeService();
    await service.earnPoints({
      userId: 10,
      points: 50,
      reason: "fund",
      idempotencyKey: "fund-10"
    });
    const results = await Promise.allSettled([
      service.spendPoints({ userId: 10, points: 25, reason: "a", idempotencyKey: "sp-a" }),
      service.spendPoints({ userId: 10, points: 25, reason: "b", idempotencyKey: "sp-b" }),
      service.spendPoints({ userId: 10, points: 25, reason: "c", idempotencyKey: "sp-c" })
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(2);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason).toBeInstanceOf(InsufficientPointsError);
    const bal = await service.getBalance({ userId: 10 });
    expect(bal.balancePoints).toBe("0");
  });

  it("spendPoints duplicate idempotency returns same ledger row", async () => {
    const { service, analytics } = makeService();
    await service.earnPoints({
      userId: 11,
      points: 20,
      reason: "load",
      idempotencyKey: "l11"
    });
    const first = await service.spendPoints({
      userId: 11,
      points: 5,
      reason: "buy",
      idempotencyKey: "same-spend"
    });
    const second = await service.spendPoints({
      userId: 11,
      points: 5,
      reason: "buy",
      idempotencyKey: "same-spend"
    });
    expect(second.duplicate).toBe(true);
    expect(second.ledgerEntry.id).toBe(first.ledgerEntry.id);
    expect(await service.getBalance({ userId: 11 })).toEqual({ balancePoints: "15" });
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "rewards_ledger_spend_duplicate",
      expect.objectContaining({ userId: 11 })
    );
  });

  it("reverseEntry restores balance after a spend", async () => {
    const { service } = makeService();
    await service.earnPoints({
      userId: 12,
      points: 100,
      reason: "topup",
      idempotencyKey: "t12"
    });
    const spend = await service.spendPoints({
      userId: 12,
      points: 40,
      reason: "checkout",
      idempotencyKey: "buy12"
    });
    expect(spend.ledgerEntry.deltaPoints).toBe("-40");
    const rev = await service.reverseEntry({
      userId: 12,
      originalLedgerEntryId: spend.ledgerEntry.id,
      reason: "refund",
      idempotencyKey: "rev12"
    });
    expect(rev.ledgerEntry.deltaPoints).toBe("40");
    expect(await service.getBalance({ userId: 12 })).toEqual({ balancePoints: "100" });
  });

  it("reverseEntry throws when entry belongs to another user", async () => {
    const { service } = makeService();
    const earn = await service.earnPoints({
      userId: 13,
      points: 5,
      reason: "gift",
      idempotencyKey: "g13"
    });
    await expect(
      service.reverseEntry({
        userId: 14,
        originalLedgerEntryId: earn.ledgerEntry.id,
        reason: "steal",
        idempotencyKey: "bad"
      })
    ).rejects.toBeInstanceOf(LedgerEntryNotFoundError);
  });

  it("reverseEntry rejects reversing a reversal row", async () => {
    const { service } = makeService();
    const earn = await service.earnPoints({
      userId: 15,
      points: 8,
      reason: "e",
      idempotencyKey: "e15"
    });
    const rev = await service.reverseEntry({
      userId: 15,
      originalLedgerEntryId: earn.ledgerEntry.id,
      reason: "r",
      idempotencyKey: "r15"
    });
    await expect(
      service.reverseEntry({
        userId: 15,
        originalLedgerEntryId: rev.ledgerEntry.id,
        reason: "r2",
        idempotencyKey: "r15b"
      })
    ).rejects.toBeInstanceOf(InvalidReversalError);
  });

  it("reverseEntry idempotent on same idempotency key", async () => {
    const { service, analytics } = makeService();
    const earn = await service.earnPoints({
      userId: 16,
      points: 20,
      reason: "e",
      idempotencyKey: "e16"
    });
    const first = await service.reverseEntry({
      userId: 16,
      originalLedgerEntryId: earn.ledgerEntry.id,
      reason: "fix",
      idempotencyKey: "idem-rev"
    });
    const second = await service.reverseEntry({
      userId: 16,
      originalLedgerEntryId: earn.ledgerEntry.id,
      reason: "fix",
      idempotencyKey: "idem-rev"
    });
    expect(second.duplicate).toBe(true);
    expect(second.ledgerEntry.id).toBe(first.ledgerEntry.id);
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "rewards_ledger_reverse_duplicate",
      expect.objectContaining({ userId: 16 })
    );
  });
});
