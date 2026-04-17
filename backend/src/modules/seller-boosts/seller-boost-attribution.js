/**
 * Pure payloads for analytics / future ranking joins — no score computation.
 * Feed SQL continues to own how {@link rankModifierPoints} maps into rank_score.
 */

/**
 * Whether a purchase row should contribute seller-boost ranking modifiers at `asOf`.
 * Callers pass mapped purchase fields ({@link mapPurchaseRow} shape) or DB row aliases.
 *
 * @param {{ status: string; startsAt?: string | null; endsAt?: string | null; starts_at?: Date | string | null; ends_at?: Date | string | null }} row
 * @param {Date} [asOf]
 */
function isSellerBoostPurchaseRankingActive(row, asOf = new Date()) {
  const status = String(row.status || "");
  if (status !== "active") {
    return false;
  }
  const endsRaw = row.endsAt != null ? row.endsAt : row.ends_at;
  const startsRaw = row.startsAt != null ? row.startsAt : row.starts_at;
  if (endsRaw == null) {
    return false;
  }
  const ends = endsRaw instanceof Date ? endsRaw : new Date(endsRaw);
  if (Number.isNaN(ends.getTime()) || ends.getTime() <= asOf.getTime()) {
    return false;
  }
  if (startsRaw != null) {
    const starts = startsRaw instanceof Date ? startsRaw : new Date(startsRaw);
    if (!Number.isNaN(starts.getTime()) && starts.getTime() > asOf.getTime()) {
      return false;
    }
  }
  return true;
}

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

/**
 * Stable payload when an impression row is written — for downstream ranking/analytics correlation.
 * Does not include PII beyond ids already used in product analytics.
 *
 * @param {object} p
 * @param {number} p.purchaseId
 * @param {number} p.sellerUserId
 * @param {number} p.postId
 * @param {number | null | undefined} p.viewerUserId
 * @param {string} p.packageTierId
 * @param {number} p.rankModifierPoints catalog tier points (cap-clamped)
 * @param {{ startsAt: string | null; endsAt: string | null }} p.window
 * @param {Record<string, unknown>} [p.metadata]
 */
function buildSellerBoostImpressionAttributionPayload({
  purchaseId,
  sellerUserId,
  postId,
  viewerUserId,
  packageTierId,
  rankModifierPoints,
  window,
  metadata = {}
}) {
  return {
    kind: "seller_boost_impression",
    purchaseId,
    sellerUserId,
    postId,
    viewerUserId: viewerUserId == null ? null : Number(viewerUserId),
    packageTierId,
    rankModifierPoints,
    window,
    semantics: "modifier_only_not_override",
    metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}
  };
}

module.exports = {
  buildSellerBoostRankingContextPayload,
  buildSellerBoostImpressionAttributionPayload,
  isSellerBoostPurchaseRankingActive
};
