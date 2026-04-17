const crypto = require("node:crypto");

function generateReferralCodeCandidate(referrerUserId) {
  const frag = crypto.randomBytes(5).toString("hex");
  const base = `d${referrerUserId}r${frag}`;
  return base.slice(0, 64);
}

async function findAttributionsByOrderIdPool(db, orderId) {
  const res = await db.query(
    `SELECT id, referral_code_id, referrer_user_id, referee_user_id, status, attributed_at,
            first_qualified_order_id, clear_after_at, referrer_ledger_entry_id, referee_ledger_entry_id,
            qualified_at, void_reason, metadata, created_at, updated_at
     FROM referral_attributions
     WHERE first_qualified_order_id = $1`,
    [orderId]
  );
  return res.rows;
}

async function listPendingClearReadyPool(db, { now, limit = 50 }) {
  const res = await db.query(
    `SELECT id, referral_code_id, referrer_user_id, referee_user_id, status, attributed_at,
            first_qualified_order_id, clear_after_at, referrer_ledger_entry_id, referee_ledger_entry_id,
            qualified_at, void_reason, metadata, created_at, updated_at
     FROM referral_attributions
     WHERE status = 'pending_clear'
       AND (clear_after_at IS NULL OR clear_after_at <= $1::timestamptz)
     ORDER BY id ASC
     LIMIT $2`,
    [now instanceof Date ? now.toISOString() : String(now), limit]
  );
  return res.rows;
}

/**
 * @returns {Promise<number>} rowCount
 */
async function finalizeQualifiedReleaseOnPool(db, { attributionId, referrerLedgerEntryId, refereeLedgerEntryId }) {
  const res = await db.query(
    `UPDATE referral_attributions
     SET status = 'qualified',
         referrer_ledger_entry_id = COALESCE($2::integer, referrer_ledger_entry_id),
         referee_ledger_entry_id = COALESCE($3::integer, referee_ledger_entry_id),
         qualified_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND status = 'pending_clear'
     RETURNING id`,
    [attributionId, referrerLedgerEntryId, refereeLedgerEntryId]
  );
  return res.rowCount;
}

async function findCodeByReferrerUserIdPool(db, referrerUserId) {
  const res = await db.query(
    `SELECT id, referrer_user_id, code, status, max_redemptions, attributable_signups_count,
            created_at, updated_at
     FROM referral_codes
     WHERE referrer_user_id = $1
     LIMIT 1`,
    [referrerUserId]
  );
  return res.rowCount ? res.rows[0] : null;
}

async function findCodeByNormalizedPool(db, normalizedCode) {
  const res = await db.query(
    `SELECT id, referrer_user_id, code, status, max_redemptions, attributable_signups_count,
            created_at, updated_at
     FROM referral_codes
     WHERE lower(code) = $1
     LIMIT 1`,
    [normalizedCode]
  );
  return res.rowCount ? res.rows[0] : null;
}

async function countActiveAttributionsForCodePool(db, referralCodeId) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS c
     FROM referral_attributions
     WHERE referral_code_id = $1
       AND status IN ('pending_purchase','pending_clear','qualified')`,
    [referralCodeId]
  );
  return Number(res.rows[0]?.c || 0);
}

async function findAttributionByRefereeUserIdPool(db, refereeUserId) {
  const res = await db.query(
    `SELECT id, referral_code_id, referrer_user_id, referee_user_id, status, attributed_at,
            first_qualified_order_id, clear_after_at, referrer_ledger_entry_id, referee_ledger_entry_id,
            qualified_at, void_reason, metadata, created_at, updated_at
     FROM referral_attributions
     WHERE referee_user_id = $1
     LIMIT 1`,
    [refereeUserId]
  );
  return res.rowCount ? res.rows[0] : null;
}

async function countQualifiedReferralsForReferrerAllTimePool(db, referrerUserId) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS c
     FROM referral_attributions
     WHERE referrer_user_id = $1
       AND status = 'qualified'`,
    [referrerUserId]
  );
  return Number(res.rows[0]?.c || 0);
}

