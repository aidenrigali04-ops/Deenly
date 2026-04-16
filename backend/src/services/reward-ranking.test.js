const { createRankingService } = require("./reward-ranking");

function buildDeps({ boostMult = 1.0, trustMult = 1.0 } = {}) {
  return {
    boostService: {
      getListingMultiplier: async () => boostMult,
      getStoreMultiplier: async () => 1.0,
    },
    trustService: {
      getPenaltyMultiplier: async () => trustMult,
    },
  };
}

describe("reward-ranking.scoreListing", () => {
  it("returns 0 visibility when organic is 0 (boost never overrides)", async () => {
    const svc = createRankingService(buildDeps({ boostMult: 5.0, trustMult: 1.0 }));
    const r = await svc.scoreListing({ listingId: "l1", sellerId: 1, organicScore: 0 });
    expect(r.visibility_score).toBe(0);
  });

  it("multiplies organic by boost and trust", async () => {
    const svc = createRankingService(buildDeps({ boostMult: 2.0, trustMult: 0.9 }));
    const r = await svc.scoreListing({ listingId: "l1", sellerId: 1, organicScore: 100 });
    expect(r.visibility_score).toBeCloseTo(180);
  });

  it("high-risk trust penalty kills visibility to 30%", async () => {
    const svc = createRankingService(buildDeps({ boostMult: 1.0, trustMult: 0.3 }));
    const r = await svc.scoreListing({ listingId: "l1", sellerId: 1, organicScore: 100 });
    expect(r.visibility_score).toBeCloseTo(30);
  });
});

describe("reward-ranking.scoreListings (batch)", () => {
  it("sorts results by visibility descending", async () => {
    const svc = createRankingService(buildDeps({ boostMult: 1.0, trustMult: 1.0 }));
    const items = [
      { listingId: "a", sellerId: 1, organicScore: 10 },
      { listingId: "b", sellerId: 1, organicScore: 50 },
      { listingId: "c", sellerId: 1, organicScore: 0 },
    ];
    const result = await svc.scoreListings(items);
    expect(result[0].listingId).toBe("b");
    expect(result[1].listingId).toBe("a");
    expect(result[2].listingId).toBe("c");
    expect(result[2].visibility_score).toBe(0);
  });
});
