const {
  buildSellerBoostImpressionAttributionPayload,
  buildSellerBoostRankingContextPayload,
  isSellerBoostPurchaseRankingActive
} = require("../src/modules/seller-boosts/seller-boost-attribution");

describe("seller-boost-attribution (pure hooks)", () => {
  const asOf = new Date("2026-03-10T12:00:00.000Z");

  it("isSellerBoostPurchaseRankingActive is true only for active window", () => {
    expect(
      isSellerBoostPurchaseRankingActive(
        {
          status: "active",
          startsAt: "2026-03-01T00:00:00.000Z",
          endsAt: "2026-03-20T00:00:00.000Z"
        },
        asOf
      )
    ).toBe(true);
    expect(
      isSellerBoostPurchaseRankingActive(
        {
          status: "active",
          startsAt: "2026-03-01T00:00:00.000Z",
          endsAt: "2026-03-05T00:00:00.000Z"
        },
        asOf
      )
    ).toBe(false);
    expect(isSellerBoostPurchaseRankingActive({ status: "pending_payment", endsAt: "2026-03-20T00:00:00.000Z" }, asOf)).toBe(
      false
    );
    expect(isSellerBoostPurchaseRankingActive({ status: "expired", endsAt: "2026-03-20T00:00:00.000Z" }, asOf)).toBe(false);
  });

  it("isSellerBoostPurchaseRankingActive accepts DB snake_case fields", () => {
    expect(
      isSellerBoostPurchaseRankingActive(
        {
          status: "active",
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-03-20T00:00:00.000Z"
        },
        asOf
      )
    ).toBe(true);
  });

  it("isSellerBoostPurchaseRankingActive is false before starts_at", () => {
    expect(
      isSellerBoostPurchaseRankingActive(
        {
          status: "active",
          startsAt: "2026-03-15T00:00:00.000Z",
          endsAt: "2026-03-20T00:00:00.000Z"
        },
        asOf
      )
    ).toBe(false);
  });

  it("buildSellerBoostRankingContextPayload marks modifier-only semantics", () => {
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
    expect(payload.semantics).toBe("modifier_only_not_override");
    expect(payload.rankModifierPoints).toBe(22);
    expect(payload.targetPostIds).toEqual([101, 102]);
  });

  it("buildSellerBoostImpressionAttributionPayload is stable for analytics ingestion", () => {
    const p = buildSellerBoostImpressionAttributionPayload({
      purchaseId: 1,
      sellerUserId: 2,
      postId: 101,
      viewerUserId: 55,
      packageTierId: "seller_rank_assist_3d",
      rankModifierPoints: 12,
      window: { startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2026-01-04T00:00:00.000Z" },
      metadata: { surface: "feed" }
    });
    expect(p.kind).toBe("seller_boost_impression");
    expect(p.semantics).toBe("modifier_only_not_override");
    expect(p.metadata).toEqual({ surface: "feed" });
  });
});
