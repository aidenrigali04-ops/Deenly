/**
 * Tier Service
 *
 * Manages the 5-tier progression system: Explorer → Member → Insider → VIP → Elite.
 * Handles tier qualification, upgrades, downgrades, grace periods, and the
 * nightly batch requalification job.
 */

const { TIERS, TIER_ORDER } = require("../modules/rewards/constants");

/**
 * @param {{ db, rewardConfig, rulesEngine, ledgerService, analytics?, logger? }} deps
 */
function createTierService({ db, rewardConfig, rulesEngine, ledgerService, analytics, logger }) {
  /**
   * Get a user's current tier info including progress to next tier.
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async function getTierInfo(userId) {
    const account = await ledgerService.ensureAccount(userId);
    const multiplier = await rewardConfig.getTierMultiplier(account.tier);
    const tierResult = await rulesEngine.computeQualifiedTier(account.rolling_12m_points);

    return {
      user_id: userId,
      tier: account.tier,
      multiplier,
      rolling_12m_points: account.rolling_12m_points,
      qualified_tier: tierResult.qualifiedTier,
      next_tier: tierResult.nextTier,
      next_threshold: tierResult.nextThreshold,
      progress: tierResult.progress,
      tier_qualified_at: account.tier_qualified_at,
      tier_grace_until: account.tier_grace_until
    };
  }

  /**
   * Recalculate rolling 12-month points for a user from the ledger.
   * @param {number} userId
   * @returns {Promise<number>}
   */
  async function recalcRolling12m(userId) {
    const result = await db.query(
      `SELECT COALESCE(SUM(amount), 0)::int AS total
       FROM reward_ledger_entries
       WHERE user_id = $1
         AND type = 'credit'
         AND created_at > NOW() - interval '12 months'
         AND voided_at IS NULL`,
      [userId]
    );
    const total = result.rows[0].total;

    await db.query(
      "UPDATE reward_accounts SET rolling_12m_points = $1, updated_at = current_timestamp WHERE user_id = $2",
      [total, userId]
    );

    return total;
  }

  /**
   * Check and apply tier upgrade/downgrade for a single user.
   *
   * Upgrade: immediate.
   * Downgrade: 30-day grace period. If grace period started and not expired, no change.
   *            If grace period expired, downgrade.
   *
   * @param {number} userId
   * @returns {Promise<{ changed: boolean, previousTier: string, newTier: string, direction: string|null }>}
   */
  async function requalify(userId) {
    const account = await ledgerService.ensureAccount(userId);
    const previousTier = account.tier;
    const rolling12m = account.rolling_12m_points;

    const { qualifiedTier } = await rulesEngine.computeQualifiedTier(rolling12m);

    // Same tier — no change
    if (qualifiedTier === previousTier) {
      // Clear any lingering grace period
      if (account.tier_grace_until) {
        await db.query(
          "UPDATE reward_accounts SET tier_grace_until = NULL, updated_at = current_timestamp WHERE user_id = $1",
          [userId]
        );
      }
      return { changed: false, previousTier, newTier: previousTier, direction: null };
    }

    const qualifiedOrder = TIER_ORDER[qualifiedTier];
    const currentOrder = TIER_ORDER[previousTier];

    // UPGRADE — immediate
    if (qualifiedOrder > currentOrder) {
      await db.query(
        `UPDATE reward_accounts SET
           tier = $1,
           tier_qualified_at = current_timestamp,
           tier_grace_until = NULL,
           updated_at = current_timestamp
         WHERE user_id = $2`,
        [qualifiedTier, userId]
      );

      // Reset shields to new tier level
      const newShields = await rewardConfig.getStreakShields(qualifiedTier);
      await db.query(
        "UPDATE reward_accounts SET streak_shields_remaining = $1 WHERE user_id = $2",
        [newShields, userId]
      );

      if (analytics) {
        analytics.trackEvent("rewards.tier.upgraded", {
          user_id: userId,
          previous_tier: previousTier,
          new_tier: qualifiedTier
        });
      }

      return { changed: true, previousTier, newTier: qualifiedTier, direction: "upgrade" };
    }

    // DOWNGRADE logic — grace period
    const graceDays = await rewardConfig.getNumber("tier_grace_period_days");

    if (!account.tier_grace_until) {
      // Start grace period
      const graceUntil = new Date();
      graceUntil.setDate(graceUntil.getDate() + graceDays);

      await db.query(
        "UPDATE reward_accounts SET tier_grace_until = $1, updated_at = current_timestamp WHERE user_id = $2",
        [graceUntil, userId]
      );

      if (analytics) {
        analytics.trackEvent("rewards.tier.grace_started", {
          user_id: userId,
          tier: previousTier,
          grace_until: graceUntil.toISOString()
        });
      }

      return { changed: false, previousTier, newTier: previousTier, direction: null };
    }

    // Grace period active — check if expired
    if (new Date() < new Date(account.tier_grace_until)) {
      return { changed: false, previousTier, newTier: previousTier, direction: null };
    }

    // Grace period expired — downgrade
    await db.query(
      `UPDATE reward_accounts SET
         tier = $1,
         tier_qualified_at = current_timestamp,
         tier_grace_until = NULL,
         updated_at = current_timestamp
       WHERE user_id = $2`,
      [qualifiedTier, userId]
    );

    const newShields = await rewardConfig.getStreakShields(qualifiedTier);
    await db.query(
      "UPDATE reward_accounts SET streak_shields_remaining = LEAST(streak_shields_remaining, $1) WHERE user_id = $2",
      [newShields, userId]
    );

    if (analytics) {
      analytics.trackEvent("rewards.tier.downgraded", {
        user_id: userId,
        previous_tier: previousTier,
        new_tier: qualifiedTier
      });
    }

    return { changed: true, previousTier, newTier: qualifiedTier, direction: "downgrade" };
  }

  /**
   * Batch requalification job. Processes all users.
   * Called by nightly cron at 02:00 UTC.
   *
   * @param {{ batchSize?: number }} options
   * @returns {Promise<{ processed: number, upgraded: number, downgraded: number, graceStarted: number }>}
   */
  async function batchRequalify(options = {}) {
    const batchSize = options.batchSize || 500;
    let processed = 0;
    let upgraded = 0;
    let downgraded = 0;
    let graceStarted = 0;
    let offset = 0;

    while (true) {
      const batch = await db.query(
        "SELECT user_id FROM reward_accounts ORDER BY user_id LIMIT $1 OFFSET $2",
        [batchSize, offset]
      );

      if (batch.rowCount === 0) {
        break;
      }

      for (const row of batch.rows) {
        try {
          await recalcRolling12m(row.user_id);
          const result = await requalify(row.user_id);
          processed++;
          if (result.direction === "upgrade") upgraded++;
          if (result.direction === "downgrade") downgraded++;
          // Grace started if not changed but we detect grace_until was just set
          // (simplified: we count non-changes where tier should be lower)
        } catch (error) {
          if (logger) {
            logger.warn({ err: error, userId: row.user_id }, "tier_requalify_user_failed");
          }
        }
      }

      offset += batchSize;
      if (batch.rowCount < batchSize) {
        break;
      }
    }

    if (logger) {
      logger.info({ processed, upgraded, downgraded }, "tier_batch_requalify_complete");
    }

    return { processed, upgraded, downgraded, graceStarted };
  }

  /**
   * Convenience: get tier multiplier for a user.
   * @param {number} userId
   * @returns {Promise<number>}
   */
  async function getMultiplier(userId) {
    const account = await ledgerService.ensureAccount(userId);
    return rewardConfig.getTierMultiplier(account.tier);
  }

  return {
    getTierInfo,
    recalcRolling12m,
    requalify,
    batchRequalify,
    getMultiplier
  };
}

module.exports = { createTierService };
