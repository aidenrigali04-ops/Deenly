/**
 * Trust Service
 *
 * Composite trust score (0-1000) with five weighted components:
 * identity (30%), behavioral (25%), transaction (20%), social (15%),
 * device (10%). Bands drive penalty multipliers on ranking and
 * unlock/lock gating (redemption, boosts, payouts).
 *
 * Also manages fraud flags: creation, lifecycle, auto-action execution,
 * and admin resolution. All score changes write an audit row.
 */

const { httpError } = require("../utils/http-error");
const {
  TRUST_BANDS,
  FRAUD_FLAG_TYPES,
  FRAUD_SEVERITIES,
  FRAUD_FLAG_STATUSES,
  FRAUD_SOURCES,
} = require("../modules/rewards/constants");

const COMPONENT_WEIGHTS = Object.freeze({
  identity: 0.30,
  behavioral: 0.25,
  transaction: 0.20,
  social: 0.15,
  device: 0.10,
});

/**
 * Map a raw score to a band.
 * @param {number} score
 * @returns {string}
 */
function scoreToBand(score) {
  if (score >= 800) return "excellent";
  if (score >= 650) return "good";
  if (score >= 450) return "fair";
  if (score >= 250) return "poor";
  return "high_risk";
}

/**
 * @param {{ db, rewardConfig, ledgerService?, analytics?, logger? }} deps
 */
