const {
  toRewardsWalletMeDto,
  toRewardsLedgerPageDto,
  toRewardsLedgerEntryDto
} = require("../src/modules/rewards/rewards-read-dto");

describe("rewards-read-dto", () => {
  it("toRewardsWalletMeDto normalizes pointsDecimals", () => {
    expect(
      toRewardsWalletMeDto({
        balancePoints: "10",
        currencyCode: "DEEN_PTS",
        pointsDecimals: 2,
        lastCatalogCheckoutRedemptionAt: null
      }).pointsDecimals
    ).toBe(2);
    expect(
      toRewardsWalletMeDto({
        balancePoints: "0",
        currencyCode: "X",
        pointsDecimals: 99,
        lastCatalogCheckoutRedemptionAt: "2026-01-01T00:00:00.000Z"
      }).pointsDecimals
    ).toBe(0);
  });

  it("toRewardsLedgerPageDto maps items", () => {
    const dto = toRewardsLedgerPageDto({
      items: [
        {
          id: 1,
          rewardAccountId: 9,
          deltaPoints: "5",
          entryKind: "earn",
          reason: "grant",
          idempotencyKey: "k1",
          metadata: {},
          reversesLedgerEntryId: null,
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      nextCursor: "n1"
    });
    expect(dto.items).toHaveLength(1);
    expect(dto.items[0].entryKind).toBe("earn");
    expect(dto.nextCursor).toBe("n1");
  });

  it("toRewardsLedgerEntryDto rejects unknown entryKind", () => {
    expect(() =>
      toRewardsLedgerEntryDto({
        id: 1,
        rewardAccountId: 1,
        deltaPoints: "1",
        entryKind: "bogus",
        reason: "r",
        idempotencyKey: "k",
        metadata: {},
        reversesLedgerEntryId: null,
        createdAt: "2026-01-01T00:00:00.000Z"
      })
    ).toThrow(/Invalid ledger entryKind/);
  });
});
