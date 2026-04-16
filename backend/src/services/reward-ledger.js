/**
 * Reward Ledger Service
 *
 * The core of the entire rewards system. All point mutations go through this
 * service. No other file writes to `reward_ledger_entries` or modifies
 * `reward_accounts.balance`.
 *
 * Critical invariants:
 * 1. Every credit/debit runs inside a transaction with SELECT ... FOR UPDATE
 * 2. balance_after is computed from the locked account balance, not cached
 * 3. Idempotency keys prevent duplicate credits on retries
 * 4. Daily caps are enforced within the same transaction
 * 5. The reward_accounts.balance is updated in the SAME transaction as the ledger INSERT
 */

const { LEDGER_CREDIT_SOURCES, LEDGER_DEBIT_SOURCES } = require("../modules/rewards/constants");
const { httpError } = require("../utils/http-error");

/**
 * @param {{ db: object, config: object, rewardConfig: object, logger?: object, analytics?: object }} deps
 */
function createRewardLedgerService({ db, config, rewardConfig, logger, analytics }) {
  /**
   * Ensure a reward_accounts row exists. Creates with defaults if missing.
   * @param {number} userId
   * @param {object} [client] optional pg client (for use inside a transaction)
   * @returns {Promise<object>} the account row
   */
  async function ensureAccount(userId, client) {
    const queryFn = client || db;
    const existing = await queryFn.query(
      "SELECT * FROM reward_accounts WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if (existing.rowCount > 0) {
      return existing.rows[0];
    }

    const inserted = await queryFn.query(
      `INSERT INTO reward_accounts (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [userId]
    );
    if (inserted.rowCount > 0) {
      return inserted.rows[0];
    }

    // Race condition: another transaction inserted between SELECT and INSERT
    const retry = await queryFn.query(
      "SELECT * FROM reward_accounts WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    return retry.rows[0];
  }

  /**
   * Get the current daily earn status for a user.
   * Handles date rollover: if the stored date is not today, treat as 0 earned.
   *
   * @param {number} userId
   * @returns {Promise<{ earnedToday: number, capToday: number, remaining: number, todayDate: string }>}
   */
  async function getDailyEarnStatus(userId) {
    const account = await ensureAccount(userId);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let earnedToday = 0;
    if (account.points_earned_today_date === today) {
      earnedToday = account.points_earned_today;
    }

    const capToday = await rewardConfig.getDailyEarnCap(account.tier);
    const remaining = Math.max(0, capToday - earnedToday);

    return { earnedToday, capToday, remaining, todayDate: today };
  }

  /**
   * Check velocity limits for a user.
   * @param {number} userId
   * @returns {Promise<{ withinLimits: boolean, txnsLastHour: number, txnsToday: number }>}
   */
  async function checkVelocity(userId) {
    const maxPerHour = await rewardConfig.getNumber("velocity_max_transactions_per_hour");
    const maxPerDay = await rewardConfig.getNumber("velocity_max_transactions_per_day");

    const hourResult = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM reward_ledger_entries
       WHERE user_id = $1 AND type = 'credit' AND created_at > NOW() - interval '1 hour'
       AND voided_at IS NULL`,
      [userId]
    );
    const dayResult = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM reward_ledger_entries
       WHERE user_id = $1 AND type = 'credit' AND created_at > NOW() - interval '1 day'
       AND voided_at IS NULL`,
      [userId]
    );

    const txnsLastHour = hourResult.rows[0].cnt;
    const txnsToday = dayResult.rows[0].cnt;
    const withinLimits = txnsLastHour < maxPerHour && txnsToday < maxPerDay;

    return { withinLimits, txnsLastHour, txnsToday };
  }

  /**
   * Credit points to a user's account.
   *
   * @param {{
   *   userId: number,
   *   amount: number,
   *   source: string,
   *   sourceRefType?: string,
   *   sourceRefId?: string,
   *   description?: string,
   *   tierAtTime?: string,
   *   multiplierApplied?: number,
   *   idempotencyKey?: string,
   *   metadata?: object,
   *   expiresAt?: Date,
   *   skipDailyCap?: boolean
   * }} params
   * @returns {Promise<{
   *   ledgerEntryId: string,
   *   amount: number,
   *   balanceAfter: number,
   *   wasCapped: boolean,
   *   capRemaining: number
   * }>}
   */
  async function creditPoints(params) {
    const {
      userId,
      amount,
      source,
      sourceRefType = null,
      sourceRefId = null,
      description = null,
      tierAtTime = null,
      multiplierApplied = 1.0,
      idempotencyKey = null,
      metadata = {},
      expiresAt = null,
      skipDailyCap = false
    } = params;

    if (!LEDGER_CREDIT_SOURCES.includes(source)) {
      throw httpError(400, `Invalid credit source: ${source}`);
    }
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw httpError(400, "Credit amount must be a positive integer");
    }

    // Check idempotency
    if (idempotencyKey) {
      const existing = await db.query(
        `SELECT id, amount, balance_after FROM reward_ledger_entries
         WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
      );
      if (existing.rowCount > 0) {
        const row = existing.rows[0];
        return {
          ledgerEntryId: row.id,
          amount: row.amount,
          balanceAfter: row.balance_after,
          wasCapped: false,
          capRemaining: 0
        };
      }
    }

    // Run in transaction with row-level lock
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // Lock the account row
      const accountResult = await client.query(
        "SELECT * FROM reward_accounts WHERE user_id = $1 FOR UPDATE",
        [userId]
      );

      let account;
      if (accountResult.rowCount === 0) {
        account = await ensureAccount(userId, client);
        // Re-lock after creation
        const reLock = await client.query(
          "SELECT * FROM reward_accounts WHERE user_id = $1 FOR UPDATE",
          [userId]
        );
        account = reLock.rows[0];
      } else {
        account = accountResult.rows[0];
      }

      // Check frozen
      if (account.is_frozen) {
        await client.query("ROLLBACK");
        throw httpError(403, "Your reward account is frozen. Contact support.");
      }

      // Daily cap enforcement
      const today = new Date().toISOString().slice(0, 10);
      let earnedToday = 0;
      if (account.points_earned_today_date === today) {
        earnedToday = account.points_earned_today;
      }

      const dailyCap = await rewardConfig.getDailyEarnCap(account.tier);
      let actualAmount = amount;
      let wasCapped = false;

      if (!skipDailyCap) {
        const remaining = Math.max(0, dailyCap - earnedToday);
        if (remaining <= 0) {
          await client.query("ROLLBACK");
          // Return zero-earn result (not an error — silent cap)
          return {
            ledgerEntryId: null,
            amount: 0,
            balanceAfter: account.balance,
            wasCapped: true,
            capRemaining: 0
          };
        }
        if (actualAmount > remaining) {
          actualAmount = remaining;
          wasCapped = true;
        }
      }

      const newBalance = account.balance + actualAmount;
      const newLifetimeEarned = account.lifetime_earned + actualAmount;
      const newEarnedToday = (account.points_earned_today_date === today)
        ? account.points_earned_today + actualAmount
        : actualAmount;

      // Insert ledger entry
      const entryResult = await client.query(
        `INSERT INTO reward_ledger_entries
         (user_id, type, amount, balance_after, source, source_ref_type, source_ref_id,
          description, tier_at_time, multiplier_applied, idempotency_key, metadata, expires_at)
         VALUES ($1, 'credit', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
         RETURNING id`,
        [
          userId, actualAmount, newBalance, source, sourceRefType, sourceRefId,
          description, tierAtTime || account.tier, multiplierApplied,
          idempotencyKey, JSON.stringify(metadata), expiresAt
        ]
      );

      // Update account
      await client.query(
        `UPDATE reward_accounts SET
           balance = $1,
           lifetime_earned = $2,
           points_earned_today = $3,
           points_earned_today_date = $4,
           rolling_12m_points = rolling_12m_points + $5,
           last_activity_at = current_timestamp,
           updated_at = current_timestamp
         WHERE user_id = $6`,
        [newBalance, newLifetimeEarned, newEarnedToday, today, actualAmount, userId]
      );

      await client.query("COMMIT");

      // Fire analytics (non-blocking)
      if (analytics) {
        analytics.trackEvent("rewards.points.earned", {
          user_id: userId,
          amount: actualAmount,
          source,
          reference_id: sourceRefId,
          balance_after: newBalance,
          multiplier_applied: multiplierApplied,
          tier_at_earn: tierAtTime || account.tier
        });
      }

      return {
        ledgerEntryId: entryResult.rows[0].id,
        amount: actualAmount,
        balanceAfter: newBalance,
        wasCapped,
        capRemaining: Math.max(0, dailyCap - newEarnedToday)
      };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Debit points from a user's account.
   *
   * @param {{
   *   userId: number,
   *   amount: number,
   *   source: string,
   *   sourceRefType?: string,
   *   sourceRefId?: string,
   *   description?: string,
   *   idempotencyKey?: string,
   *   metadata?: object
   * }} params
   * @returns {Promise<{ ledgerEntryId: string, amount: number, balanceAfter: number }>}
   */
  async function debitPoints(params) {
    const {
      userId,
      amount,
      source,
      sourceRefType = null,
      sourceRefId = null,
      description = null,
      idempotencyKey = null,
      metadata = {}
    } = params;

    if (!LEDGER_DEBIT_SOURCES.includes(source)) {
      throw httpError(400, `Invalid debit source: ${source}`);
    }
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw httpError(400, "Debit amount must be a positive integer");
    }

    // Check idempotency
    if (idempotencyKey) {
      const existing = await db.query(
        `SELECT id, amount, balance_after FROM reward_ledger_entries
         WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
      );
      if (existing.rowCount > 0) {
        const row = existing.rows[0];
        return {
          ledgerEntryId: row.id,
          amount: row.amount,
          balanceAfter: row.balance_after
        };
      }
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const accountResult = await client.query(
        "SELECT * FROM reward_accounts WHERE user_id = $1 FOR UPDATE",
        [userId]
      );

      if (accountResult.rowCount === 0) {
        await client.query("ROLLBACK");
        throw httpError(404, "Reward account not found");
      }

      const account = accountResult.rows[0];

      if (account.is_frozen && source !== "fraud_void" && source !== "refund_clawback") {
        await client.query("ROLLBACK");
        throw httpError(403, "Your reward account is frozen. Contact support.");
      }

      if (account.balance < amount) {
        await client.query("ROLLBACK");
        throw httpError(
          422,
          `Insufficient balance. You need at least ${amount} DP. Current balance: ${account.balance} DP`
        );
      }

      const newBalance = account.balance - amount;
      const newLifetimeRedeemed = source === "redemption"
        ? account.lifetime_redeemed + amount
        : account.lifetime_redeemed;

      const entryResult = await client.query(
        `INSERT INTO reward_ledger_entries
         (user_id, type, amount, balance_after, source, source_ref_type, source_ref_id,
          description, tier_at_time, idempotency_key, metadata)
         VALUES ($1, 'debit', $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         RETURNING id`,
        [
          userId, amount, newBalance, source, sourceRefType, sourceRefId,
          description, account.tier, idempotencyKey, JSON.stringify(metadata)
        ]
      );

      await client.query(
        `UPDATE reward_accounts SET
           balance = $1,
           lifetime_redeemed = $2,
           last_activity_at = current_timestamp,
           updated_at = current_timestamp
         WHERE user_id = $3`,
        [newBalance, newLifetimeRedeemed, userId]
      );

      await client.query("COMMIT");

      if (analytics) {
        const eventName = source === "redemption"
          ? "rewards.points.redeemed"
          : source === "expiration"
            ? "rewards.points.expired"
            : "rewards.points.debited";
        analytics.trackEvent(eventName, {
          user_id: userId,
          amount,
          source,
          reference_id: sourceRefId,
          balance_after: newBalance
        });
      }

      return {
        ledgerEntryId: entryResult.rows[0].id,
        amount,
        balanceAfter: newBalance
      };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Void a specific ledger entry. Sets voided_at and creates an offsetting entry.
   *
   * @param {{
   *   ledgerEntryId: string,
   *   reason: string,
   *   voidedBy?: number
   * }} params
   * @returns {Promise<{ voidedEntryId: string, offsetEntryId: string, amount: number, balanceAfter: number }>}
   */
  async function voidEntry(params) {
    const { ledgerEntryId, reason, voidedBy = null } = params;

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // Lock the original entry's user account
      const entryResult = await client.query(
        "SELECT * FROM reward_ledger_entries WHERE id = $1 LIMIT 1",
        [ledgerEntryId]
      );

      if (entryResult.rowCount === 0) {
        await client.query("ROLLBACK");
        throw httpError(404, "Ledger entry not found");
      }

      const entry = entryResult.rows[0];
      if (entry.voided_at) {
        await client.query("ROLLBACK");
        throw httpError(409, "This ledger entry has already been voided");
      }

      // Lock the account
      const accountResult = await client.query(
        "SELECT * FROM reward_accounts WHERE user_id = $1 FOR UPDATE",
        [entry.user_id]
      );
      const account = accountResult.rows[0];

      // Mark original as voided
      await client.query(
        "UPDATE reward_ledger_entries SET voided_at = current_timestamp, voided_reason = $1 WHERE id = $2",
        [reason, ledgerEntryId]
      );

      // Create offsetting entry
      const offsetType = entry.type === "credit" ? "debit" : "credit";
      const offsetSource = entry.type === "credit" ? "fraud_void" : "manual_credit";

      let newBalance;
      if (entry.type === "credit") {
        // Voiding a credit: reduce balance
        newBalance = account.balance - entry.amount;
        if (newBalance < 0) {
          newBalance = 0; // Defensive — shouldn't happen but protect invariant
        }
      } else {
        // Voiding a debit: restore balance
        newBalance = account.balance + entry.amount;
      }

      const offsetResult = await client.query(
        `INSERT INTO reward_ledger_entries
         (user_id, type, amount, balance_after, source, source_ref_type, source_ref_id,
          description, tier_at_time, metadata)
         VALUES ($1, $2, $3, $4, $5, 'ledger_entry', $6, $7, $8, $9::jsonb)
         RETURNING id`,
        [
          entry.user_id, offsetType, entry.amount, newBalance, offsetSource,
          ledgerEntryId,
          `Void: ${reason}`,
          account.tier,
          JSON.stringify({ voided_entry_id: ledgerEntryId, voided_by: voidedBy })
        ]
      );

      // Update account balance
      await client.query(
        `UPDATE reward_accounts SET
           balance = $1,
           last_activity_at = current_timestamp,
           updated_at = current_timestamp
         WHERE user_id = $2`,
        [newBalance, entry.user_id]
      );

      await client.query("COMMIT");

      if (analytics) {
        analytics.trackEvent("rewards.points.voided", {
          user_id: entry.user_id,
          voided_entry_id: ledgerEntryId,
          amount: entry.amount,
          reason,
          voided_by: voidedBy
        });
      }

      return {
        voidedEntryId: ledgerEntryId,
        offsetEntryId: offsetResult.rows[0].id,
        amount: entry.amount,
        balanceAfter: newBalance
      };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get the current account state for a user. Auto-creates if missing.
   *
   * @param {number} userId
   * @returns {Promise<object>} full account state with computed fields
   */
  async function getAccountState(userId) {
    const account = await ensureAccount(userId);
    const today = new Date().toISOString().slice(0, 10);

    const earnedToday = (account.points_earned_today_date === today)
      ? account.points_earned_today
      : 0;
    const capToday = await rewardConfig.getDailyEarnCap(account.tier);
    const tierMultiplier = await rewardConfig.getTierMultiplier(account.tier);
    const streakMultiplier = await rewardConfig.getStreakMultiplier(account.streak_current);

    // Determine next tier
    const { TIERS, TIER_ORDER } = require("../modules/rewards/constants");
    const currentIdx = TIER_ORDER[account.tier];
    const nextTier = currentIdx < TIERS.length - 1 ? TIERS[currentIdx + 1] : null;
    const nextThreshold = nextTier
      ? await rewardConfig.getTierThreshold(nextTier)
      : null;

    return {
      user_id: account.user_id,
      balance: account.balance,
      balance_dollar_value_minor: account.balance, // 1 DP = 1 cent
      lifetime_earned: account.lifetime_earned,
      lifetime_redeemed: account.lifetime_redeemed,
      tier: account.tier,
      tier_multiplier: tierMultiplier,
      tier_next: nextTier,
      tier_next_threshold: nextThreshold,
      tier_progress_points: account.rolling_12m_points,
      tier_qualified_at: account.tier_qualified_at,
      rolling_12m_points: account.rolling_12m_points,
      streak: {
        current: account.streak_current,
        longest: account.streak_longest,
        multiplier: Number(account.streak_multiplier),
        shields_remaining: account.streak_shields_remaining,
        last_checkin_date: account.streak_last_checkin_date,
        checked_in_today: account.streak_last_checkin_date === today
      },
      daily_earn: {
        earned_today: earnedToday,
        cap_today: capToday,
        remaining_today: Math.max(0, capToday - earnedToday)
      },
      is_frozen: account.is_frozen,
      last_activity_at: account.last_activity_at
    };
  }

  /**
   * Get paginated ledger history for a user.
   *
   * @param {{
   *   userId: number,
   *   limit?: number,
   *   cursor?: { createdAt: string, id: string }|null,
   *   type?: string,
   *   source?: string,
   *   from?: Date,
   *   to?: Date
   * }} params
   * @returns {Promise<{ items: object[], hasMore: boolean, nextCursor: string|null }>}
   */
  async function getHistory(params) {
    const {
      userId,
      limit = 20,
      cursor = null,
      type = null,
      source = null,
      from = null,
      to = null
    } = params;

    const conditions = ["user_id = $1"];
    const values = [userId];
    let paramIdx = 2;

    if (type) {
      conditions.push(`type = $${paramIdx}`);
      values.push(type);
      paramIdx++;
    }
    if (source) {
      conditions.push(`source = $${paramIdx}`);
      values.push(source);
      paramIdx++;
    }
    if (from) {
      conditions.push(`created_at >= $${paramIdx}`);
      values.push(from);
      paramIdx++;
    }
    if (to) {
      conditions.push(`created_at <= $${paramIdx}`);
      values.push(to);
      paramIdx++;
    }
    if (cursor) {
      conditions.push(`(created_at, id) < ($${paramIdx}, $${paramIdx + 1})`);
      values.push(cursor.createdAt, cursor.id);
      paramIdx += 2;
    }

    const where = conditions.join(" AND ");
    values.push(limit + 1);

    const result = await db.query(
      `SELECT id, type, amount, balance_after, source, source_ref_type, source_ref_id,
              description, tier_at_time, multiplier_applied, created_at, expires_at, voided_at
       FROM reward_ledger_entries
       WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT $${paramIdx}`,
      values
    );

    const hasMore = result.rows.length > limit;
    const items = hasMore ? result.rows.slice(0, limit) : result.rows;
    let nextCursor = null;

    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      const { encodeCursor } = require("../modules/rewards/validators");
      nextCursor = encodeCursor({
        createdAt: last.created_at,
        id: last.id
      });
    }

    return { items, hasMore, nextCursor };
  }

  return {
    ensureAccount,
    getDailyEarnStatus,
    checkVelocity,
    creditPoints,
    debitPoints,
    voidEntry,
    getAccountState,
    getHistory
  };
}

module.exports = { createRewardLedgerService };
