/**
 * Challenge Service
 *
 * Manages challenge lifecycle: definitions (CRUD), user enrollment,
 * progress tracking, auto-completion on purchase events, and reward
 * issuance on completion.
 */

const { httpError } = require("../utils/http-error");

/**
 * @param {{ db, ledgerService, rewardConfig, analytics?, logger? }} deps
 */
function createChallengeService({ db, ledgerService, rewardConfig, analytics, logger }) {
  /**
   * List active challenges available for a user to join.
   * Excludes challenges already enrolled in and challenges past their end date.
   *
   * @param {{ userId: number, type?: string, limit?: number, cursor?: object }} params
   * @returns {Promise<{ items: object[], hasMore: boolean, nextCursor: string|null }>}
   */
  async function listAvailable(params) {
    const { userId, type = null, limit = 20, cursor = null } = params;

    const conditions = [
      "cd.is_active = true",
      "cd.starts_at <= NOW()",
      "cd.ends_at > NOW()",
      "uc.id IS NULL" // not already enrolled
    ];
    const values = [userId];
    let paramIdx = 2;

    if (type) {
      conditions.push(`cd.challenge_type = $${paramIdx}`);
      values.push(type);
      paramIdx++;
    }

    if (cursor) {
      conditions.push(`(cd.starts_at, cd.id) < ($${paramIdx}, $${paramIdx + 1})`);
      values.push(cursor.createdAt, cursor.id);
      paramIdx += 2;
    }

    values.push(limit + 1);

    const result = await db.query(
      `SELECT cd.*
       FROM challenge_definitions cd
       LEFT JOIN user_challenges uc ON uc.challenge_id = cd.id AND uc.user_id = $1
       WHERE ${conditions.join(" AND ")}
       ORDER BY cd.starts_at DESC, cd.id DESC
       LIMIT $${paramIdx}`,
      values
    );

    const hasMore = result.rows.length > limit;
    const items = hasMore ? result.rows.slice(0, limit) : result.rows;
    let nextCursor = null;

    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      const { encodeCursor } = require("../modules/rewards/validators");
      nextCursor = encodeCursor({ createdAt: last.starts_at, id: last.id });
    }

    return { items, hasMore, nextCursor };
  }

  /**
   * Enroll a user in a challenge.
   * @param {{ userId: number, challengeId: string }} params
   * @returns {Promise<object>}
   */
  async function enroll(params) {
    const { userId, challengeId } = params;

    // Verify challenge exists and is active
    const challengeResult = await db.query(
      "SELECT * FROM challenge_definitions WHERE id = $1 AND is_active = true LIMIT 1",
      [challengeId]
    );

    if (challengeResult.rowCount === 0) {
      throw httpError(404, "Challenge not found or not active");
    }

    const challenge = challengeResult.rows[0];

    if (new Date() > new Date(challenge.ends_at)) {
      throw httpError(422, "This challenge has already ended");
    }

    // Check max participants
    if (challenge.max_participants) {
      const countResult = await db.query(
        "SELECT COUNT(*)::int AS cnt FROM user_challenges WHERE challenge_id = $1",
        [challengeId]
      );
      if (countResult.rows[0].cnt >= challenge.max_participants) {
        throw httpError(422, "This challenge is full");
      }
    }

    // Determine target from criteria
    const target = challenge.criteria?.count || 1;

    try {
      const result = await db.query(
        `INSERT INTO user_challenges (user_id, challenge_id, target, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, challengeId, target, challenge.ends_at]
      );

      if (analytics) {
        analytics.trackEvent("rewards.challenge.enrolled", {
          user_id: userId,
          challenge_id: challengeId,
          challenge_type: challenge.challenge_type
        });
      }

      return result.rows[0];
    } catch (error) {
      if (error.code === "23505") {
        throw httpError(409, "Already enrolled in this challenge");
      }
      throw error;
    }
  }

  /**
   * Get a user's challenges with optional status filter.
   * @param {{ userId: number, status?: string, limit?: number, cursor?: object }} params
   * @returns {Promise<{ items: object[], hasMore: boolean, nextCursor: string|null }>}
   */
  async function getUserChallenges(params) {
    const { userId, status = null, limit = 20, cursor = null } = params;

    const conditions = ["uc.user_id = $1"];
    const values = [userId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`uc.status = $${paramIdx}`);
      values.push(status);
      paramIdx++;
    }

    if (cursor) {
      conditions.push(`(uc.enrolled_at, uc.id) < ($${paramIdx}, $${paramIdx + 1})`);
      values.push(cursor.createdAt, cursor.id);
      paramIdx += 2;
    }

    values.push(limit + 1);

    const result = await db.query(
      `SELECT uc.*, cd.title, cd.description, cd.challenge_type, cd.category,
              cd.reward_points, cd.reward_badge, cd.starts_at, cd.ends_at
       FROM user_challenges uc
       JOIN challenge_definitions cd ON cd.id = uc.challenge_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY uc.enrolled_at DESC, uc.id DESC
       LIMIT $${paramIdx}`,
      values
    );

    const hasMore = result.rows.length > limit;
    const items = hasMore ? result.rows.slice(0, limit) : result.rows;
    let nextCursor = null;

    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      const { encodeCursor } = require("../modules/rewards/validators");
      nextCursor = encodeCursor({ createdAt: last.enrolled_at, id: last.id });
    }

    return { items, hasMore, nextCursor };
  }

  /**
   * Increment progress on matching challenges after an event (e.g., purchase).
   * Auto-completes and credits rewards if target is reached.
   *
   * @param {{
   *   userId: number,
   *   eventType: 'purchase'|'review'|'streak_checkin',
   *   metadata: { orderAmountMinor?: number, merchantUserId?: number, productId?: number }
   * }} params
   * @returns {Promise<{ progressed: object[], completed: object[] }>}
   */
  async function processEvent(params) {
    const { userId, eventType, metadata = {} } = params;
    const progressed = [];
    const completed = [];

    // Find active user_challenges where the criteria match this event type
    const activeChallenges = await db.query(
      `SELECT uc.*, cd.criteria, cd.reward_points, cd.title, cd.merchant_user_id
       FROM user_challenges uc
       JOIN challenge_definitions cd ON cd.id = uc.challenge_id
       WHERE uc.user_id = $1
         AND uc.status = 'active'
         AND cd.is_active = true
         AND (uc.expires_at IS NULL OR uc.expires_at > NOW())`,
      [userId]
    );

    for (const challenge of activeChallenges.rows) {
      const criteria = challenge.criteria || {};
      const action = criteria.action;

      // Match event type to criteria action
      if (action !== eventType) {
        continue;
      }

      // Check merchant filter
      if (criteria.merchant_user_id && metadata.merchantUserId !== criteria.merchant_user_id) {
        continue;
      }

      // Check minimum amount filter
      if (criteria.min_amount_minor && (metadata.orderAmountMinor || 0) < criteria.min_amount_minor) {
        continue;
      }

      // Increment progress
      const newProgress = challenge.progress + 1;
      const isComplete = newProgress >= challenge.target;

      if (isComplete) {
        // Complete and credit reward
        const creditResult = await ledgerService.creditPoints({
          userId,
          amount: challenge.reward_points,
          source: "challenge_reward",
          sourceRefType: "challenge",
          sourceRefId: challenge.challenge_id,
          description: `Challenge completed: ${challenge.title}`,
          idempotencyKey: `challenge-reward-${challenge.id}`
        });

        await db.query(
          `UPDATE user_challenges SET
             progress = $1, status = 'completed',
             completed_at = current_timestamp,
             reward_claimed_at = current_timestamp,
             ledger_entry_id = $2,
             updated_at = current_timestamp
           WHERE id = $3`,
          [newProgress, creditResult.ledgerEntryId, challenge.id]
        );

        completed.push({
          challenge_id: challenge.challenge_id,
          title: challenge.title,
          progress: newProgress,
          target: challenge.target,
          reward_points: challenge.reward_points
        });

        if (analytics) {
          analytics.trackEvent("rewards.challenge.completed", {
            user_id: userId,
            challenge_id: challenge.challenge_id,
            reward_points: challenge.reward_points
          });
        }
      } else {
        await db.query(
          "UPDATE user_challenges SET progress = $1, updated_at = current_timestamp WHERE id = $2",
          [newProgress, challenge.id]
        );

        progressed.push({
          challenge_id: challenge.challenge_id,
          title: challenge.title,
          progress: newProgress,
          target: challenge.target
        });

        if (analytics) {
          analytics.trackEvent("rewards.challenge.progressed", {
            user_id: userId,
            challenge_id: challenge.challenge_id,
            progress: newProgress,
            target: challenge.target
          });
        }
      }
    }

    return { progressed, completed };
  }

  /**
   * Cron: expire active challenges past their end date.
   * @returns {Promise<{ expired: number }>}
   */
  async function batchExpire() {
    const result = await db.query(
      `UPDATE user_challenges SET status = 'expired', updated_at = current_timestamp
       WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()
       RETURNING challenge_id`
    );

    if (logger) {
      logger.info({ expired: result.rowCount }, "challenge_batch_expire_complete");
    }

    return { expired: result.rowCount };
  }

  /**
   * Admin: create a new challenge definition.
   * @param {object} input
   * @returns {Promise<object>}
   */
  async function createDefinition(input) {
    const {
      title, description, challengeType, category, criteria,
      rewardPoints, rewardBadge, maxParticipants, frequency,
      startsAt, endsAt, merchantUserId, createdBy
    } = input;

    const result = await db.query(
      `INSERT INTO challenge_definitions
       (title, description, challenge_type, category, criteria, reward_points,
        reward_badge, max_participants, frequency, starts_at, ends_at,
        merchant_user_id, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        title, description || null, challengeType, category || "general",
        JSON.stringify(criteria || {}), rewardPoints,
        rewardBadge || null, maxParticipants || null, frequency || null,
        startsAt, endsAt, merchantUserId || null, createdBy || null
      ]
    );

    return result.rows[0];
  }

  return {
    listAvailable,
    enroll,
    getUserChallenges,
    processEvent,
    batchExpire,
    createDefinition
  };
}

module.exports = { createChallengeService };
