const { createRewardsLedgerService } = require("../src/modules/rewards/rewards-ledger-service");
const {
  createMemoryRewardsLedgerRepository,
  createMemoryDb
} = require("./helpers/memory-rewards-ledger-repository");

describe("checkout redemption ledger", () => {
  function makeService() {
    const repository = createMemoryRewardsLedgerRepository();
    const db = createMemoryDb();
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const service = createRewardsLedgerService({ db, analytics, logger: null, repository });
    return { service, analytics, repository };
  }

  it("spend then reverse restores balance (refund-style)", async () => {
    const { service } = makeService();
    await service.earnPoints({
      userId: 9,
      points: 2000,
      reason: "test_credit",
      idempotencyKey: "earn-checkout-9"
    });
    const spend = await service.spendPoints({
      userId: 9,
      points: 500,
      reason: "redemption_catalog",
      idempotencyKey: "checkout:product:9:req-test-uuid",
      metadata: { surface: "product_checkout", productId: 1 }
    });
    expect(spend.duplicate).toBe(false);
    const rev = await service.reverseEntry({
      userId: 9,
      originalLedgerEntryId: spend.ledgerEntry.id,
      reason: "checkout_refund",
      idempotencyKey: "reverse:refund:9:1",
      metadata: { surface: "product_checkout" }
    });
    expect(rev.duplicate).toBe(false);
    const bal = await service.getBalance({ userId: 9 });
    expect(bal.balancePoints).toBe("2000");
  });

  it("reverse is idempotent", async () => {
    const { service } = makeService();
    await service.earnPoints({
      userId: 10,
      points: 800,
      reason: "test_credit",
      idempotencyKey: "earn-checkout-10"
    });
    const spend = await service.spendPoints({
      userId: 10,
      points: 200,
      reason: "redemption_catalog",
      idempotencyKey: "checkout:product:10:req-idem",
      metadata: { surface: "product_checkout" }
    });
    const idem = "reverse:idem:10";
    await service.reverseEntry({
      userId: 10,
      originalLedgerEntryId: spend.ledgerEntry.id,
      reason: "checkout_expired",
      idempotencyKey: idem,
      metadata: {}
    });
    const second = await service.reverseEntry({
      userId: 10,
      originalLedgerEntryId: spend.ledgerEntry.id,
      reason: "checkout_expired",
      idempotencyKey: idem,
      metadata: {}
    });
    expect(second.duplicate).toBe(true);
    const bal = await service.getBalance({ userId: 10 });
    expect(bal.balancePoints).toBe("800");
  });
});
