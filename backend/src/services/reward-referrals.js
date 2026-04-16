/**
 * Referral Service
 *
 * Complete referral lifecycle: code generation, signup attribution,
 * qualification on first purchase, 14-day hold management, release/forfeit
 * logic, and fraud checks (device/IP overlap, self-referral, monthly cap).
 */

const { randomBytes } = require("node:crypto");
const { httpError } = require("../utils/http-error");
const { MAX_REFERRAL_HOLD_EXTENSIONS } = require("../modules/rewards/constants");

/**
 * @param {{ db, ledgerService, rewardConfig, analytics?, logger? }} deps
 */
function createReferralService({ db, ledgerService, rewardConfig, analytics, logger }) {
  /**
   * Generate a unique referral code from a username.
   * Format: uppercase letters/numbers, 6-12 chars.
   */
  function generateCode(username) {
    const base = (username || "user")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    const suffix = randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
    return `${base}${suffix}`;
  }

  /**
   * Get or create the user's active referral code.
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async function getOrCreateCode(userId) {
    // Check for existing active code
    const existing = await db.query(
      "SELECT * FROM referral_codes WHERE user_id = $1 AND is_active = true LIMIT 1",
      [userId]
    );

    if (existing.rowCount > 0) {
      const code = existing.rows[0];
      const monthlyUses = await getMonthlyReferralCount(userId);
      const monthlyCap = await rewardConfig.getNumber("referral_monthly_cap");

      return {
        code: code.code,
        share_url: `https://deenly.com/r/${code.code}`,
        is_active: code.is_active,
        total_uses: code.total_uses,
        monthly_uses: monthlyUses,
        monthly_cap: monthlyCap,
        monthly_remaining: Math.max(0, monthlyCap - monthlyUses),
        created_at: code.created_at
      };
    }

    // Get user info for code generation
    const userResult = await db.query(
      "SELECT username FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );
    const username = userResult.rows[0]?.username || "user";

    // Generate unique code with retry
    let code;
    for (let attempt = 0; attempt < 10; attempt++) {
      code = generateCode(username);
      try {
        const inserted = await db.query(
          `INSERT INTO referral_codes (user_id, code)
           VALUES ($1, $2)
           RETURNING *`,
          [userId, code]
        );
        const row = inserted.rows[0];
        const monthlyCap = await rewardConfig.getNumber("referral_monthly_cap");

        if (analytics) {
          analytics.trackEvent("growth.referral.code_created", {
            user_id: userId,
            code
          });
        }

        return {
          code: row.code,
          share_url: `https://deenly.com/r/${row.code}`,
          is_active: row.is_active,
          total_uses: row.total_uses,
          monthly_uses: 0,
          monthly_cap: monthlyCap,
          monthly_remaining: monthlyCap,
          created_at: row.created_at
        };
      } catch (error) {
        if (error.code === "23505") {
          continue; // Duplicate code, retry
        }
        throw error;
      }
    }

    throw httpError(500, "Failed to generate unique referral code");
  }

  /**
   * Get the number of referrals this user has made in the current month.
   * @param {number} userId
   * @returns {Promise<number>}
   */
  async function getMonthlyReferralCount(userId) {
    const result = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM referral_relationships
       WHERE referrer_user_id = $1
         AND created_at >= date_trunc('month', current_timestamp)`,
      [userId]
    );
    return result.rows[0].cnt;
  }

  /**
   * Record a share event (analytics only).
   * @param {{ userId: number, channel: string, referralCode: string }} params
   */
  async function recordShare(params) {
    const { userId, channel, referralCode } = params;
    if (analytics) {
      analytics.trackEvent("growth.referral.shared", {
        user_id: userId,
        channel,
        referral_code: referralCode
      });
    }
  }

  /**
   * Attribute a new signup to a referrer.
   * Runs fraud checks: self-referral, device/IP overlap, monthly cap.
   *
   * @param {{
   *   refereeUserId: number,
   *   referralCode: string,
   *   deviceFingerprint?: string,
   *   signupIp?: string
   * }} params
   * @returns {Promise<{ attributed: boolean, referralId: string|null, rejectedReason: string|null }>}
   */
  async function attributeSignup(params) {
    const { refereeUserId, referralCode, deviceFingerprint = null, signupIp = null } = params;

    // Resolve referral code
    const codeResult = await db.query(
      "SELECT * FROM referral_codes WHERE code = $1 AND is_active = true LIMIT 1",
      [referralCode.toUpperCase()]
    );

    if (codeResult.rowCount === 0) {
      return { attributed: false, referralId: null, rejectedReason: "invalid_code" };
    }

    const referralCode_ = codeResult.rows[0];
    const referrerUserId = referralCode_.user_id;

    // Self-referral check (also enforced by DB constraint)
    if (referrerUserId === refereeUserId) {
      return { attributed: false, referralId: null, rejectedReason: "self_referral" };
    }

    // Monthly cap check
    const monthlyCap = await rewardConfig.getNumber("referral_monthly_cap");
    const monthlyCount = await getMonthlyReferralCount(referrerUserId);
    if (monthlyCount >= monthlyCap) {
      return { attributed: false, referralId: null, rejectedReason: "monthly_cap_exceeded" };
    }

    // Device fingerprint overlap check
    if (deviceFingerprint) {
      const deviceOverlap = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM referral_relationships
         WHERE referrer_user_id = $1 AND device_fingerprint = $2`,
        [referrerUserId, deviceFingerprint]
      );
      if (deviceOverlap.rows[0].cnt > 0) {
        if (analytics) {
          analytics.trackEvent("growth.referral.fraud_detected", {
            referrer_user_id: referrerUserId,
            referee_user_id: refereeUserId,
            reason: "device_overlap"
          });
        }
        return { attributed: false, referralId: null, rejectedReason: "device_overlap" };
      }
    }

    // IP overlap check
    if (signupIp) {
      const ipOverlap = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM referral_relationships
         WHERE referrer_user_id = $1 AND signup_ip = $2`,
        [referrerUserId, signupIp]
      );
      if (ipOverlap.rows[0].cnt > 1) { // Allow 1 match (same household)
        if (analytics) {
          analytics.trackEvent("growth.referral.fraud_suspected", {
            referrer_user_id: referrerUserId,
            referee_user_id: refereeUserId,
            reason: "ip_overlap"
          });
        }
        // Don't block on IP alone — flag but allow
      }
    }

    // Create referral relationship
    try {
      const insertResult = await db.query(
        `INSERT INTO referral_relationships
         (referrer_user_id, referee_user_id, referral_code_id, device_fingerprint, signup_ip)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [referrerUserId, refereeUserId, referralCode_.id, deviceFingerprint, signupIp]
      );

      const referralId = insertResult.rows[0].id;

      // Increment code usage
      await db.query(
        "UPDATE referral_codes SET total_uses = total_uses + 1 WHERE id = $1",
        [referralCode_.id]
      );

      // Log events
      await db.query(
        "INSERT INTO referral_events (referral_id, event_type) VALUES ($1, 'code_used'), ($1, 'signup_completed')",
        [referralId]
      );

      if (analytics) {
        analytics.trackEvent("growth.referral.attributed", {
          referrer_user_id: referrerUserId,
          referee_user_id: refereeUserId
        });
      }

      return { attributed: true, referralId, rejectedReason: null };
    } catch (error) {
      if (error.code === "23505") {
        // Duplicate — referee already has a referrer
        return { attributed: false, referralId: null, rejectedReason: "already_referred" };
      }
      throw error;
    }
  }

  /**
   * Evaluate a referral after the referee's qualifying purchase.
   * Creates reward holds if qualifications are met.
   *
   * @param {{ refereeUserId: number, orderId: number, orderAmountMinor: number }} params
   * @returns {Promise<{ qualified: boolean, referralId: string|null, rewards: object[] }>}
   */
  async function evaluateQualifyingPurchase(params) {
    const { refereeUserId, orderId, orderAmountMinor } = params;

    // Find pending referral for this referee
    const refResult = await db.query(
      `SELECT * FROM referral_relationships
       WHERE referee_user_id = $1 AND status = 'pending'
       LIMIT 1`,
      [refereeUserId]
    );

    if (refResult.rowCount === 0) {
      return { qualified: false, referralId: null, rewards: [] };
    }

    const referral = refResult.rows[0];

    // Check minimum purchase
    const minPurchase = await rewardConfig.getNumber("referral_min_purchase_minor");
    if (orderAmountMinor < minPurchase) {
      return { qualified: false, referralId: referral.id, rewards: [] };
    }

    // Qualify the referral
    const holdDays = await rewardConfig.getNumber("referral_hold_days");
    const holdUntil = new Date();
    holdUntil.setDate(holdUntil.getDate() + holdDays);

    const referrerRewardDp = await rewardConfig.getNumber("referral_referrer_reward_dp");
    const refereeDiscountMinor = await rewardConfig.getNumber("referral_referee_discount_minor");

    // Update referral status
    await db.query(
      `UPDATE referral_relationships SET
         status = 'qualified', qualified_at = current_timestamp, updated_at = current_timestamp
       WHERE id = $1`,
      [referral.id]
    );

    // Create reward holds
    const rewards = [];

    // Referrer reward
    const referrerReward = await db.query(
      `INSERT INTO referral_rewards
       (referral_id, beneficiary_user_id, reward_type, amount, currency, hold_until)
       VALUES ($1, $2, 'referrer_points', $3, 'dp', $4)
       RETURNING *`,
      [referral.id, referral.referrer_user_id, referrerRewardDp, holdUntil]
    );
    rewards.push(referrerReward.rows[0]);

    // Referee discount
    const refereeReward = await db.query(
      `INSERT INTO referral_rewards
       (referral_id, beneficiary_user_id, reward_type, amount, currency, hold_until)
       VALUES ($1, $2, 'referee_discount', $3, 'usd', $4)
       RETURNING *`,
      [referral.id, referral.referee_user_id, refereeDiscountMinor, holdUntil]
    );
    rewards.push(refereeReward.rows[0]);

    // Log events
    await db.query(
      `INSERT INTO referral_events (referral_id, event_type, metadata) VALUES
       ($1, 'first_purchase', $2::jsonb),
       ($1, 'qualified', '{}'::jsonb),
       ($1, 'hold_started', $3::jsonb)`,
      [
        referral.id,
        JSON.stringify({ order_id: orderId, amount_minor: orderAmountMinor }),
        JSON.stringify({ hold_until: holdUntil.toISOString() })
      ]
    );

    if (analytics) {
      analytics.trackEvent("growth.referral.qualified", {
        referrer_user_id: referral.referrer_user_id,
        referee_user_id: refereeUserId,
        order_id: orderId
      });
    }

    return { qualified: true, referralId: referral.id, rewards };
  }

  /**
   * Get referral status dashboard for a user.
   * @param {{ userId: number, limit?: number, cursor?: object, status?: string }} params
   * @returns {Promise<{ summary: object, items: object[], hasMore: boolean, nextCursor: string|null }>}
   */
  async function getStatus(params) {
    const { userId, limit = 20, cursor = null, status = null } = params;

    // Summary
    const summaryResult = await db.query(
      `SELECT
         COUNT(*)::int AS total_referrals,
         COUNT(*) FILTER (WHERE status = 'qualified')::int AS qualified,
         COUNT(*) FILTER (WHERE status = 'rewarded')::int AS rewarded,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
         COUNT(*) FILTER (WHERE status = 'expired')::int AS expired
       FROM referral_relationships
       WHERE referrer_user_id = $1`,
      [userId]
    );

    const monthlyCap = await rewardConfig.getNumber("referral_monthly_cap");
    const monthlyUses = await getMonthlyReferralCount(userId);

    // Total earned
    const earnedResult = await db.query(
      `SELECT COALESCE(SUM(rr.amount), 0)::int AS total_earned
       FROM referral_rewards rr
       JOIN referral_relationships rl ON rl.id = rr.referral_id
       WHERE rl.referrer_user_id = $1 AND rr.reward_type = 'referrer_points' AND rr.status = 'released'`,
      [userId]
    );

    const pendingResult = await db.query(
      `SELECT COALESCE(SUM(rr.amount), 0)::int AS pending_reward
       FROM referral_rewards rr
       JOIN referral_relationships rl ON rl.id = rr.referral_id
       WHERE rl.referrer_user_id = $1 AND rr.reward_type = 'referrer_points' AND rr.status = 'held'`,
      [userId]
    );

    const summary = {
      ...summaryResult.rows[0],
      total_earned_dp: earnedResult.rows[0].total_earned,
      pending_reward_dp: pendingResult.rows[0].pending_reward,
      monthly_uses: monthlyUses,
      monthly_cap: monthlyCap
    };

    // Items
    const conditions = ["rl.referrer_user_id = $1"];
    const values = [userId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`rl.status = $${paramIdx}`);
      values.push(status);
      paramIdx++;
    }
    if (cursor) {
      conditions.push(`(rl.created_at, rl.id) < ($${paramIdx}, $${paramIdx + 1})`);
      values.push(cursor.createdAt, cursor.id);
      paramIdx += 2;
    }
    values.push(limit + 1);

    const itemsResult = await db.query(
      `SELECT rl.id AS referral_id, rl.status, rl.created_at, rl.qualified_at,
              p.display_name AS referee_display_name
       FROM referral_relationships rl
       JOIN profiles p ON p.user_id = rl.referee_user_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY rl.created_at DESC, rl.id DESC
       LIMIT $${paramIdx}`,
      values
    );

    const hasMore = itemsResult.rows.length > limit;
    const items = hasMore ? itemsResult.rows.slice(0, limit) : itemsResult.rows;

    // Attach reward info to each item
    for (const item of items) {
      const rewardResult = await db.query(
        `SELECT id AS reward_id, amount, currency, status, hold_until, released_at
         FROM referral_rewards
         WHERE referral_id = $1 AND beneficiary_user_id = $2
         LIMIT 1`,
        [item.referral_id, userId]
      );
      if (rewardResult.rowCount > 0) {
        const reward = rewardResult.rows[0];
        if (reward.status === "held" && reward.hold_until) {
          const msRemaining = new Date(reward.hold_until).getTime() - Date.now();
          reward.hold_days_remaining = Math.max(0, Math.ceil(msRemaining / 86400000));
        }
        item.reward = reward;
      } else {
        item.reward = null;
      }
    }

    let nextCursor = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      const { encodeCursor } = require("../modules/rewards/validators");
      nextCursor = encodeCursor({ createdAt: last.created_at, id: last.referral_id });
    }

    return { summary, items, hasMore, nextCursor };
  }

  /**
   * Cron: release held referral rewards past their hold_until date.
   * @returns {Promise<{ released: number, extended: number, forfeited: number }>}
   */
  async function batchReleaseHolds() {
    let released = 0;
    let extended = 0;
    let forfeited = 0;

    const heldRewards = await db.query(
      `SELECT rr.*, rl.referrer_user_id, rl.referee_user_id
       FROM referral_rewards rr
       JOIN referral_relationships rl ON rl.id = rr.referral_id
       WHERE rr.status = 'held' AND rr.hold_until <= NOW()
       LIMIT 200`
    );

    for (const reward of heldRewards.rows) {
      try {
        // Check if qualifying order was refunded
        // (simplified: check if referral has any fraud flags)
        const flagResult = await db.query(
          `SELECT COUNT(*)::int AS cnt FROM fraud_flags
           WHERE user_id IN ($1, $2) AND status = 'open'`,
          [reward.referrer_user_id, reward.referee_user_id]
        );

        if (flagResult.rows[0].cnt > 0) {
          // Active fraud flags — extend or forfeit
          if (reward.hold_extended_count >= MAX_REFERRAL_HOLD_EXTENSIONS) {
            // Forfeit
            await db.query(
              `UPDATE referral_rewards SET
                 status = 'forfeited', forfeited_at = current_timestamp,
                 forfeit_reason = 'max_extensions_exceeded',
                 updated_at = current_timestamp
               WHERE id = $1`,
              [reward.id]
            );
            forfeited++;

            await db.query(
              "INSERT INTO referral_events (referral_id, event_type) VALUES ($1, 'reward_forfeited')",
              [reward.referral_id]
            );
          } else {
            // Extend hold
            const holdDays = await rewardConfig.getNumber("referral_hold_days");
            const newHoldUntil = new Date();
            newHoldUntil.setDate(newHoldUntil.getDate() + holdDays);

            await db.query(
              `UPDATE referral_rewards SET
                 hold_until = $1, hold_extended_count = hold_extended_count + 1,
                 updated_at = current_timestamp
               WHERE id = $2`,
              [newHoldUntil, reward.id]
            );
            extended++;

            await db.query(
              "INSERT INTO referral_events (referral_id, event_type, metadata) VALUES ($1, 'hold_extended', $2::jsonb)",
              [reward.referral_id, JSON.stringify({ new_hold_until: newHoldUntil.toISOString() })]
            );
          }
          continue;
        }

        // Clean — release the reward
        if (reward.reward_type === "referrer_points") {
          const creditResult = await ledgerService.creditPoints({
            userId: reward.beneficiary_user_id,
            amount: reward.amount,
            source: "referral_earned",
            sourceRefType: "referral",
            sourceRefId: reward.referral_id,
            description: "Referral reward released",
            idempotencyKey: `referral-reward-${reward.id}`
          });

          await db.query(
            `UPDATE referral_rewards SET
               status = 'released', released_at = current_timestamp,
               ledger_entry_id = $1, updated_at = current_timestamp
             WHERE id = $2`,
            [creditResult.ledgerEntryId, reward.id]
          );
        } else {
          // referee_discount — mark as released (applied at checkout separately)
          await db.query(
            `UPDATE referral_rewards SET
               status = 'released', released_at = current_timestamp,
               updated_at = current_timestamp
             WHERE id = $1`,
            [reward.id]
          );
        }

        released++;

        await db.query(
          "INSERT INTO referral_events (referral_id, event_type) VALUES ($1, 'reward_released')",
          [reward.referral_id]
        );

        // Update referral status to rewarded if all rewards released
        const pendingCount = await db.query(
          "SELECT COUNT(*)::int AS cnt FROM referral_rewards WHERE referral_id = $1 AND status = 'held'",
          [reward.referral_id]
        );
        if (pendingCount.rows[0].cnt === 0) {
          await db.query(
            "UPDATE referral_relationships SET status = 'rewarded', updated_at = current_timestamp WHERE id = $1",
            [reward.referral_id]
          );
        }

        if (analytics) {
          analytics.trackEvent("growth.referral.completed", {
            referrer_user_id: reward.referrer_user_id,
            referee_user_id: reward.referee_user_id,
            reward_type: reward.reward_type,
            amount: reward.amount
          });
        }
      } catch (error) {
        if (logger) {
          logger.warn({ err: error, rewardId: reward.id }, "referral_hold_release_failed");
        }
      }
    }

    if (logger) {
      logger.info({ released, extended, forfeited }, "referral_batch_release_complete");
    }

    return { released, extended, forfeited };
  }

  /**
   * Admin: approve a referral and release rewards immediately.
   * @param {{ referralId: string, adminUserId: number, reason: string }} params
   * @returns {Promise<object>}
   */
  async function adminApprove(params) {
    const { referralId, adminUserId, reason } = params;

    const refResult = await db.query(
      "SELECT * FROM referral_relationships WHERE id = $1 LIMIT 1",
      [referralId]
    );
    if (refResult.rowCount === 0) {
      throw httpError(404, "Referral not found");
    }

    const referral = refResult.rows[0];
    if (referral.status === "rewarded") {
      throw httpError(409, "This referral has already been rewarded");
    }
    if (referral.status !== "qualified") {
      throw httpError(422, "Only qualified referrals can be approved");
    }

    // Release all held rewards
    const heldRewards = await db.query(
      "SELECT * FROM referral_rewards WHERE referral_id = $1 AND status = 'held'",
      [referralId]
    );

    const releasedRewards = [];
    for (const reward of heldRewards.rows) {
      if (reward.reward_type === "referrer_points") {
        const creditResult = await ledgerService.creditPoints({
          userId: reward.beneficiary_user_id,
          amount: reward.amount,
          source: "referral_earned",
          sourceRefType: "referral",
          sourceRefId: referralId,
          description: `Referral reward approved by admin`,
          idempotencyKey: `referral-admin-approve-${reward.id}`
        });

        await db.query(
          `UPDATE referral_rewards SET
             status = 'released', released_at = current_timestamp,
             ledger_entry_id = $1, updated_at = current_timestamp
           WHERE id = $2`,
          [creditResult.ledgerEntryId, reward.id]
        );
      } else {
        await db.query(
          `UPDATE referral_rewards SET
             status = 'released', released_at = current_timestamp,
             updated_at = current_timestamp
           WHERE id = $1`,
          [reward.id]
        );
      }
      releasedRewards.push(reward);
    }

    // Update referral status
    await db.query(
      "UPDATE referral_relationships SET status = 'rewarded', updated_at = current_timestamp WHERE id = $1",
      [referralId]
    );

    await db.query(
      "INSERT INTO referral_events (referral_id, event_type) VALUES ($1, 'reward_released')",
      [referralId]
    );

    if (analytics) {
      analytics.trackEvent("admin.referral.approved", {
        admin_user_id: adminUserId,
        referral_id: referralId
      });
    }

    return {
      referral_id: referralId,
      previous_status: referral.status,
      new_status: "rewarded",
      rewards_released: releasedRewards
    };
  }

  /**
   * Admin: reject a referral and forfeit rewards.
   * @param {{ referralId: string, adminUserId: number, reason: string, createFraudFlag?: boolean, fraudSeverity?: string }} params
   * @returns {Promise<object>}
   */
  async function adminReject(params) {
    const { referralId, adminUserId, reason, createFraudFlag = false, fraudSeverity = "medium" } = params;

    const refResult = await db.query(
      "SELECT * FROM referral_relationships WHERE id = $1 LIMIT 1",
      [referralId]
    );
    if (refResult.rowCount === 0) {
      throw httpError(404, "Referral not found");
    }

    const referral = refResult.rows[0];
    if (["rewarded", "rejected"].includes(referral.status)) {
      throw httpError(409, "This referral has already been resolved");
    }

    // Forfeit all held rewards
    await db.query(
      `UPDATE referral_rewards SET
         status = 'forfeited', forfeited_at = current_timestamp,
         forfeit_reason = $1, updated_at = current_timestamp
       WHERE referral_id = $2 AND status = 'held'`,
      [reason, referralId]
    );

    const forfeited = await db.query(
      "SELECT COUNT(*)::int AS cnt FROM referral_rewards WHERE referral_id = $1 AND status = 'forfeited'",
      [referralId]
    );

    // Update referral status
    await db.query(
      "UPDATE referral_relationships SET status = 'rejected', updated_at = current_timestamp WHERE id = $1",
      [referralId]
    );

    await db.query(
      "INSERT INTO referral_events (referral_id, event_type) VALUES ($1, 'rejected')",
      [referralId]
    );

    // Optionally create fraud flag
    let fraudFlagId = null;
    if (createFraudFlag) {
      const flagResult = await db.query(
        `INSERT INTO fraud_flags
         (user_id, flag_type, severity, source, reference_type, reference_id, evidence)
         VALUES ($1, 'referral_farming', $2, 'admin_manual', 'referral', $3, $4::jsonb)
         RETURNING id`,
        [
          referral.referrer_user_id,
          fraudSeverity,
          referralId,
          JSON.stringify({ reason, admin_user_id: adminUserId })
        ]
      );
      fraudFlagId = flagResult.rows[0].id;
    }

    if (analytics) {
      analytics.trackEvent("admin.referral.rejected", {
        admin_user_id: adminUserId,
        referral_id: referralId,
        fraud_flag_created: createFraudFlag
      });
    }

    return {
      referral_id: referralId,
      previous_status: referral.status,
      new_status: "rejected",
      rewards_forfeited: forfeited.rows[0].cnt,
      fraud_flag_id: fraudFlagId
    };
  }

  /**
   * Extend hold for a referral.
   * @param {{ referralId: string, extensionDays: number, reason: string }} params
   * @returns {Promise<{ extended: boolean, newHoldUntil: Date|null, extensionCount: number }>}
   */
  async function extendHold(params) {
    const { referralId, extensionDays, reason } = params;

    const rewards = await db.query(
      "SELECT * FROM referral_rewards WHERE referral_id = $1 AND status = 'held'",
      [referralId]
    );

    if (rewards.rowCount === 0) {
      return { extended: false, newHoldUntil: null, extensionCount: 0 };
    }

    const newHoldUntil = new Date();
    newHoldUntil.setDate(newHoldUntil.getDate() + extensionDays);

    await db.query(
      `UPDATE referral_rewards SET
         hold_until = $1, hold_extended_count = hold_extended_count + 1,
         updated_at = current_timestamp
       WHERE referral_id = $2 AND status = 'held'`,
      [newHoldUntil, referralId]
    );

    await db.query(
      "INSERT INTO referral_events (referral_id, event_type, metadata) VALUES ($1, 'hold_extended', $2::jsonb)",
      [referralId, JSON.stringify({ new_hold_until: newHoldUntil.toISOString(), reason })]
    );

    return {
      extended: true,
      newHoldUntil,
      extensionCount: rewards.rows[0].hold_extended_count + 1
    };
  }

  return {
    getOrCreateCode,
    recordShare,
    attributeSignup,
    evaluateQualifyingPurchase,
    getStatus,
    batchReleaseHolds,
    adminApprove,
    adminReject,
    extendHold
  };
}

module.exports = { createReferralService };
