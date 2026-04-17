const { decodeHistoryCursor, encodeHistoryCursor } = require("./balance-helpers");

function createRewardsLedgerRepository() {
  /**
   * Ensure account row exists and lock it for the transaction.
   */
  async function ensureAccountAndLock(client, userId) {
    await client.query(
      `INSERT INTO reward_accounts (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const locked = await client.query(
      `SELECT id FROM reward_accounts WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    return { id: locked.rows[0].id };
  }

  async function findByIdempotency(client, rewardAccountId, idempotencyKey) {
    const res = await client.query(
      `SELECT id,
              reward_account_id,
              delta_points,
              entry_kind,
              reason,
              idempotency_key,
              metadata,
              reverses_ledger_entry_id,
              created_at
       FROM reward_ledger_entries
       WHERE reward_account_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [rewardAccountId, idempotencyKey]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function insertLedgerEntry(client, row) {
    const res = await client.query(
      `INSERT INTO reward_ledger_entries (
         reward_account_id,
         delta_points,
         entry_kind,
         reason,
         idempotency_key,
         metadata,
         reverses_ledger_entry_id
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (reward_account_id, idempotency_key) DO NOTHING
       RETURNING id,
                 reward_account_id,
                 delta_points,
                 entry_kind,
                 reason,
                 idempotency_key,
                 metadata,
                 reverses_ledger_entry_id,
                 created_at`,
      [
        row.reward_account_id,
        row.delta_points,
        row.entry_kind,
        row.reason,
        row.idempotency_key,
        JSON.stringify(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
        row.reverses_ledger_entry_id ?? null
      ]
    );
    if (res.rowCount > 0) {
      return { inserted: true, row: res.rows[0] };
    }
    return { inserted: false, row: null };
  }

  async function selectAfterConflict(client, rewardAccountId, idempotencyKey) {
    const res = await client.query(
      `SELECT id,
              reward_account_id,
              delta_points,
              entry_kind,
              reason,
              idempotency_key,
              metadata,
              reverses_ledger_entry_id,
              created_at
       FROM reward_ledger_entries
       WHERE reward_account_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [rewardAccountId, idempotencyKey]
    );
    return res.rows[0] || null;
  }

  async function sumPointsForAccount(client, rewardAccountId) {
    const res = await client.query(
      `SELECT COALESCE(SUM(delta_points), 0)::text AS total
       FROM reward_ledger_entries
       WHERE reward_account_id = $1`,
      [rewardAccountId]
    );
    return res.rows[0]?.total ?? "0";
  }

  async function findEntryWithUser(client, ledgerEntryId) {
    const res = await client.query(
      `SELECT e.id,
              e.reward_account_id,
              e.delta_points,
              e.entry_kind,
              e.reason,
              e.idempotency_key,
              e.metadata,
              e.reverses_ledger_entry_id,
              e.created_at,
              a.user_id
       FROM reward_ledger_entries e
       JOIN reward_accounts a ON a.id = e.reward_account_id
       WHERE e.id = $1
       LIMIT 1`,
      [ledgerEntryId]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  /**
   * Serialize reversals targeting the same ledger row (pairs with partial unique index on reverses_ledger_entry_id).
   */
  async function lockLedgerEntryRowForUpdate(client, ledgerEntryId) {
    await client.query(`SELECT id FROM reward_ledger_entries WHERE id = $1 FOR UPDATE`, [ledgerEntryId]);
  }

  async function findReversalForTarget(client, targetLedgerEntryId) {
    const res = await client.query(
      `SELECT id
       FROM reward_ledger_entries
       WHERE entry_kind = 'reversal' AND reverses_ledger_entry_id = $1
       LIMIT 1`,
      [targetLedgerEntryId]
    );
    return res.rowCount ? res.rows[0] : null;
  }

  async function getBalanceForUserId(query, userId) {
    const res = await query(
      `SELECT COALESCE(SUM(e.delta_points), 0)::text AS total
       FROM reward_accounts a
       LEFT JOIN reward_ledger_entries e ON e.reward_account_id = a.id
       WHERE a.user_id = $1
       GROUP BY a.id`,
      [userId]
    );
    if (res.rowCount === 0) {
      return "0";
    }
    return res.rows[0].total ?? "0";
  }

  async function getRewardAccountIdForUser(query, userId) {
    const res = await query(`SELECT id FROM reward_accounts WHERE user_id = $1 LIMIT 1`, [userId]);
    return res.rowCount ? res.rows[0].id : null;
  }

  async function getLastCatalogCheckoutRedemptionAt(query, userId) {
    const res = await query(
      `SELECT e.created_at
       FROM reward_ledger_entries e
       JOIN reward_accounts a ON a.id = e.reward_account_id
       WHERE a.user_id = $1
         AND e.entry_kind = 'spend'
         AND e.reason = 'redemption_catalog'
         AND COALESCE(e.metadata->>'surface', '') = 'product_checkout'
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT 1`,
      [userId]
    );
    if (res.rowCount === 0) {
      return null;
    }
    const t = res.rows[0].created_at;
    return t instanceof Date ? t.toISOString() : String(t);
  }

  async function listHistoryForUser(query, userId, { cursor, limit }) {
    const accountId = await getRewardAccountIdForUser(query, userId);
    if (!accountId) {
      return { items: [], nextCursor: null };
    }
    const decoded = decodeHistoryCursor(cursor);
    const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const params = [accountId, lim];
    let sql = `SELECT id,
                      reward_account_id,
                      delta_points,
                      entry_kind,
                      reason,
                      idempotency_key,
                      metadata,
                      reverses_ledger_entry_id,
                      created_at
               FROM reward_ledger_entries
               WHERE reward_account_id = $1`;

    if (decoded) {
      sql += ` AND (created_at, id) < ($3::timestamptz, $4::int)`;
      params.push(decoded.createdAtIso, decoded.id);
    }

    sql += ` ORDER BY created_at DESC, id DESC LIMIT $2`;

    const res = await query(sql, params);
    const items = res.rows.map(mapLedgerRow);
    let nextCursor = null;
    if (items.length === lim) {
      const last = items[items.length - 1];
      const createdIso =
        last.created_at instanceof Date ? last.created_at.toISOString() : String(last.created_at);
      nextCursor = encodeHistoryCursor(createdIso, last.id);
    }
    return { items, nextCursor };
  }

  return {
    ensureAccountAndLock,
    findByIdempotency,
    insertLedgerEntry,
    selectAfterConflict,
    sumPointsForAccount,
    findEntryWithUser,
    lockLedgerEntryRowForUpdate,
    findReversalForTarget,
    getBalanceForUserId,
    getRewardAccountIdForUser,
    getLastCatalogCheckoutRedemptionAt,
    listHistoryForUser
  };
}

function mapLedgerRow(row) {
  return {
    id: row.id,
    reward_account_id: row.reward_account_id,
    delta_points: row.delta_points,
    entry_kind: row.entry_kind,
    reason: row.reason,
    idempotency_key: row.idempotency_key,
    metadata: row.metadata,
    reverses_ledger_entry_id: row.reverses_ledger_entry_id,
    created_at: row.created_at
  };
}

module.exports = {
  createRewardsLedgerRepository
};
