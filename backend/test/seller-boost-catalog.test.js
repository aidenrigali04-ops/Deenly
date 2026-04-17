const {
  listSellerBoostTiers,
  getSellerBoostTierById,
  createSellerBoostTierResolver,
  buildSellerBoostTierPointsCaseSql
} = require("../src/config/seller-boost-catalog");

describe("seller-boost-catalog", () => {
  it("lists unique tier ids", () => {
    const tiers = listSellerBoostTiers();
    const ids = tiers.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(tiers.every((t) => t.durationDays >= 1 && t.priceMinor > 0 && t.rankModifierPoints >= 0)).toBe(
      true
    );
  });

  it("resolves tier by id", () => {
    const first = listSellerBoostTiers()[0];
    expect(getSellerBoostTierById(first.id)?.id).toBe(first.id);
    expect(getSellerBoostTierById("unknown")).toBeNull();
  });

  it("createSellerBoostTierResolver clamps rankModifierPoints by config cap", () => {
    const resolve = createSellerBoostTierResolver({ sellerBoostRankModifierPointsCap: 10 });
    const t = resolve("seller_rank_assist_14d");
    expect(t).not.toBeNull();
    expect(t.rankModifierPoints).toBe(10);
    expect(t.durationDays).toBe(14);
  });

  it("buildSellerBoostTierPointsCaseSql references all tier ids", () => {
    const sql = buildSellerBoostTierPointsCaseSql();
    for (const t of listSellerBoostTiers()) {
      expect(sql).toContain(t.id);
    }
    expect(sql).toContain("CASE sbp.package_tier_id");
  });

  it("buildSellerBoostTierPointsCaseSql clamps per-tier points using sellerBoostRankModifierPointsCap", () => {
    const sql = buildSellerBoostTierPointsCaseSql({ sellerBoostRankModifierPointsCap: 10 });
    expect(sql).toContain("WHEN 'seller_rank_assist_14d' THEN 10::numeric");
    expect(sql).not.toContain("WHEN 'seller_rank_assist_14d' THEN 35::numeric");
  });
});
