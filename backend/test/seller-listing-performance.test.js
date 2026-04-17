const { listSellerListingPerformance } = require("../src/modules/creator/seller-listing-performance");

describe("listSellerListingPerformance", () => {
  it("maps product listing performance rows", async () => {
    const db = {
      query: jest.fn(async () => ({
        rows: [
          {
            product_id: 10,
            title: "Digital guide",
            product_status: "published",
            price_minor: 499,
            currency: "usd",
            view_count: 12,
            completed_order_count: 2,
            gross_minor: 900,
            boost_impression_count: 4
          }
        ]
      }))
    };
    const items = await listSellerListingPerformance(db, 3, { limit: 20, offset: 0 });
    expect(db.query).toHaveBeenCalled();
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(10);
    expect(items[0].viewCount).toBe(12);
    expect(items[0].grossMinor).toBe(900);
    expect(items[0].boostImpressionCount).toBe(4);
  });
});
