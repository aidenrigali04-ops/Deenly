const { createRewardsLedgerService } = require("../src/modules/rewards/rewards-ledger-service");
const { createRewardsEarnService } = require("../src/modules/rewards/rewards-earn-service");
const { createRewardsOrderEarnHooks } = require("../src/modules/rewards/rewards-order-earn-hooks");
const {
  createMemoryRewardsLedgerRepository,
  createMemoryDb
} = require("./helpers/memory-rewards-ledger-repository");

function createOrderDb(ordersMap) {
  return {
    query: async (text, params) => {
      const t = String(text || "");
      if (t.includes("FROM orders") && t.includes("WHERE id = $1")) {
        const id = Number(params[0]);
        const row = ordersMap.get(id);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (t.includes("COUNT(*)") && t.includes("FROM orders") && t.includes("product")) {
        const buyerId = Number(params[0]);
        let c = 0;
        for (const row of ordersMap.values()) {
          if (Number(row.buyer_user_id) === buyerId && row.kind === "product" && row.status === "completed") {
            c += 1;
          }
        }
        return { rows: [{ c }], rowCount: 1 };
      }
      throw new Error(`unexpected query in order test db: ${t.slice(0, 120)}`);
    }
  };
}

describe("createRewardsOrderEarnHooks", () => {
  function harness(appConfigExtra, ordersMap) {
    const repository = createMemoryRewardsLedgerRepository();
    const mem = createMemoryDb({ serializeTransactions: true });
    const orderDb = createOrderDb(ordersMap);
    const db = {
      withTransaction: mem.withTransaction.bind(mem),
      query: orderDb.query.bind(orderDb)
    };
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const rewardsLedgerService = createRewardsLedgerService({ db, analytics, logger: null, repository });
    const appConfig = {
      referralReferrerRewardPointsMinor: 500,
      referralRefereeRewardPointsMinor: 0,
      referralMinQualifyingOrderAmountMinor: 1,
      referralQualifyingOrderKinds: ["product", "support", "subscription", "event_ticket"],
      referralAllowBuyerIsSeller: false,
      ...appConfigExtra
    };
    const rewardsEarnService = createRewardsEarnService({
      db,
      rewardsLedgerService,
      appConfig,
      logger: null,
      repository,
      loadCapSnapshotForUser: async () => ({
        dailyEarnedMinor: 0,
        monthlyEarnedMinor: 0,
        grantsLastHourCount: 0
      })
    });
    const hooks = createRewardsOrderEarnHooks({
      db,
      rewardsEarnService,
      rewardsLedgerService,
      appConfig,
      logger: null
    });
    return { hooks, rewardsLedgerService };
  }

  it("grants purchase_completed and first_product on first qualifying product order", async () => {
    const orders = new Map();
    orders.set(10, {
      id: 10,
      buyer_user_id: 5,
      seller_user_id: 99,
      kind: "product",
      amount_minor: 499,
      status: "completed"
    });
    const { hooks, rewardsLedgerService } = harness(
      {
        rewardsEarnPurchaseCompletedEnabled: true,
        rewardsEarnPurchaseCompletedPointsMinor: 100,
        rewardsEarnFirstProductOrderCompletedEnabled: true,
        rewardsEarnFirstProductOrderCompletedPointsMinor: 300
      },
      orders
    );
    const r = await hooks.afterOrderCompletedEarn({ orderId: 10 });
    expect(r.purchaseCompleted.credited).toBe(true);
    expect(r.purchaseCompleted.duplicate).toBe(false);
    expect(r.firstProductOrder.credited).toBe(true);
    const bal = await rewardsLedgerService.getBalance({ userId: 5 });
    expect(BigInt(bal.balancePoints)).toBe(BigInt(400));
    const r2 = await hooks.afterOrderCompletedEarn({ orderId: 10 });
    expect(r2.purchaseCompleted.duplicate).toBe(true);
    expect(r2.firstProductOrder.duplicate).toBe(true);
    const bal2 = await rewardsLedgerService.getBalance({ userId: 5 });
    expect(BigInt(bal2.balancePoints)).toBe(BigInt(400));
  });

  it("skips when order does not qualify (buyer is seller)", async () => {
    const orders = new Map();
    orders.set(2, {
      id: 2,
      buyer_user_id: 7,
      seller_user_id: 7,
      kind: "product",
      amount_minor: 100,
      status: "completed"
    });
    const { hooks, rewardsLedgerService } = harness(
      {
        rewardsEarnPurchaseCompletedEnabled: true,
        rewardsEarnPurchaseCompletedPointsMinor: 50,
        rewardsEarnFirstProductOrderCompletedEnabled: true,
        rewardsEarnFirstProductOrderCompletedPointsMinor: 200
      },
      orders
    );
    const r = await hooks.afterOrderCompletedEarn({ orderId: 2 });
    expect(r.skipped).toBe("buyer_is_seller");
    const bal = await rewardsLedgerService.getBalance({ userId: 7 });
    expect(BigInt(bal.balancePoints)).toBe(BigInt(0));
  });

  it("second completed product order earns purchase_completed only (not first_product)", async () => {
    const orders = new Map();
    orders.set(1, {
      id: 1,
      buyer_user_id: 8,
      seller_user_id: 20,
      kind: "product",
      amount_minor: 50,
      status: "completed"
    });
    const cfg = {
      rewardsEarnPurchaseCompletedEnabled: true,
      rewardsEarnPurchaseCompletedPointsMinor: 25,
      rewardsEarnFirstProductOrderCompletedEnabled: true,
      rewardsEarnFirstProductOrderCompletedPointsMinor: 400
    };
    const { hooks, rewardsLedgerService } = harness(cfg, orders);
    await hooks.afterOrderCompletedEarn({ orderId: 1 });
    orders.set(2, {
      id: 2,
      buyer_user_id: 8,
      seller_user_id: 21,
      kind: "product",
      amount_minor: 60,
      status: "completed"
    });
    await hooks.afterOrderCompletedEarn({ orderId: 2 });
    const bal = await rewardsLedgerService.getBalance({ userId: 8 });
    expect(BigInt(bal.balancePoints)).toBe(BigInt(450));
  });

  it("reverses purchase and first-product earns on refund hook", async () => {
    const orders = new Map();
    orders.set(30, {
      id: 30,
      buyer_user_id: 3,
      seller_user_id: 40,
      kind: "product",
      amount_minor: 200,
      status: "completed"
    });
    const { hooks, rewardsLedgerService } = harness(
      {
        rewardsEarnPurchaseCompletedEnabled: true,
        rewardsEarnPurchaseCompletedPointsMinor: 10,
        rewardsEarnFirstProductOrderCompletedEnabled: true,
        rewardsEarnFirstProductOrderCompletedPointsMinor: 20
      },
      orders
    );
    await hooks.afterOrderCompletedEarn({ orderId: 30 });
    expect(BigInt((await rewardsLedgerService.getBalance({ userId: 3 })).balancePoints)).toBe(BigInt(30));
    await hooks.reverseEarnsForRefundedOrder({ orderId: 30, buyerUserId: 3 });
    expect(BigInt((await rewardsLedgerService.getBalance({ userId: 3 })).balancePoints)).toBe(BigInt(0));
    const rev = await hooks.reverseEarnsForRefundedOrder({ orderId: 30, buyerUserId: 3 });
    expect(rev.purchaseCompleted.reversed || rev.purchaseCompleted.already).toBeTruthy();
  });

  it("writes ledger reversal reason from ledgerReversalReason (e.g. dispute)", async () => {
    const orders = new Map();
    orders.set(31, {
      id: 31,
      buyer_user_id: 3,
      seller_user_id: 40,
      kind: "product",
      amount_minor: 200,
      status: "completed"
    });
    const { hooks, rewardsLedgerService } = harness(
      {
        rewardsEarnPurchaseCompletedEnabled: true,
        rewardsEarnPurchaseCompletedPointsMinor: 11,
        rewardsEarnFirstProductOrderCompletedEnabled: true,
        rewardsEarnFirstProductOrderCompletedPointsMinor: 22
      },
      orders
    );
    await hooks.afterOrderCompletedEarn({ orderId: 31 });
    await hooks.reverseEarnsForRefundedOrder({
      orderId: 31,
      buyerUserId: 3,
      ledgerReversalReason: "order_dispute_lost"
    });
    const revRow = await rewardsLedgerService.findLedgerEntryRowByUserIdempotencyKey(
      3,
      "buyer_purchase:rev:completed:order:31"
    );
    expect(revRow && String(revRow.entry_kind)).toBe("reversal");
    expect(revRow && String(revRow.reason)).toBe("order_dispute_lost");
  });

  it("refund reversal after dispute reversal stays idempotent (single compensating row)", async () => {
    const orders = new Map();
    orders.set(32, {
      id: 32,
      buyer_user_id: 4,
      seller_user_id: 41,
      kind: "product",
      amount_minor: 100,
      status: "completed"
    });
    const { hooks, rewardsLedgerService } = harness(
      {
        rewardsEarnPurchaseCompletedEnabled: true,
        rewardsEarnPurchaseCompletedPointsMinor: 50,
        rewardsEarnFirstProductOrderCompletedEnabled: false,
        rewardsEarnFirstProductOrderCompletedPointsMinor: 0
      },
      orders
    );
    await hooks.afterOrderCompletedEarn({ orderId: 32 });
    await hooks.reverseEarnsForRefundedOrder({
      orderId: 32,
      buyerUserId: 4,
      ledgerReversalReason: "order_dispute_lost"
    });
    await hooks.reverseEarnsForRefundedOrder({
      orderId: 32,
      buyerUserId: 4,
      ledgerReversalReason: "order_refunded"
    });
    expect(BigInt((await rewardsLedgerService.getBalance({ userId: 4 })).balancePoints)).toBe(BigInt(0));
  });

  it("reversing a later order does not claw back first_product earn tied to an earlier order", async () => {
    const orders = new Map();
    orders.set(101, {
      id: 101,
      buyer_user_id: 9,
      seller_user_id: 50,
      kind: "product",
      amount_minor: 10,
      status: "completed"
    });
    const cfg = {
      rewardsEarnPurchaseCompletedEnabled: true,
      rewardsEarnPurchaseCompletedPointsMinor: 10,
      rewardsEarnFirstProductOrderCompletedEnabled: true,
      rewardsEarnFirstProductOrderCompletedPointsMinor: 90
    };
    const { hooks, rewardsLedgerService } = harness(cfg, orders);
    await hooks.afterOrderCompletedEarn({ orderId: 101 });
    orders.set(102, {
      id: 102,
      buyer_user_id: 9,
      seller_user_id: 51,
      kind: "product",
      amount_minor: 20,
      status: "completed"
    });
    await hooks.afterOrderCompletedEarn({ orderId: 102 });
    expect(BigInt((await rewardsLedgerService.getBalance({ userId: 9 })).balancePoints)).toBe(BigInt(110));
    await hooks.reverseEarnsForRefundedOrder({ orderId: 102, buyerUserId: 9 });
    expect(BigInt((await rewardsLedgerService.getBalance({ userId: 9 })).balancePoints)).toBe(BigInt(100));
  });
});
