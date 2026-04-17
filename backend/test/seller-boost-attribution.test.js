const { buildSellerBoostRankingContextPayload } = require("../src/modules/seller-boosts/seller-boost-attribution");

describe("seller-boost-attribution", () => {
  it("buildSellerBoostRankingContextPayload is pure and modifier-only", () => {
    const payload = buildSellerBoostRankingContextPayload({
      purchase: {
        id: 9,
        sellerUserId: 3,
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: "2026-01-08T00:00:00.000Z"
      },
      tier: { id: "seller_rank_assist_7d", rankModifierPoints: 22 },
      targetPostIds: [101, 102]
    });
    expect(payload).toEqual({
      purchaseId: 9,
      sellerUserId: 3,
      packageTierId: "seller_rank_assist_7d",
      rankModifierPoints: 22,
      targetPostIds: [101, 102],
      window: {
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: "2026-01-08T00:00:00.000Z"
      },
      semantics: "modifier_only_not_override"
    });
  });
});
