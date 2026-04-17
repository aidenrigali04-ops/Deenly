/**
 * @typedef {object} SellerListingPerformanceItemDto
 * @property {number} productId
 * @property {string} title
 * @property {string} productStatus
 * @property {number} priceMinor
 * @property {string} currency
 * @property {number} viewCount
 * @property {number} completedOrderCount
 * @property {number} grossMinor
 * @property {number} boostImpressionCount
 */

/** @param {object} row */
function toSellerListingPerformanceItemDto(row) {
  return {
    productId: Number(row.product_id),
    title: String(row.title || ""),
    productStatus: String(row.product_status || ""),
    priceMinor: Number(row.price_minor || 0),
    currency: String(row.currency || "usd"),
    viewCount: Number(row.view_count || 0),
    completedOrderCount: Number(row.completed_order_count || 0),
    grossMinor: Number(row.gross_minor || 0),
    boostImpressionCount: Number(row.boost_impression_count || 0)
  };
}

/**
 * Per-product listing funnel for the authenticated seller (views on linked posts, completed orders).
 *
 * @param {{ query: Function }} db
 * @param {number} sellerUserId
 * @param {{ limit: number; offset: number }} page
 * @returns {Promise<SellerListingPerformanceItemDto[]>}
 */
async function listSellerListingPerformance(db, sellerUserId, { limit, offset }) {
  const res = await db.query(
    `SELECT cp.id AS product_id,
            cp.title,
            cp.status AS product_status,
            cp.price_minor,
            cp.currency,
            (SELECT COUNT(*)::int
             FROM post_product_links ppl
             JOIN post_views pv ON pv.post_id = ppl.post_id
             WHERE ppl.product_id = cp.id) AS view_count,
            (SELECT COUNT(*)::int
             FROM orders o
             WHERE o.product_id = cp.id
               AND o.seller_user_id = cp.creator_user_id
               AND o.status = 'completed') AS completed_order_count,
            (SELECT COALESCE(SUM(o.amount_minor), 0)::int
             FROM orders o
             WHERE o.product_id = cp.id
               AND o.seller_user_id = cp.creator_user_id
               AND o.status = 'completed') AS gross_minor,
            (SELECT COUNT(*)::int
             FROM seller_boost_impressions i
             INNER JOIN post_product_links ppl ON ppl.post_id = i.post_id
             WHERE ppl.product_id = cp.id) AS boost_impression_count
     FROM creator_products cp
     WHERE cp.creator_user_id = $1
     ORDER BY cp.updated_at DESC NULLS LAST, cp.id DESC
     LIMIT $2 OFFSET $3`,
    [sellerUserId, limit, offset]
  );
  return res.rows.map(toSellerListingPerformanceItemDto);
}

module.exports = {
  listSellerListingPerformance,
  toSellerListingPerformanceItemDto
};
