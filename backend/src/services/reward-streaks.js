/**
 * Streak Service
 *
 * Manages daily check-in streaks, escalating multipliers (1x→3x),
 * shield management, and streak break detection.
 */

/**
 * @param {{ db, rewardConfig, rulesEngine, ledgerService, analytics?, logger? }} deps
 */
function createStreakService({ db, rewardConfig, rulesEngine, ledgerService, analytics, logger }) {
  /**
   * Process a daily check-in for a user.
   * Increments streak, computes new multiplier, and awards streak bonus points.
   *
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async function checkIn(userId) {
    const account = await ledgerService.ensureAccount(userId);
    const today = new Date().toISOString().slice(0, 10);

    // Already checked in today
    if (account.streak_last_checkin_date === today) {
      return {
        checkedIn: false,
        alreadyCheckedIn: true,
        streakCurrent: account.streak_current,
        streakMultiplier: Number(account.streak_multiplier),
        bonusPoints: 0,
        shieldsRemaining: account.streak_shields_remaining
      };
    }

    if (account.is_frozen) {
      const { httpError } = require("../utils/http-error");
      throw httpError(403, "Your reward account is frozen. Contact support.");
    }

    // Determine if this is a consecutive day
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let newStreak;
    const lastCheckin = account.streak_last_checkin_date;

    if (!lastCheckin || lastCheckin < yesterdayStr) {
      // Missed a day (or first ever check-in) — streak resets to 1
      // Note: shield usage happens in batchBreakDetection, not here
      newStreak = 1;
    } else if (lastCheckin === yesterdayStr) {
      // Consecutive day
      newStreak = account.streak_current + 1;
    } else {
      // lastCheckin is today or in the future — shouldn't happen, treat as 1
      newStreak = 1;
    }

    const newLongest = Math.max(newStreak, account.streak_longest);
    const newMultiplier = await rulesEngine.computeStreakMultiplier(newStreak);

    // Award streak bonus (small daily bonus for checking in)
    // Not in Business Rules spec as a configurable — using a fixed 5 DP
    // TODO: make configurable via reward_rules_config if needed
    const streakBonusAmount = 5;

    await db.query(
      `UPDATE reward_accounts SET
         streak_current = $1,
         streak_longest = $2,
         streak_multiplier = $3,
         streak_last_checkin_date = $4,
         last_activity_at = current_timestamp,
         updated_at = current_timestamp
       WHERE user_id = $5`,
      [newStreak, newLongest, newMultiplier, today, userId]
    );

    // Credit streak bonus points
    let bonusPoints = 0;
    if (streakBonusAmount > 0) {
      const creditResult = await ledgerService.creditPoints({
        userId,
        amount: streakBonusAmount,
        source: "streak_bonus",
        description: `Daily check-in bonus (day ${newStreak})`,
        tierAtTime: account.tier,
        multiplierApplied: 1.0,
        idempotencyKey: `streak-checkin-${userId}-${today}`
      });
      bonusPoints = creditResult.amount;
    }

    // Analytics
    if (analytics) {
      if (newStreak === 1 && (!lastCheckin || lastCheckin < yesterdayStr)) {
        analytics.trackEvent("rewards.streak.started", { user_id: userId });
      } else {
        analytics.trackEvent("rewards.streak.continued", {
          user_id: userId,
          streak_current: newStreak,
          multiplier: newMultiplier
        });
      }

      // Milestone notifications at 7, 14, 30
      if ([7, 14, 30].includes(newStreak)) {
        analytics.trackEvent("rewards.streak.milestone", {
          user_id: userId,
          streak_days: newStreak,
          multiplier: newMultiplier
        });
      }
    }

    return {
      checkedIn: true,
      alreadyCheckedIn: false,
      streakCurrent: newStreak,
      streakMultiplier: newMultiplier,
      bonusPoints,
      shieldsRemaining: account.streak_shields_remaining
    };
  }

  /**
   * Get a user's current streak state.
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async function getStreakState(userId) {
    const account = await ledgerService.ensureAccount(userId);
    const today = new Date().toISOString().slice(0, 10);

    return {
      current: account.streak_current,
      longest: account.streak_longest,
      multiplier: Number(account.streak_multiplier),
      shields_remaining: account.streak_shields_remaining,
      last_checkin_date: account.streak_last_checkin_date,
      checked_in_today: account.streak_last_checkin_date === today
    };
  }

  /**
   * Daily cron job: detect users who missed yesterday's check-in.
   * Apply shield if available; break streak if no shields.
   *
   * @param {{ batchSize?: number }} options
   * @returns {Promise<{ processed: number, shieldsUsed: number, streaksBroken: number }>}
   */
  async function batchBreakDetection(options = {}) {
    const batchSize = options.batchSize || 500;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let processed = 0;
    let shieldsUsed = 0;
    let streaksBroken = 0;

    // Find users who have an active streak but didn't check in yesterday
    // (last_checkin_date < yesterday AND streak_current > 0)
    let offset = 0;

    while (true) {
      const batch = await db.query(
        `SELECT user_id, streak_current, streak_shields_remaining, streak_last_checkin_date, tier
         FROM reward_accounts
         WHERE streak_current > 0
           AND (streak_last_checkin_date IS NULL OR streak_last_checkin_date < $1)
         ORDER BY user_id
         LIMIT $2 OFFSET $3`,
        [yesterdayStr, batchSize, offset]
      );

      if (batch.rowCount === 0) {
        break;
      }

      for (const row of batch.rows) {
        try {
          if (row.streak_shields_remaining > 0) {
            // Use a shield
            await db.query(
              `UPDATE reward_accounts SET
                 streak_shields_remaining = streak_shields_remaining - 1,
                 updated_at = current_timestamp
               WHERE user_id = $1`,
              [row.user_id]
            );
            shieldsUsed++;

            if (analytics) {
              analytics.trackEvent("rewards.streak.shield_used", {
                user_id: row.user_id,
                streak_current: row.streak_current,
                shields_remaining: row.streak_shields_remaining - 1
              });
            }
          } else {
            // Break streak
            await db.query(
              `UPDATE reward_accounts SET
                 streak_current = 0,
                 streak_multiplier = 1.00,
                 updated_at = current_timestamp
               WHERE user_id = $1`,
              [row.user_id]
            );
            streaksBroken++;

            if (analytics) {
              analytics.trackEvent("rewards.streak.broken", {
                user_id: row.user_id,
                streak_was: row.streak_current
              });
            }
          }
          processed++;
        } catch (error) {
          if (logger) {
            logger.warn({ err: error, userId: row.user_id }, "streak_break_detection_failed");
          }
        }
      }

      offset += batchSize;
      if (batch.rowCount < batchSize) {
        break;
      }
    }

    if (logger) {
      logger.info({ processed, shieldsUsed, streaksBroken }, "streak_batch_break_detection_complete");
    }

    return { processed, shieldsUsed, streaksBroken };
  }

  /**
   * Reset shields for a user when tier changes.
   * @param {number} userId
   * @param {string} newTier
   * @returns {Promise<number>} new shield count
   */
  async function resetShields(userId, newTier) {
    const newShields = await rewardConfig.getStreakShields(newTier);
    await db.query(
      "UPDATE reward_accounts SET streak_shields_remaining = $1, updated_at = current_timestamp WHERE user_id = $2",
      [newShields, userId]
    );
    return newShields;
  }

  return {
    checkIn,
    getStreakState,
    batchBreakDetection,
    resetShields
  };
}

module.exports = { createStreakService };
