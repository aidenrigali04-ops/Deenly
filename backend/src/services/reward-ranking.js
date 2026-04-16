/**
 * Ranking Service
 *
 * Computes the final visibility score for listings/stores by combining:
 *   visibility_score = organic_score × boost_multiplier × trust_penalty
 *
 * Rules:
 *   - organic_score == 0 → visibility_score == 0 (boosts never override)
 *   - trust penalty from seller's trust band (poor/high_risk are throttled)
 *   - boost multiplier only for active, in-window, unspent boosts
 *
 * This service is pure composition over boostService + trustService + an
 * organic score supplier. It does not read listings directly — callers
 * pass in the organic score per item.
 */

/**
 * @param {{ boostService, trustService, rewardConfig?, logger? }} deps
 */
function createRankingService({ boostService, trustService, rewardConfig, logger }) {
  /**
   * Compute visibility score for a single listing.
   * @param {{ listingId, sellerId, organicScore }} params
   */
  async function scoreListing({ listingId, sellerId, organicScore }) {
    if (!organicScore || organicScore <= 0) {
      return {
        visibility_score: 0,
        organic_score: organicScore || 0,
        boost_multiplier: 1.0,
        trust_multiplier: 1.0,
      };
    }

    const [boostMult, trustMult] = await Promise.all([
      boostService.getListingMultiplier(listingId),
      trustService.getPenaltyMultiplier(sellerId),
    ]);

    const visibility = organicScore * boostMult * trustMult;
    return {
      visibility_score: visibility,
      organic_score: organicScore,
      boost_multiplier: boostMult,
      trust_multiplier: trustMult,
    };
  }

  /**
   * Compute visibility scores for a batch of listings.
   * Caller supplies: [{ listingId, sellerId, organicScore }]
   * Returns: same array with visibility_score + multipliers added, sorted desc.
   */
  async function scoreListings(items) {
    if (!Array.isArray(items) || items.length === 0) return [];

    // Unique seller trust lookups
    const sellerIds = [...new Set(items.map((i) => i.sellerId))];
    const trustMap = new Map();
    await Promise.all(
      sellerIds.map(async (sid) => {
        trustMap.set(sid, await trustService.getPenaltyMultiplier(sid));
      })
    );

    // Unique listing boost lookups
    const listingIds = [...new Set(items.map((i) => i.listingId))];
    const boostMap = new Map();
    await Promise.all(
      listingIds.map(async (lid) => {
        boostMap.set(lid, await boostService.getListingMultiplier(lid));
      })
    );

    const scored = items.map((item) => {
      const organic = Number(item.organicScore || 0);
      if (organic <= 0) {
        return {
          ...item,
          visibility_score: 0,
          boost_multiplier: 1.0,
          trust_multiplier: 1.0,
        };
      }
      const boostMult = boostMap.get(item.listingId) || 1.0;
      const trustMult = trustMap.get(item.sellerId) || 1.0;
      return {
        ...item,
        visibility_score: organic * boostMult * trustMult,
        boost_multiplier: boostMult,
        trust_multiplier: trustMult,
      };
    });

    scored.sort((a, b) => b.visibility_score - a.visibility_score);
    return scored;
  }

  /**
   * Apply ranking to listings already fetched from DB.
   * Convenience wrapper for route handlers.
   * @param {Array<object>} listings Objects with id, seller_id, organic_score
   */
  async function applyRanking(listings) {
    const input = listings.map((l) => ({
      listingId: l.id,
      sellerId: l.seller_id,
      organicScore: l.organic_score ?? l.score ?? 0,
      _original: l,
    }));
    const scored = await scoreListings(input);
    return scored.map((s) => ({
      ...s._original,
      visibility_score: s.visibility_score,
      boost_multiplier: s.boost_multiplier,
      trust_multiplier: s.trust_multiplier,
    }));
  }

  return {
    scoreListing,
    scoreListings,
    applyRanking,
  };
}

module.exports = { createRankingService };
