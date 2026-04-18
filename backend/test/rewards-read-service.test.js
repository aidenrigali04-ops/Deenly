const { createRewardsReadService } = require("../src/modules/rewards/rewards-read-service");
const { createRewardsLedgerService } = require("../src/modules/rewards/rewards-ledger-service");
const {
  createMemoryRewardsLedgerRepository,
  createMemoryDb
} = require("./helpers/memory-rewards-ledger-repository");

describe("createRewardsReadService", () => {
  function make() {
    const repository = createMemoryRewardsLedgerRepository();
    const db = createMemoryDb();
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const rewardsLedgerService = createRewardsLedgerService({ db, analytics, logger: null, repository });
    const config = {
      rewardsMinBalanceMinor: 0,
      rewardsMaxPointsPerRedemptionMinor: 1000,
      rewardsCooldownHoursBetweenRedemptions: 0,
      rewardsMinOrderAmountRemainingMinor: 0,
      rewardsMaxCheckoutDiscountBps: 1000,
      rewardsPointsPerFiatMinorUnit: 1
    };
    const read = createRewardsReadService({
      db,
      rewardsLedgerService,
      config,
      analytics,
      logger: null,
      lastRedemptionQuery: async () => ({ rows: [], rowCount: 0 })
    });
    return { read, rewardsLedgerService, analytics };
  }

  it("returns wallet DTO and tracks rewards_wallet_viewed", async () => {
    const { read, rewardsLedgerService, analytics } = make();
    await rewardsLedgerService.earnPoints({
      userId: 7,
      points: 42,
      reason: "test",
      idempotencyKey: "r1"
    });
    const wallet = await read.getWalletMe({ userId: 7 });
    expect(wallet.balancePoints).toBe("42");
    expect(wallet.currencyCode).toBe("DEEN_PTS");
    expect(wallet.pointsDecimals).toBe(0);
    expect(wallet.lastCatalogCheckoutRedemptionAt).toBeNull();
    expect(wallet.display.balanceTitleKey).toMatch(/^rewards\.wallet\./);
    expect(analytics.trackEvent).toHaveBeenCalledWith("rewards_wallet_viewed", { userId: 7 });
  });

  it("returns ledger page and tracks rewards_ledger_viewed", async () => {
    const { read, rewardsLedgerService, analytics } = make();
    jest.clearAllMocks();
    await rewardsLedgerService.earnPoints({
      userId: 8,
      points: 10,
      reason: "test",
      idempotencyKey: "e8"
    });
    const page = await read.getLedgerPage({ userId: 8, limit: 10 });
    expect(page.items.length).toBe(1);
    expect(page.items[0].deltaPoints).toBe("10");
    expect(page.items[0].ledgerReasonKey).toBe("test");
    expect(page.items[0].display.variant).toBe("earn");
    expect(page.items[0].reversalOf).toBeNull();
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "rewards_ledger_viewed",
      expect.objectContaining({ userId: 8, itemCount: 1 })
    );
  });
});
