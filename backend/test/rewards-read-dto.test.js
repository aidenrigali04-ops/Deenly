const {
  toRewardsWalletMeDto,
  toRewardsLedgerPageDto,
  toRewardsLedgerEntryDto
} = require("../src/modules/rewards/rewards-read-dto");

describe("rewards-read-dto", () => {
  it("toRewardsWalletMeDto normalizes pointsDecimals and adds display keys", () => {
    const dto = toRewardsWalletMeDto({
      balancePoints: "10",
      currencyCode: "DEEN_PTS",
      pointsDecimals: 2,
      lastCatalogCheckoutRedemptionAt: null
    });
    expect(dto.pointsDecimals).toBe(2);
    expect(dto.display.balanceTitleKey).toMatch(/^rewards\.wallet\./);
    expect(dto.display.ledgerSectionTitleKey).toMatch(/^rewards\.wallet\./);
  });

  it("toRewardsWalletMeDto clamps invalid pointsDecimals to 0", () => {
    expect(
      toRewardsWalletMeDto({
        balancePoints: "0",
        currencyCode: "X",
        pointsDecimals: 99,
        lastCatalogCheckoutRedemptionAt: "2026-01-01T00:00:00.000Z"
      }).pointsDecimals
    ).toBe(0);
  });

  it("toRewardsLedgerEntryDto includes projection fields", () => {
    const row = toRewardsLedgerEntryDto({
      id: 2,
      rewardAccountId: 1,
      deltaPoints: "-5",
      entryKind: "spend",
      reason: "redemption_catalog",
      idempotencyKey: "checkout:product:1:x",
      metadata: { surface: "product_checkout", productId: 9 },
      reversesLedgerEntryId: null,
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    expect(row.ledgerReasonKey).toBe("redemption_catalog");
    expect(row.display.variant).toBe("spend");
    expect(row.display.titleKey).toBe("rewards.ledger.spend.redemption_catalog");
    expect(row.redemption?.productId).toBe(9);
    expect(row.resolvedEarnAction).toBeNull();
    expect(row.reversalOf).toBeNull();
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
    expect(dto.items[0].ledgerReasonKey).toBe("grant");
    expect(dto.items[0].display.variant).toBe("earn");
    expect(dto.items[0].display.titleKey).toBe("rewards.ledger.earn._unknown");
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
