/**
 * @typedef {object} SellerBoostPurchaseListItemDto
 * @property {number} id
 * @property {number} sellerUserId
 * @property {string} packageTierId
 * @property {number} amountMinor
 * @property {string} currency
 * @property {string} status
 * @property {string | null} startsAt
 * @property {string | null} endsAt
 * @property {string | null} activatedAt
 * @property {string} createdAt
 * @property {number} impressionCount
 */

/**
 * @typedef {object} SellerBoostSummaryDto
 * @property {number} sellerUserId
 * @property {Record<string, number>} purchasesByStatus
 * @property {number} totalImpressions
 * @property {number} activePurchaseCount
 */

function iso(d) {
  if (!d) {
    return null;
  }
  return d instanceof Date ? d.toISOString() : String(d);
}

/** @param {object} row */
function toSellerBoostPurchaseListItemDto(row) {
  return {
    id: Number(row.id),
    sellerUserId: Number(row.seller_user_id),
    packageTierId: String(row.package_tier_id || ""),
    amountMinor: Number(row.amount_minor),
    currency: String(row.currency || "usd"),
    status: String(row.status || ""),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    activatedAt: iso(row.activated_at),
    createdAt: iso(row.created_at) || "",
    impressionCount: Number(row.impression_count || 0)
  };
}

/** @param {number} sellerUserId @param {object[]} statusRows @param {object} impRow @param {object} activeRow */
function toSellerBoostSummaryDto(sellerUserId, statusRows, impRow, activeRow) {
  /** @type {Record<string, number>} */
  const purchasesByStatus = {};
  for (const r of statusRows) {
    purchasesByStatus[String(r.status)] = Number(r.c || 0);
  }
  return {
    sellerUserId,
    purchasesByStatus,
    totalImpressions: Number(impRow?.total_impressions || 0),
    activePurchaseCount: Number(activeRow?.c || 0)
  };
}

/**
 * @param {{ query: Function }} db
 * @param {number} sellerUserId
 * @param {{ limit: number; offset: number }} page
 */
async function listSellerBoostPurchases(db, sellerUserId, { limit, offset }) {
  const res = await db.query(
    `SELECT p.*,
            COALESCE(ic.c, 0)::int AS impression_count
     FROM seller_boost_purchases p
     LEFT JOIN (
       SELECT purchase_id, COUNT(*)::int AS c
       FROM seller_boost_impressions
       GROUP BY purchase_id
     ) ic ON ic.purchase_id = p.id
     WHERE p.seller_user_id = $1
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $2 OFFSET $3`,
    [sellerUserId, limit, offset]
  );
  return res.rows.map(toSellerBoostPurchaseListItemDto);
}

/**
 * @param {{ query: Function }} db
 * @param {number} sellerUserId
 * @param {number} purchaseId
 */
async function getSellerBoostPurchaseDetail(db, sellerUserId, purchaseId) {
  const pRes = await db.query(
    `SELECT *
     FROM seller_boost_purchases
     WHERE id = $1 AND seller_user_id = $2
     LIMIT 1`,
    [purchaseId, sellerUserId]
  );
  if (pRes.rowCount === 0) {
    return null;
  }
  const row = pRes.rows[0];
  const targets = await db.query(
    `SELECT t.post_id,
            COALESCE(ic.c, 0)::int AS impression_count
     FROM seller_boost_targets t
     LEFT JOIN (
       SELECT post_id, purchase_id, COUNT(*)::int AS c
       FROM seller_boost_impressions
       GROUP BY post_id, purchase_id
     ) ic ON ic.post_id = t.post_id AND ic.purchase_id = t.purchase_id
     WHERE t.purchase_id = $1
     ORDER BY t.id ASC`,
    [purchaseId]
  );
  return {
    purchase: toSellerBoostPurchaseListItemDto({
      ...row,
      impression_count: targets.rows.reduce((a, t) => a + Number(t.impression_count || 0), 0)
    }),
    targets: targets.rows.map((t) => ({
      postId: Number(t.post_id),
      impressionCount: Number(t.impression_count || 0)
    }))
  };
}

/**
 * @param {{ query: Function }} db
 * @param {number} sellerUserId
 */
async function getSellerBoostSummary(db, sellerUserId) {
  const statusRes = await db.query(
    `SELECT status, COUNT(*)::int AS c
     FROM seller_boost_purchases
     WHERE seller_user_id = $1
     GROUP BY status`,
    [sellerUserId]
  );
  const impRes = await db.query(
    `SELECT COUNT(*)::int AS total_impressions
     FROM seller_boost_impressions i
     JOIN seller_boost_purchases p ON p.id = i.purchase_id
     WHERE p.seller_user_id = $1`,
    [sellerUserId]
  );
  const activeRes = await db.query(
    `SELECT COUNT(*)::int AS c
     FROM seller_boost_purchases
     WHERE seller_user_id = $1
       AND status = 'active'
       AND (ends_at IS NULL OR ends_at > NOW())`,
    [sellerUserId]
  );
  return toSellerBoostSummaryDto(
    sellerUserId,
    statusRes.rows,
    impRes.rows[0] || { total_impressions: 0 },
    activeRes.rows[0] || { c: 0 }
  );
}

module.exports = {
  listSellerBoostPurchases,
  getSellerBoostPurchaseDetail,
  getSellerBoostSummary,
  toSellerBoostPurchaseListItemDto,
  toSellerBoostSummaryDto
};
