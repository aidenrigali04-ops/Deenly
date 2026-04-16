/**
 * Seller Boost Service
 *
 * Boosts are paid ranking multipliers applied on top of organic score.
 * A boost NEVER replaces the organic score — zero organic = still zero.
 *
 * Lifecycle: draft -> active -> (paused|completed|cancelled)
 * Spend is tracked in the ledger for transparency. Trust gate enforced
 * at activation: sellers in 'poor' or 'high_risk' cannot boost.
 */

const { httpError } = require("../utils/http-error");
const {
  BOOST_TYPES,
  BOOST_STATUSES,
  BOOST_MULTIPLIERS,
  BOOST_MIN_BUDGETS,
} = require("../modules/rewards/constants");

/**
 * @param {{ db, rewardConfig, trustService, ledgerService?, analytics?, logger? }} deps
 */
function createBoostService({ db, rewardConfig, trustService, ledgerService, analytics, logger }) {
  /**
   * Create a boost in 'draft' status (not yet active).
   * @param {{ sellerId, listingId?, storeId?, type, budgetMinor, multiplier, durationHours }} params
   */
  async function createBoost({
    sellerId,
    listingId = null,
    storeId = null,
    type,
    budgetMinor,
    multiplier,
    durationHours,
  }) {
    if (!BOOST_TYPES.includes(type)) {
      throw httpError(400, `invalid boost type: ${type}`);
    }
    if (!listingId && !storeId) {
      throw httpError(400, "must specify listingId or storeId");
    }
    if (listingId && storeId) {
      throw httpError(400, "specify exactly one of listingId or storeId");
    }

    const minBudget = BOOST_MIN_BUDGETS[type];
    if (minBudget != null && budgetMinor < minBudget) {
      throw httpError(400, `budget below minimum for ${type} (${minBudget})`);
    }

    const allowed = BOOST_MULTIPLIERS[type] || [];
    if (allowed.length > 0 && !allowed.includes(multiplier)) {
      throw httpError(400, `invalid multiplier ${multiplier} for ${type}`);
    }

    if (durationHours < 1 || durationHours > 24 * 30) {
      throw httpError(400, "durationHours must be 1..720");
    }

    const result = await db.query(
      `INSERT INTO seller_boosts
         (seller_id, listing_id, store_id, type, status, budget_minor,
          spent_minor, multiplier, duration_hours, created_at)
       VALUES ($1, $2, $3, $4, 'draft', $5, 0, $6, $7, current_timestamp)
       RETURNING *`,
      [sellerId, listingId, storeId, type, budgetMinor, multiplier, durationHours]
    );

    return formatBoost(result.rows[0]);
  }

  /**
   * Activate a draft boost. Requires trust gate passage and funds check.
   * @param {{ boostId, sellerId, paymentRef? }} params
   */
  async function activateBoost({ boostId, sellerId, paymentRef = null }) {
    const existing = await db.query(
      "SELECT * FROM seller_boosts WHERE id = $1 AND seller_id = $2",
      [boostId, sellerId]
    );
    if (existing.rowCount === 0) throw httpError(404, "boost not found");
    const boost = existing.rows[0];
    if (boost.status !== "draft") {
      throw httpError(409, `cannot activate boost in status ${boost.status}`);
    }

    // Trust gate
    if (trustService) {
      const profile = await trustService.getProfile(sellerId);
      if (profile.band === "poor" || profile.band === "high_risk") {
        throw httpError(403, "seller trust band does not permit boosting");
      }
    }

    const startsAt = new Date();
    const endsAt = new Date(
      startsAt.getTime() + boost.duration_hours * 60 * 60 * 1000
    );

    const updated = await db.query(
      `UPDATE seller_boosts
          SET status = 'active',
              starts_at = $2,
              ends_at = $3,
              payment_reference = $4,
              updated_at = current_timestamp
        WHERE id = $1
        RETURNING *`,
      [boostId, startsAt, endsAt, paymentRef]
    );

    if (analytics) {
      analytics
        .track("boost.activated", {
          boost_id: boostId,
          seller_id: sellerId,
          type: boost.type,
          budget_minor: boost.budget_minor,
          multiplier: boost.multiplier,
        })
        .catch(() => {});
    }

    return formatBoost(updated.rows[0]);
  }

  /**
   * Pause an active boost. Time is frozen until resumed.
   */
  async function pauseBoost({ boostId, sellerId }) {
    const result = await db.query(
      `UPDATE seller_boosts
          SET status = 'paused', paused_at = current_timestamp, updated_at = current_timestamp
        WHERE id = $1 AND seller_id = $2 AND status = 'active'
        RETURNING *`,
      [boostId, sellerId]
    );
    if (result.rowCount === 0) {
      throw httpError(409, "cannot pause boost (not active or not owned)");
    }
    return formatBoost(result.rows[0]);
  }

  /**
   * Resume a paused boost, extending ends_at by the pause duration.
   */
  async function resumeBoost({ boostId, sellerId }) {
    const existing = await db.query(
      "SELECT * FROM seller_boosts WHERE id = $1 AND seller_id = $2",
      [boostId, sellerId]
    );
    if (existing.rowCount === 0) throw httpError(404, "boost not found");
    const boost = existing.rows[0];
    if (boost.status !== "paused") throw httpError(409, "not paused");

    const pausedMs = Date.now() - new Date(boost.paused_at).getTime();
    const newEndsAt = new Date(new Date(boost.ends_at).getTime() + pausedMs);

    const updated = await db.query(
      `UPDATE seller_boosts
          SET status = 'active', paused_at = NULL, ends_at = $2,
              updated_at = current_timestamp
        WHERE id = $1
        RETURNING *`,
      [boostId, newEndsAt]
    );
    return formatBoost(updated.rows[0]);
  }

  /**
   * Cancel a boost (seller or admin). Remaining budget is not refunded
   * automatically here — admin refund is a separate flow.
   */
  async function cancelBoost({ boostId, sellerId, reason = null }) {
    const result = await db.query(
      `UPDATE seller_boosts
          SET status = 'cancelled',
              cancelled_at = current_timestamp,
              cancel_reason = $3,
              updated_at = current_timestamp
        WHERE id = $1 AND seller_id = $2 AND status IN ('draft','active','paused')
        RETURNING *`,
      [boostId, sellerId, reason]
    );
    if (result.rowCount === 0) {
      throw httpError(409, "cannot cancel boost");
    }
    return formatBoost(result.rows[0]);
  }

  /**
   * Record spend against a boost (called when a boosted impression/click
   * triggers a charge). Returns updated boost or completes it if budget spent.
   * @param {{ boostId, amountMinor, reason }} params
   */
  async function recordSpend({ boostId, amountMinor, reason = "impression" }) {
    if (amountMinor <= 0) throw httpError(400, "amountMinor must be positive");

    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT * FROM seller_boosts WHERE id = $1 FOR UPDATE",
        [boostId]
      );
      if (rows.length === 0) throw httpError(404, "boost not found");
      const boost = rows[0];
      if (boost.status !== "active") {
        await client.query("ROLLBACK");
        return formatBoost(boost);
      }

      const remaining = boost.budget_minor - boost.spent_minor;
      const spend = Math.min(amountMinor, remaining);
      const newSpent = boost.spent_minor + spend;
      const shouldComplete = newSpent >= boost.budget_minor;

      await client.query(
        `INSERT INTO boost_spend_events
           (boost_id, amount_minor, reason, created_at)
         VALUES ($1, $2, $3, current_timestamp)`,
        [boostId, spend, reason]
      );

      const updated = await client.query(
        `UPDATE seller_boosts
            SET spent_minor = $2,
                status = CASE WHEN $3 THEN 'completed' ELSE status END,
                completed_at = CASE WHEN $3 THEN current_timestamp ELSE completed_at END,
                updated_at = current_timestamp
          WHERE id = $1
          RETURNING *`,
        [boostId, newSpent, shouldComplete]
      );

      await client.query("COMMIT");
      return formatBoost(updated.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get the active boost multiplier for a listing (or 1.0 if none).
   * @param {number|string} listingId
   * @returns {Promise<number>}
   */
  async function getListingMultiplier(listingId) {
    const result = await db.query(
      `SELECT multiplier FROM seller_boosts
        WHERE listing_id = $1
          AND status = 'active'
          AND starts_at <= current_timestamp
          AND ends_at > current_timestamp
          AND spent_minor < budget_minor
        ORDER BY multiplier DESC
        LIMIT 1`,
      [listingId]
    );
    if (result.rowCount === 0) return 1.0;
    return Number(result.rows[0].multiplier);
  }

  /**
   * Get the active boost multiplier for a store (or 1.0 if none).
   */
  async function getStoreMultiplier(storeId) {
    const result = await db.query(
      `SELECT multiplier FROM seller_boosts
        WHERE store_id = $1
          AND status = 'active'
          AND starts_at <= current_timestamp
          AND ends_at > current_timestamp
          AND spent_minor < budget_minor
        ORDER BY multiplier DESC
        LIMIT 1`,
      [storeId]
    );
    if (result.rowCount === 0) return 1.0;
    return Number(result.rows[0].multiplier);
  }

  /**
   * List boosts for a seller.
   */
  async function listBoosts({ sellerId, status, limit = 50, offset = 0 }) {
    const clauses = ["seller_id = $1"];
    const params = [sellerId];
    let idx = 2;
    if (status) {
      clauses.push(`status = $${idx++}`);
      params.push(status);
    }
    params.push(limit, offset);

    const result = await db.query(
      `SELECT * FROM seller_boosts
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    return {
      items: result.rows.map(formatBoost),
      limit,
      offset,
    };
  }

  /**
   * Get a single boost (owner view).
   */
  async function getBoost({ boostId, sellerId }) {
    const result = await db.query(
      "SELECT * FROM seller_boosts WHERE id = $1 AND seller_id = $2",
      [boostId, sellerId]
    );
    if (result.rowCount === 0) throw httpError(404, "boost not found");
    return formatBoost(result.rows[0]);
  }

  /**
   * Expire active boosts past ends_at (cron job).
   */
  async function batchExpire() {
    const result = await db.query(
      `UPDATE seller_boosts
          SET status = 'completed',
              completed_at = current_timestamp,
              updated_at = current_timestamp
        WHERE status = 'active'
          AND ends_at <= current_timestamp
        RETURNING id`
    );
    return { expired: result.rowCount };
  }

  function formatBoost(row) {
    if (!row) return null;
    return {
      id: row.id,
      seller_id: row.seller_id,
      listing_id: row.listing_id,
      store_id: row.store_id,
      type: row.type,
      status: row.status,
      budget_minor: row.budget_minor,
      spent_minor: row.spent_minor,
      remaining_minor: Math.max(0, row.budget_minor - row.spent_minor),
      multiplier: Number(row.multiplier),
      duration_hours: row.duration_hours,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      paused_at: row.paused_at,
      completed_at: row.completed_at,
      cancelled_at: row.cancelled_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  return {
    createBoost,
    activateBoost,
    pauseBoost,
    resumeBoost,
    cancelBoost,
    recordSpend,
    getListingMultiplier,
    getStoreMultiplier,
    listBoosts,
    getBoost,
    batchExpire,
  };
}

module.exports = { createBoostService };
