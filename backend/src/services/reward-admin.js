/**
 * Admin Service
 *
 * Orchestrates admin-only operations:
 *   - Manual point adjustments (credit/debit) with required reason + audit
 *   - Rule config updates (business rules table)
 *   - Fraud flag resolution (delegated to trust service)
 *   - Account freeze/unfreeze
 *   - Referral hold release/forfeit (delegated to referral service)
 *   - Budget monitor (daily/monthly rewards spend vs cap)
 *
 * Every admin action writes to `admin_actions` for audit traceability.
 */

const { httpError } = require("../utils/http-error");
const {
  ADMIN_ACTION_TYPES,
  ADMIN_TARGET_TYPES,
} = require("../modules/rewards/constants");

/**
 * @param {{ db, ledgerService, trustService, referralService, rewardConfig, notificationsService?, analytics?, logger? }} deps
 */
function createAdminService({
  db,
  ledgerService,
  trustService,
  referralService,
  rewardConfig,
  notificationsService,
  analytics,
  logger,
}) {
  async function logAction({
    adminId,
    actionType,
    targetType,
    targetId,
    reason,
    beforeState = null,
    afterState = null,
    metadata = {},
  }) {
    if (!ADMIN_ACTION_TYPES.includes(actionType)) {
      throw httpError(400, `invalid action type: ${actionType}`);
    }
    if (!ADMIN_TARGET_TYPES.includes(targetType)) {
      throw httpError(400, `invalid target type: ${targetType}`);
    }
    if (!reason || reason.trim().length < 3) {
      throw httpError(400, "reason is required (min 3 chars)");
    }

    const result = await db.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, reason,
          before_state, after_state, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, current_timestamp)
       RETURNING *`,
      [
        adminId,
        actionType,
        targetType,
        String(targetId),
        reason,
        beforeState ? JSON.stringify(beforeState) : null,
        afterState ? JSON.stringify(afterState) : null,
        JSON.stringify(metadata),
      ]
    );
    return result.rows[0];
  }

  /**
   * Manual point adjustment (credit or debit).
   * @param {{ adminId, userId, amount, direction, reason, metadata? }} params
   *   direction: 'credit' | 'debit'
   */
  async function adjustPoints({ adminId, userId, amount, direction, reason, metadata = {} }) {
    if (amount <= 0) throw httpError(400, "amount must be positive");
    if (!["credit", "debit"].includes(direction)) {
      throw httpError(400, "direction must be credit or debit");
    }
    if (!reason || reason.trim().length < 3) {
      throw httpError(400, "reason required");
    }

    const before = await ledgerService.getAccountState(userId);
    const source = "admin_adjustment";
    const idempotencyKey = `admin_adj:${adminId}:${Date.now()}:${userId}`;

    let entry;
    if (direction === "credit") {
      entry = await ledgerService.creditPoints({
        userId,
        amount,
        source,
        referenceId: idempotencyKey,
        referenceType: "admin_action",
        idempotencyKey,
        metadata: { reason, admin_id: adminId, ...metadata },
        bypassDailyCap: true,
      });
    } else {
      entry = await ledgerService.debitPoints({
        userId,
        amount,
        source,
        referenceId: idempotencyKey,
        referenceType: "admin_action",
        idempotencyKey,
        metadata: { reason, admin_id: adminId, ...metadata },
        allowFrozen: true,
      });
    }

    await logAction({
      adminId,
      actionType: direction === "credit" ? "manual_credit" : "manual_debit",
      targetType: "user",
      targetId: userId,
      reason,
      beforeState: { balance: before.balance },
      afterState: { balance: entry.balance_after },
      metadata: { amount, ledger_entry_id: entry.id },
    });

    if (analytics) {
      analytics
        .track(
          direction === "credit"
            ? "rewards.admin.credit"
            : "rewards.admin.debit",
          {
            user_id: userId,
            admin_id: adminId,
            amount,
            balance_after: entry.balance_after,
          }
        )
        .catch(() => {});
    }

    return { ledger_entry: entry, before_balance: before.balance };
  }

  /**
   * Freeze or unfreeze a reward account.
   */
  async function setAccountFrozen({ adminId, userId, frozen, reason }) {
    if (!reason) throw httpError(400, "reason required");
    const before = await ledgerService.getAccountState(userId);

    await db.query(
      `UPDATE reward_accounts
          SET frozen = $2,
              frozen_reason = $3,
              updated_at = current_timestamp
        WHERE user_id = $1`,
      [userId, frozen, frozen ? reason : null]
    );

    await logAction({
      adminId,
      actionType: frozen ? "freeze_account" : "unfreeze_account",
      targetType: "user",
      targetId: userId,
      reason,
      beforeState: { frozen: before.frozen },
      afterState: { frozen },
    });

    if (notificationsService && frozen) {
      notificationsService.notifyAccountFrozen({ userId, reason });
    }

    return { frozen, user_id: userId };
  }

  /**
   * Update a reward rule config value.
   */
  async function updateRule({ adminId, key, value, reason }) {
    const before = await rewardConfig.get(key);
    await rewardConfig.update(key, value, adminId);

    await logAction({
      adminId,
      actionType: "config_update",
      targetType: "config",
      targetId: key,
      reason: reason || "rule_update",
      beforeState: { value: before },
      afterState: { value },
    });
    return { key, value };
  }

  /**
   * Resolve a fraud flag (delegate to trust service + audit).
   */
  async function resolveFraudFlag({ adminId, flagId, resolution, notes }) {
    const flag = await trustService.resolveFlag({
      flagId,
      resolution,
      resolvedBy: adminId,
      notes,
    });
    await logAction({
      adminId,
      actionType: "fraud_flag_resolve",
      targetType: "fraud_flag",
      targetId: flagId,
      reason: notes || resolution,
      afterState: { status: flag.status },
    });
    return flag;
  }

  /**
   * Approve a referral reward (admin override of hold).
   */
  async function approveReferral({ adminId, referralId, reason }) {
    const result = await referralService.adminApprove({
      referralId,
      adminId,
      reason,
    });
    await logAction({
      adminId,
      actionType: "referral_approve",
      targetType: "referral",
      targetId: referralId,
      reason: reason || "admin_approve",
    });
    return result;
  }

  async function rejectReferral({ adminId, referralId, reason }) {
    const result = await referralService.adminReject({
      referralId,
      adminId,
      reason,
    });
    await logAction({
      adminId,
      actionType: "referral_reject",
      targetType: "referral",
      targetId: referralId,
      reason,
    });
    return result;
  }

  /**
   * Daily/monthly rewards spend monitor.
   * Returns credit totals against configured budget caps.
   */
  async function getBudgetStatus() {
    const [dailyCap, monthlyCap] = await Promise.all([
      rewardConfig.getNumber("daily_rewards_budget"),
      rewardConfig.getNumber("monthly_rewards_budget"),
    ]);

    const daily = await db.query(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS spent
         FROM reward_ledger_entries
        WHERE type = 'credit'
          AND voided_at IS NULL
          AND created_at >= date_trunc('day', current_timestamp)`
    );
    const monthly = await db.query(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS spent
         FROM reward_ledger_entries
        WHERE type = 'credit'
          AND voided_at IS NULL
          AND created_at >= date_trunc('month', current_timestamp)`
    );
    const dailySpent = Number(daily.rows[0].spent);
    const monthlySpent = Number(monthly.rows[0].spent);

    return {
      daily: {
        cap: dailyCap || 0,
        spent: dailySpent,
        remaining: Math.max(0, (dailyCap || 0) - dailySpent),
        utilization: dailyCap ? dailySpent / dailyCap : 0,
      },
      monthly: {
        cap: monthlyCap || 0,
        spent: monthlySpent,
        remaining: Math.max(0, (monthlyCap || 0) - monthlySpent),
        utilization: monthlyCap ? monthlySpent / monthlyCap : 0,
      },
    };
  }

  /**
   * List admin actions for audit view.
   */
  async function listAuditLog({ actionType, targetType, adminId, limit = 50, offset = 0 } = {}) {
    const clauses = [];
    const params = [];
    let idx = 1;
    if (actionType) {
      clauses.push(`action_type = $${idx++}`);
      params.push(actionType);
    }
    if (targetType) {
      clauses.push(`target_type = $${idx++}`);
      params.push(targetType);
    }
    if (adminId) {
      clauses.push(`admin_id = $${idx++}`);
      params.push(adminId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(limit, offset);

    const result = await db.query(
      `SELECT * FROM admin_actions
         ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    return {
      items: result.rows,
      limit,
      offset,
    };
  }

  return {
    adjustPoints,
    setAccountFrozen,
    updateRule,
    resolveFraudFlag,
    approveReferral,
    rejectReferral,
    getBudgetStatus,
    listAuditLog,
    logAction,
  };
}

module.exports = { createAdminService };