function createReferralRepository() {
  async function findCodeByNormalized(client, normalizedCode) {
    const res = await client.query(
      `SELECT id, referrer_user_id, code, status, max_redemptions, attributable_signups_count,
              created_at, updated_at
       FROM referral_codes
       WHERE lower(code) = $1
       LIMIT 1`,
      [normalizedCode]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function findCodeByReferrerUserId(client, referrerUserId) {
    const res = await client.query(
      `SELECT id, referrer_user_id, code, status, max_redemptions, attributable_signups_count,
              created_at, updated_at
       FROM referral_codes
       WHERE referrer_user_id = $1
       LIMIT 1`,
      [referrerUserId]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function insertReferralCode(client, row) {
    const res = await client.query(
      `INSERT INTO referral_codes (referrer_user_id, code, status, max_redemptions, attributable_signups_count)
       VALUES ($1, $2, $3, $4, 0)
       RETURNING id, referrer_user_id, code, status, max_redemptions, attributable_signups_count,
                 created_at, updated_at`,
      [row.referrer_user_id, row.code, row.status || "active", row.max_redemptions]
    );
    return res.rows[0];
  }

  async function countActiveAttributionsForCode(client, referralCodeId) {
    const res = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM referral_attributions
       WHERE referral_code_id = $1
         AND status IN ('pending_purchase','pending_clear','qualified')`,
      [referralCodeId]
    );
    return Number(res.rows[0]?.c || 0);
  }

  async function insertAttribution(client, row) {
    const res = await client.query(
      `INSERT INTO referral_attributions (
         referral_code_id, referrer_user_id, referee_user_id, status, metadata
       )
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, referral_code_id, referrer_user_id, referee_user_id, status, attributed_at,
                 first_qualified_order_id, clear_after_at, referrer_ledger_entry_id, referee_ledger_entry_id,
                 qualified_at, void_reason, metadata, created_at, updated_at`,
      [
        row.referral_code_id,
        row.referrer_user_id,
        row.referee_user_id,
        row.status,
        JSON.stringify(row.metadata && typeof row.metadata === "object" ? row.metadata : {})
      ]
    );
    await client.query(
      `UPDATE referral_codes
       SET attributable_signups_count = attributable_signups_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [row.referral_code_id]
    );
    return res.rows[0];
  }

  async function findAttributionByRefereeUserId(client, refereeUserId) {
    const res = await client.query(
      `SELECT id, referral_code_id, referrer_user_id, referee_user_id, status, attributed_at,
              first_qualified_order_id, clear_after_at, referrer_ledger_entry_id, referee_ledger_entry_id,
              qualified_at, void_reason, metadata, created_at, updated_at
       FROM referral_attributions
       WHERE referee_user_id = $1
       LIMIT 1`,
      [refereeUserId]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function findAttributionByIdForUpdate(client, id) {
    const res = await client.query(
      `SELECT id, referral_code_id, referrer_user_id, referee_user_id, status, attributed_at,
              first_qualified_order_id, clear_after_at, referrer_ledger_entry_id, referee_ledger_entry_id,
              qualified_at, void_reason, metadata, created_at, updated_at
       FROM referral_attributions
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function findAttributionsByOrderId(client, orderId) {
    const res = await client.query(
      `SELECT id, referral_code_id, referrer_user_id, referee_user_id, status, attributed_at,
              first_qualified_order_id, clear_after_at, referrer_ledger_entry_id, referee_ledger_entry_id,
              qualified_at, void_reason, metadata, created_at, updated_at
       FROM referral_attributions
       WHERE first_qualified_order_id = $1`,
      [orderId]
    );
    return res.rows;
  }

  async function updateAttribution(client, id, patch) {
    const fields = [];
    const vals = [];
    let i = 1;
    if (patch.status != null) {
      fields.push(`status = $${i++}`);
      vals.push(patch.status);
    }
    if (patch.first_qualified_order_id !== undefined) {
      fields.push(`first_qualified_order_id = $${i++}`);
      vals.push(patch.first_qualified_order_id);
    }
    if (patch.attributed_at !== undefined) {
      fields.push(`attributed_at = $${i++}`);
      vals.push(patch.attributed_at);
    }
    if (patch.clear_after_at !== undefined) {
      fields.push(`clear_after_at = $${i++}`);
      vals.push(patch.clear_after_at);
    }
    if (patch.referrer_ledger_entry_id !== undefined) {
      fields.push(`referrer_ledger_entry_id = $${i++}`);
      vals.push(patch.referrer_ledger_entry_id);
    }
    if (patch.referee_ledger_entry_id !== undefined) {
      fields.push(`referee_ledger_entry_id = $${i++}`);
      vals.push(patch.referee_ledger_entry_id);
    }
    if (patch.qualified_at !== undefined) {
      fields.push(`qualified_at = $${i++}`);
      vals.push(patch.qualified_at);
    }
    if (patch.void_reason !== undefined) {
      fields.push(`void_reason = $${i++}`);
      vals.push(patch.void_reason);
    }
    if (patch.metadata != null) {
      fields.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${i++}::jsonb`);
      vals.push(JSON.stringify(patch.metadata));
    }
    fields.push("updated_at = NOW()");
    vals.push(id);
    const res = await client.query(
      `UPDATE referral_attributions
       SET ${fields.join(", ")}
       WHERE id = $${i}
       RETURNING id, referral_code_id, referrer_user_id, referee_user_id, status, attributed_at,
                 first_qualified_order_id, clear_after_at, referrer_ledger_entry_id, referee_ledger_entry_id,
                 qualified_at, void_reason, metadata, created_at, updated_at`,
      vals
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function getOrderById(client, orderId) {
    const res = await client.query(
      `SELECT id, buyer_user_id, seller_user_id, status, kind, amount_minor, currency, created_at,
              stripe_payment_intent_id
       FROM orders
       WHERE id = $1
       LIMIT 1`,
      [orderId]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function findOrdersByStripePaymentIntentId(client, paymentIntentId) {
    const res = await client.query(
      `SELECT id, buyer_user_id, seller_user_id, status, kind, amount_minor, currency, created_at,
              stripe_payment_intent_id
       FROM orders
       WHERE stripe_payment_intent_id = $1`,
      [paymentIntentId]
    );
    return res.rows;
  }

  async function updateOrderStatus(client, orderId, status) {
    await client.query(`UPDATE orders SET status = $2 WHERE id = $1`, [orderId, status]);
  }

  async function countQualifiedReferralsForReferrerSince(client, referrerUserId, since) {
    const res = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM referral_attributions
       WHERE referrer_user_id = $1
         AND status = 'qualified'
         AND qualified_at IS NOT NULL
         AND qualified_at >= $2::timestamptz`,
      [referrerUserId, since]
    );
    return Number(res.rows[0]?.c || 0);
  }

  async function listPendingClearReady(client, { now, limit = 50 }) {
    const res = await client.query(
      `SELECT id, referral_code_id, referrer_user_id, referee_user_id, status, attributed_at,
              first_qualified_order_id, clear_after_at, referrer_ledger_entry_id, referee_ledger_entry_id,
              qualified_at, void_reason, metadata, created_at, updated_at
       FROM referral_attributions
       WHERE status = 'pending_clear'
         AND (clear_after_at IS NULL OR clear_after_at <= $1::timestamptz)
       ORDER BY id ASC
       LIMIT $2`,
      [now instanceof Date ? now.toISOString() : String(now), limit]
    );
    return res.rows;
  }

  return {
    finalizeQualifiedReleaseOnPool: (db, params) => finalizeQualifiedReleaseOnPool(db, params),
    findAttributionsByOrderIdPool: (db, orderId) => findAttributionsByOrderIdPool(db, orderId),
    listPendingClearReadyPool: (db, params) => listPendingClearReadyPool(db, params),
    findCodeByReferrerUserIdPool: (db, referrerUserId) => findCodeByReferrerUserIdPool(db, referrerUserId),
    findCodeByNormalizedPool: (db, normalizedCode) => findCodeByNormalizedPool(db, normalizedCode),
    countActiveAttributionsForCodePool: (db, referralCodeId) =>
      countActiveAttributionsForCodePool(db, referralCodeId),
    findAttributionByRefereeUserIdPool: (db, refereeUserId) =>
      findAttributionByRefereeUserIdPool(db, refereeUserId),
    countQualifiedReferralsForReferrerAllTimePool: (db, referrerUserId) =>
      countQualifiedReferralsForReferrerAllTimePool(db, referrerUserId),
    generateReferralCodeCandidate,
    findCodeByNormalized,
    findCodeByReferrerUserId,
    insertReferralCode,
    countActiveAttributionsForCode,
    insertAttribution,
    findAttributionByRefereeUserId,
    findAttributionByIdForUpdate,
    findAttributionsByOrderId,
    updateAttribution,
    getOrderById,
    findOrdersByStripePaymentIntentId,
    updateOrderStatus,
    countQualifiedReferralsForReferrerSince,
    listPendingClearReady
  };
}

module.exports = {
  createReferralRepository,
  generateReferralCodeCandidate,
  findAttributionsByOrderIdPool,
  listPendingClearReadyPool,
  finalizeQualifiedReleaseOnPool,
  findCodeByReferrerUserIdPool,
  findCodeByNormalizedPool,
  countActiveAttributionsForCodePool,
  findAttributionByRefereeUserIdPool,
  countQualifiedReferralsForReferrerAllTimePool
};
