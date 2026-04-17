function createSellerBoostRepository() {
  async function countPostsOwnedBySeller(client, postIds, sellerUserId) {
    if (!postIds.length) {
      return 0;
    }
    const res = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM posts
       WHERE id = ANY($1::int[])
         AND author_id = $2
         AND removed_at IS NULL`,
      [postIds, sellerUserId]
    );
    return Number(res.rows[0]?.c || 0);
  }

  async function findPurchaseBySellerIdempotency(client, sellerUserId, idempotencyKey) {
    const res = await client.query(
      `SELECT id,
              seller_user_id,
              checkout_session_id,
              package_tier_id,
              amount_minor,
              currency,
              status,
              starts_at,
              ends_at,
              activated_at,
              canceled_at,
              idempotency_key,
              payment_confirmation_id,
              metadata,
              created_at,
              updated_at
       FROM seller_boost_purchases
       WHERE seller_user_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [sellerUserId, idempotencyKey]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function insertPurchaseWithTargets(client, row, postIds) {
    const ins = await client.query(
      `INSERT INTO seller_boost_purchases (
         seller_user_id,
         checkout_session_id,
         package_tier_id,
         amount_minor,
         currency,
         status,
         idempotency_key,
         metadata
       )
       VALUES ($1, $2, $3, $4, $5, 'pending_payment', $6, $7::jsonb)
       RETURNING id,
                 seller_user_id,
                 checkout_session_id,
                 package_tier_id,
                 amount_minor,
                 currency,
                 status,
                 starts_at,
                 ends_at,
                 activated_at,
                 canceled_at,
                 idempotency_key,
                 payment_confirmation_id,
                 metadata,
                 created_at,
                 updated_at`,
      [
        row.seller_user_id,
        row.checkout_session_id ?? null,
        row.package_tier_id,
        row.amount_minor,
        row.currency,
        row.idempotency_key,
        JSON.stringify(row.metadata && typeof row.metadata === "object" ? row.metadata : {})
      ]
    );
    const purchaseId = ins.rows[0].id;
    for (const postId of postIds) {
      await client.query(
        `INSERT INTO seller_boost_targets (purchase_id, post_id)
         VALUES ($1, $2)
         ON CONFLICT (purchase_id, post_id) DO NOTHING`,
        [purchaseId, postId]
      );
    }
    return ins.rows[0];
  }

  async function getPurchaseByIdForSeller(client, purchaseId, sellerUserId) {
    const res = await client.query(
      `SELECT id,
              seller_user_id,
              checkout_session_id,
              package_tier_id,
              amount_minor,
              currency,
              status,
              starts_at,
              ends_at,
              activated_at,
              canceled_at,
              idempotency_key,
              payment_confirmation_id,
              metadata,
              created_at,
              updated_at
       FROM seller_boost_purchases
       WHERE id = $1 AND seller_user_id = $2
       LIMIT 1`,
      [purchaseId, sellerUserId]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function activateFromPending(client, purchaseId, sellerUserId, fields) {
    const res = await client.query(
      `UPDATE seller_boost_purchases
       SET status = 'active',
           starts_at = $1::timestamptz,
           ends_at = $2::timestamptz,
           activated_at = $3::timestamptz,
           payment_confirmation_id = COALESCE($4, payment_confirmation_id),
           checkout_session_id = COALESCE($5, checkout_session_id),
           updated_at = NOW()
       WHERE id = $6
         AND seller_user_id = $7
         AND status = 'pending_payment'
       RETURNING id,
                 seller_user_id,
                 checkout_session_id,
                 package_tier_id,
                 amount_minor,
                 currency,
                 status,
                 starts_at,
                 ends_at,
                 activated_at,
                 canceled_at,
                 idempotency_key,
                 payment_confirmation_id,
                 metadata,
                 created_at,
                 updated_at`,
      [
        fields.startsAtIso,
        fields.endsAtIso,
        fields.activatedAtIso,
        fields.paymentConfirmationId || null,
        fields.checkoutSessionId ?? null,
        purchaseId,
        sellerUserId
      ]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function cancelPending(client, purchaseId, sellerUserId) {
    const res = await client.query(
      `UPDATE seller_boost_purchases
       SET status = 'canceled',
           canceled_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND seller_user_id = $2
         AND status = 'pending_payment'
       RETURNING id`,
      [purchaseId, sellerUserId]
    );
    return res.rowCount > 0;
  }

  async function markRefunded(client, purchaseId, sellerUserId) {
    const res = await client.query(
      `UPDATE seller_boost_purchases
       SET status = 'refunded',
           updated_at = NOW()
       WHERE id = $1
         AND seller_user_id = $2
         AND status IN ('pending_payment', 'active')
       RETURNING id`,
      [purchaseId, sellerUserId]
    );
    return res.rowCount > 0;
  }

  async function expireIfDue(client, purchaseId, asOfIso) {
    const res = await client.query(
      `UPDATE seller_boost_purchases
       SET status = 'expired',
           updated_at = NOW()
       WHERE id = $1
         AND status = 'active'
         AND ends_at IS NOT NULL
         AND ends_at <= $2::timestamptz
       RETURNING id`,
      [purchaseId, asOfIso]
    );
    return res.rowCount > 0;
  }

  async function expireActiveDueBatch(client, asOfIso) {
    const res = await client.query(
      `UPDATE seller_boost_purchases
       SET status = 'expired',
           updated_at = NOW()
       WHERE status = 'active'
         AND ends_at IS NOT NULL
         AND ends_at <= $1::timestamptz
       RETURNING id`,
      [asOfIso]
    );
    return res.rows.map((r) => r.id);
  }

  async function insertImpressionIfActiveTarget(client, { purchaseId, postId, viewerUserId, metadata }) {
    const res = await client.query(
      `INSERT INTO seller_boost_impressions (purchase_id, post_id, viewer_user_id, metadata)
       SELECT $1, $2, $3, $4::jsonb
       FROM seller_boost_purchases p
       INNER JOIN seller_boost_targets t
         ON t.purchase_id = p.id AND t.post_id = $2
       WHERE p.id = $1
         AND p.status = 'active'
         AND p.ends_at IS NOT NULL
         AND p.ends_at > NOW()
       RETURNING id`,
      [
        purchaseId,
        postId,
        viewerUserId ?? null,
        JSON.stringify(metadata && typeof metadata === "object" ? metadata : {})
      ]
    );
    return res.rowCount > 0;
  }

  async function listTargetsForPurchase(client, purchaseId) {
    const res = await client.query(
      `SELECT post_id FROM seller_boost_targets WHERE purchase_id = $1 ORDER BY id ASC`,
      [purchaseId]
    );
    return res.rows.map((r) => Number(r.post_id));
  }

  async function fetchPurchaseForSeller(poolQuery, purchaseId, sellerUserId) {
    const res = await poolQuery(
      `SELECT id,
              seller_user_id,
              checkout_session_id,
              package_tier_id,
              amount_minor,
              currency,
              status,
              starts_at,
              ends_at,
              activated_at,
              canceled_at,
              idempotency_key,
              payment_confirmation_id,
              metadata,
              created_at,
              updated_at
       FROM seller_boost_purchases
       WHERE id = $1 AND seller_user_id = $2
       LIMIT 1`,
      [purchaseId, sellerUserId]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function fetchTargetsForPurchase(poolQuery, purchaseId) {
    const res = await poolQuery(
      `SELECT post_id FROM seller_boost_targets WHERE purchase_id = $1 ORDER BY id ASC`,
      [purchaseId]
    );
    return res.rows.map((r) => Number(r.post_id));
  }

  async function listPurchasesForSeller(poolQuery, sellerUserId, limit) {
    const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const res = await poolQuery(
      `SELECT id,
              seller_user_id,
              checkout_session_id,
              package_tier_id,
              amount_minor,
              currency,
              status,
              starts_at,
              ends_at,
              activated_at,
              canceled_at,
              idempotency_key,
              payment_confirmation_id,
              metadata,
              created_at,
              updated_at
       FROM seller_boost_purchases
       WHERE seller_user_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [sellerUserId, lim]
    );
    return res.rows;
  }

  return {
    countPostsOwnedBySeller,
    findPurchaseBySellerIdempotency,
    insertPurchaseWithTargets,
    getPurchaseByIdForSeller,
    activateFromPending,
    cancelPending,
    markRefunded,
    expireIfDue,
    expireActiveDueBatch,
    insertImpressionIfActiveTarget,
    listTargetsForPurchase,
    fetchPurchaseForSeller,
    fetchTargetsForPurchase,
    listPurchasesForSeller
  };
}

module.exports = {
  createSellerBoostRepository
};
