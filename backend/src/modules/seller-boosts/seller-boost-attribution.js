/**
 * Pure payloads for analytics / future ranking joins — no score computation.
 * Feed SQL continues to own how {@link rankModifierPoints} maps into rank_score.
 */

/**
 * @param {object} p
 * @param {{ id: number; sellerUserId: number; startsAt: string | null; endsAt: string | null }} p.purchase mapped purchase
 * @param {{ id: string; rankModifierPoints: number }} p.tier resolved tier (already cap-clamped)
 * @param {readonly number[]} p.targetPostIds
 */
function buildSellerBoostRankingContextPayload({ purchase, tier, targetPostIds }) {
  return {
    purchaseId: purchase.id,
    sellerUserId: purchase.sellerUserId,
    packageTierId: tier.id,
    rankModifierPoints: tier.rankModifierPoints,
    targetPostIds: [...targetPostIds],
    window: { startsAt: purchase.startsAt, endsAt: purchase.endsAt },
    semantics: "modifier_only_not_override"
  };
}

module.exports = {
  buildSellerBoostRankingContextPayload
};