function createTrustService({ db, rewardConfig, ledgerService, analytics, logger }) {
  /**
   * Fetch the trust profile for a user, creating one if missing.
   * @param {number} userId
   */
  async function getProfile(userId) {
    const existing = await db.query(
      "SELECT * FROM trust_profiles WHERE user_id = $1",
      [userId]
    );
    if (existing.rowCount > 0) {
      return formatProfile(existing.rows[0]);
    }

    // Create default profile — new users start in "fair" band.
    const defaultScore = 500;
    const inserted = await db.query(
      `INSERT INTO trust_profiles
         (user_id, score, band, identity_score, behavioral_score,
          transaction_score, social_score, device_score, last_calculated_at)
       VALUES ($1, $2, $3, $2, $2, $2, $2, $2, current_timestamp)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`,
      [userId, defaultScore, scoreToBand(defaultScore)]
    );
    return formatProfile(inserted.rows[0]);
  }

  /**
   * Compute each component score for a user from raw signals.
   * Returns integer scores in 0..1000 for each component.
   * @param {number} userId
   */
  async function assessRisk(userId) {
    // Identity: email+phone verified, KYC complete
    const identityRow = await db.query(
      `SELECT
         COALESCE(email_verified, false) AS email_verified,
         COALESCE(phone_verified, false) AS phone_verified,
         COALESCE(kyc_status, 'none') AS kyc_status
       FROM users WHERE id = $1`,
      [userId]
    );
    const ident = identityRow.rows[0] || {};
    let identity = 200;
    if (ident.email_verified) identity += 200;
    if (ident.phone_verified) identity += 300;
    if (ident.kyc_status === "verified") identity += 300;
    identity = Math.min(1000, identity);

    // Behavioral: account age, post frequency, report count
    const behavioralRow = await db.query(
      `SELECT
         EXTRACT(EPOCH FROM (current_timestamp - created_at))/86400 AS age_days
       FROM users WHERE id = $1`,
      [userId]
    );
    const ageDays = Number(behavioralRow.rows[0]?.age_days || 0);
    let behavioral = Math.min(500, Math.floor(ageDays * 2));

    const reportsRow = await db.query(
      `SELECT COUNT(*)::int AS ct FROM fraud_flags
       WHERE user_id = $1 AND status = 'resolved_confirmed'`,
      [userId]
    );
    const confirmedFlags = reportsRow.rows[0]?.ct || 0;
    behavioral = Math.max(0, behavioral + 300 - confirmedFlags * 150);
    behavioral = Math.min(1000, behavioral);

    // Transaction: order count, chargeback rate
    const txRow = await db.query(
      `SELECT
         COUNT(*)::int AS order_count,
         COALESCE(SUM(CASE WHEN status = 'chargeback' THEN 1 ELSE 0 END), 0)::int AS chargebacks
       FROM orders WHERE buyer_id = $1`,
      [userId]
    );
    const orderCount = txRow.rows[0]?.order_count || 0;
    const chargebacks = txRow.rows[0]?.chargebacks || 0;
    let transaction = Math.min(800, 200 + orderCount * 30);
    transaction = Math.max(0, transaction - chargebacks * 300);
    transaction = Math.min(1000, transaction);

    // Social: followers, endorsements (approximate via follows table if exists)
    let social = 400;
    try {
      const socialRow = await db.query(
        `SELECT COUNT(*)::int AS followers FROM follows WHERE followed_id = $1`,
        [userId]
      );
      const followers = socialRow.rows[0]?.followers || 0;
      social = Math.min(1000, 400 + Math.floor(followers * 10));
    } catch (err) {
      // follows table may not exist; use default
      social = 400;
    }

    // Device: unique device count, overlap flags
    const deviceRow = await db.query(
      `SELECT COUNT(DISTINCT device_fingerprint)::int AS devices
       FROM referral_attributions WHERE referred_user_id = $1`,
      [userId]
    );
    const distinctDevices = deviceRow.rows[0]?.devices || 1;
    let device = 700;
    if (distinctDevices > 3) device -= (distinctDevices - 3) * 100;
    device = Math.max(100, Math.min(1000, device));

    const composite =
      identity * COMPONENT_WEIGHTS.identity +
      behavioral * COMPONENT_WEIGHTS.behavioral +
      transaction * COMPONENT_WEIGHTS.transaction +
      social * COMPONENT_WEIGHTS.social +
      device * COMPONENT_WEIGHTS.device;

    return {
      identity_score: Math.round(identity),
      behavioral_score: Math.round(behavioral),
      transaction_score: Math.round(transaction),
      social_score: Math.round(social),
      device_score: Math.round(device),
      score: Math.round(composite),
    };
  }

  /**
   * Recalculate a user's trust score, persist, and write an audit row.
   * @param {number} userId
   * @param {string} [trigger] e.g. "purchase_completed", "fraud_flag_created", "admin_recalc"
   */
  async function recalculateScore(userId, trigger = "system_recalc") {
    const before = await getProfile(userId);
    const components = await assessRisk(userId);
    const band = scoreToBand(components.score);

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const updated = await client.query(
        `UPDATE trust_profiles
           SET score = $2,
               band = $3,
               identity_score = $4,
               behavioral_score = $5,
               transaction_score = $6,
               social_score = $7,
               device_score = $8,
               last_calculated_at = current_timestamp,
               updated_at = current_timestamp
         WHERE user_id = $1
         RETURNING *`,
        [
          userId,
          components.score,
          band,
          components.identity_score,
          components.behavioral_score,
          components.transaction_score,
          components.social_score,
          components.device_score,
        ]
      );

      await client.query(
        `INSERT INTO trust_score_history
           (user_id, previous_score, new_score, previous_band, new_band,
            delta, trigger_reason, components_snapshot, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, current_timestamp)`,
        [
          userId,
          before.score,
          components.score,
          before.band,
          band,
          components.score - before.score,
          trigger,
          JSON.stringify(components),
        ]
      );

      await client.query("COMMIT");

      if (analytics) {
        analytics
          .track("trust.score.changed", {
            user_id: userId,
            previous_score: before.score,
            new_score: components.score,
            previous_band: before.band,
            new_band: band,
            trigger: trigger,
          })
          .catch(() => {});
      }

      return formatProfile(updated.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Create a fraud flag and execute auto-actions based on severity.
   * @param {{ userId, type, severity, source, evidence?, createdBy? }} params
   */
  async function createFlag({
    userId,
    type,
    severity,
    source,
    evidence = {},
    createdBy = null,
  }) {
    if (!FRAUD_FLAG_TYPES.includes(type)) {
      throw httpError(400, `invalid fraud flag type: ${type}`);
    }
    if (!FRAUD_SEVERITIES.includes(severity)) {
      throw httpError(400, `invalid severity: ${severity}`);
    }
    if (!FRAUD_SOURCES.includes(source)) {
      throw httpError(400, `invalid source: ${source}`);
    }

    const inserted = await db.query(
      `INSERT INTO fraud_flags
         (user_id, type, severity, status, source, evidence, created_by, created_at)
       VALUES ($1, $2, $3, 'open', $4, $5, $6, current_timestamp)
       RETURNING *`,
      [userId, type, severity, source, JSON.stringify(evidence), createdBy]
    );
    const flag = inserted.rows[0];

    // Auto-actions for high/critical severity
    if (severity === "critical") {
      await applyAutoAction(userId, "freeze_account", flag.id);
    } else if (severity === "high") {
      await applyAutoAction(userId, "suspend_earnings", flag.id);
    }

    // Recalc score after flag creation
    await recalculateScore(userId, `fraud_flag_${type}`);

    if (analytics) {
      analytics
        .track("trust.fraud.detected", {
          user_id: userId,
          flag_id: flag.id,
          type,
          severity,
          source,
        })
        .catch(() => {});
    }

    return formatFlag(flag);
  }

  async function applyAutoAction(userId, action, flagId) {
    if (action === "freeze_account") {
      await db.query(
        `UPDATE reward_accounts
            SET frozen = true,
                frozen_reason = $2,
                updated_at = current_timestamp
          WHERE user_id = $1`,
        [userId, `auto_freeze_flag_${flagId}`]
      );
    } else if (action === "suspend_earnings") {
      await db.query(
        `UPDATE reward_accounts
            SET earnings_suspended = true,
                updated_at = current_timestamp
          WHERE user_id = $1`,
        [userId]
      );
    }

    if (logger) {
      logger.warn({ userId, action, flagId }, "trust.auto_action.applied");
    }
  }

  /**
   * Resolve a fraud flag (admin action).
   * @param {{ flagId, resolution, resolvedBy, notes? }} params
   * resolution: 'resolved_confirmed' | 'resolved_dismissed'
   */
  async function resolveFlag({ flagId, resolution, resolvedBy, notes = null }) {
    if (!["resolved_confirmed", "resolved_dismissed"].includes(resolution)) {
      throw httpError(400, `invalid resolution: ${resolution}`);
    }
    const existing = await db.query(
      "SELECT * FROM fraud_flags WHERE id = $1",
      [flagId]
    );
    if (existing.rowCount === 0) throw httpError(404, "flag not found");
    const flag = existing.rows[0];
    if (flag.status !== "open" && flag.status !== "investigating") {
      throw httpError(409, "flag already resolved");
    }

    const updated = await db.query(
      `UPDATE fraud_flags
          SET status = $2,
              resolved_by = $3,
              resolved_at = current_timestamp,
              resolution_notes = $4
        WHERE id = $1
        RETURNING *`,
      [flagId, resolution, resolvedBy, notes]
    );

    // If dismissed, lift any auto-freeze caused by this flag
    if (resolution === "resolved_dismissed") {
      await db.query(
        `UPDATE reward_accounts
            SET frozen = false,
                frozen_reason = NULL,
                earnings_suspended = false,
                updated_at = current_timestamp
          WHERE user_id = $1
            AND frozen_reason = $2`,
        [flag.user_id, `auto_freeze_flag_${flagId}`]
      );
    }

    await recalculateScore(flag.user_id, `fraud_flag_resolved_${resolution}`);

    return formatFlag(updated.rows[0]);
  }

  /**
   * List fraud flags for a user or globally (admin).
   */
  async function getFlags({ userId, status, severity, limit = 50, offset = 0 } = {}) {
    const clauses = [];
    const params = [];
    let idx = 1;
    if (userId) {
      clauses.push(`user_id = $${idx++}`);
      params.push(userId);
    }
    if (status) {
      clauses.push(`status = $${idx++}`);
      params.push(status);
    }
    if (severity) {
      clauses.push(`severity = $${idx++}`);
      params.push(severity);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(limit, offset);

    const result = await db.query(
      `SELECT * FROM fraud_flags
         ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM fraud_flags ${where}`,
      params.slice(0, params.length - 2)
    );
    return {
      items: result.rows.map(formatFlag),
      total: countResult.rows[0]?.total || 0,
      limit,
      offset,
    };
  }

  /**
   * Batch recalculation for a set of users (cron job).
   * @param {{ userIds?, sinceDays? }} options
   */
  async function batchRecalculate(options = {}) {
    const { userIds, sinceDays = 7 } = options;
    let rows;
    if (userIds && userIds.length > 0) {
      const result = await db.query(
        "SELECT user_id FROM trust_profiles WHERE user_id = ANY($1)",
        [userIds]
      );
      rows = result.rows;
    } else {
      const result = await db.query(
        `SELECT user_id FROM trust_profiles
          WHERE last_calculated_at < current_timestamp - ($1 || ' days')::interval
          ORDER BY last_calculated_at ASC
          LIMIT 500`,
        [String(sinceDays)]
      );
      rows = result.rows;
    }

    let processed = 0;
    let errors = 0;
    for (const row of rows) {
      try {
        await recalculateScore(row.user_id, "batch_recalc");
        processed++;
      } catch (err) {
        errors++;
        if (logger) logger.error({ err, userId: row.user_id }, "trust.batch.error");
      }
    }
    return { processed, errors, total: rows.length };
  }

  /**
   * Penalty multiplier applied to ranking based on trust band.
   * Excellent/good: 1.0 (no penalty). Fair: 0.9. Poor: 0.7. High risk: 0.3.
   * @param {number} userId
   * @returns {Promise<number>}
   */
  async function getPenaltyMultiplier(userId) {
    const profile = await getProfile(userId);
    switch (profile.band) {
      case "excellent":
        return 1.0;
      case "good":
        return 1.0;
      case "fair":
        return 0.9;
      case "poor":
        return 0.7;
      case "high_risk":
        return 0.3;
      default:
        return 1.0;
    }
  }

  function formatProfile(row) {
    if (!row) return null;
    return {
      user_id: row.user_id,
      score: row.score,
      band: row.band,
      components: {
        identity: row.identity_score,
        behavioral: row.behavioral_score,
        transaction: row.transaction_score,
        social: row.social_score,
        device: row.device_score,
      },
      last_calculated_at: row.last_calculated_at,
      updated_at: row.updated_at,
    };
  }

  function formatFlag(row) {
    if (!row) return null;
    return {
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      severity: row.severity,
      status: row.status,
      source: row.source,
      evidence: row.evidence,
      created_by: row.created_by,
      created_at: row.created_at,
      resolved_by: row.resolved_by,
      resolved_at: row.resolved_at,
      resolution_notes: row.resolution_notes,
    };
  }

  return {
    getProfile,
    assessRisk,
    recalculateScore,
    createFlag,
    resolveFlag,
    getFlags,
    batchRecalculate,
    getPenaltyMultiplier,
  };
}

module.exports = { createTrustService, scoreToBand };
