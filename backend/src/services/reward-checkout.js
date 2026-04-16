/**
 * Checkout Orchestration Service
 *
 * Orchestrates reward touchpoints during order checkout:
 *   - Preview earn: how many points will be earned for a given cart
 *   - Preview redemption: how many points can be applied as discount
 *   - Apply redemption: debit points, bind to order, return discount
 *   - Confirm earn: credit points after order is paid
 *   - Refund/clawback: void redemption debit, clawback earn on refund
 *
 * This is the single entry point used by the checkout/orders module so
 * business rules stay in one place.
 */

const { httpError } = require("../utils/http-error");

/**
 * @param {{ db, ledgerService, rulesEngine, tierService, streakService, rewardConfig, analytics?, logger? }} deps
 */
function createCheckoutService({
  db,
  ledgerService,
  rulesEngine,
  tierService,
  streakService,
  rewardConfig,
  analytics,
  logger,
}) {
  /**
   * Preview points to be earned for a cart.
   * @param {{ userId, cartTotalMinor }} params
   */
  async function previewEarn({ userId, cartTotalMinor }) {
    if (!cartTotalMinor || cartTotalMinor <= 0) {
      return { earn_points: 0, reason: "empty_cart" };
    }

    const tierInfo = await tierService.getTierInfo(userId);
    const streakState = await streakService.getStreakState(userId);
    const dailyStatus = await ledgerService.getDailyEarnStatus(userId);
    const dailyCap = await rewardConfig.getDailyEarnCap(tierInfo.tier);

    const calc = await rulesEngine.calculatePurchaseEarn({
      orderAmountMinor: cartTotalMinor,
      tier: tierInfo.tier,
      streakMultiplier: streakState.multiplier,
      earnedToday: dailyStatus.earnedToday,   // camelCase — matches getDailyEarnStatus return shape
      dailyCap,
    });

    return {
      earn_points: calc.finalEarn,
      base_points: calc.basePoints,
      tier_multiplier: calc.tierMultiplier,
      streak_multiplier: calc.streakMultiplier,
      combined_multiplier: calc.combinedMultiplier,
      daily_cap: dailyCap,
      earned_today: dailyStatus.earnedToday,
      capped: calc.rawEarn > calc.finalEarn,
      eligible: calc.eligible,
      ineligible_reason: calc.ineligibleReason,
    };
  }

  /**
   * Preview how many points can be redeemed against a cart.
   * @param {{ userId, cartTotalMinor, requestedPoints? }} params
   */
  async function previewRedemption({ userId, cartTotalMinor, requestedPoints = null }) {
    const account = await ledgerService.getAccountState(userId);
    if (account.frozen) {
      return { eligible: false, reason: "account_frozen", max_points: 0, discount_minor: 0 };
    }

    const elig = await rulesEngine.calculateRedemptionEligibility({
      balance: account.balance,
      orderAmountMinor: cartTotalMinor,
    });

    const maxPoints = elig.maxRedeemablePoints;
    const usePoints = requestedPoints != null
      ? Math.min(requestedPoints, maxPoints)
      : maxPoints;
    const discountMinor = await rulesEngine.pointsToDollars(usePoints);

    return {
      eligible: elig.eligible && usePoints >= elig.minRedemptionPoints,
      balance: account.balance,
      max_points: maxPoints,
      max_redeemable_reason: elig.maxRedeemableReason,
      requested_points: usePoints,
      discount_minor: discountMinor,
      min_redemption_points: elig.minRedemptionPoints,
    };
  }

  /**
   * Apply a redemption: debit points from the ledger and attach to the order.
   * Idempotent on (orderId, 'redeem').
   * @param {{ userId, orderId, pointsToRedeem, cartTotalMinor }} params
   */
  async function applyRedemption({ userId, orderId, pointsToRedeem, cartTotalMinor }) {
    if (pointsToRedeem <= 0) throw httpError(400, "pointsToRedeem must be positive");

    const preview = await previewRedemption({
      userId,
      cartTotalMinor,
      requestedPoints: pointsToRedeem,
    });
    if (!preview.eligible) {
      throw httpError(409, `redemption not eligible: ${preview.reason || "unknown"}`);
    }
    if (pointsToRedeem > preview.max_points) {
      throw httpError(400, `exceeds max redemption (${preview.max_points})`);
    }

    const idempotencyKey = `redeem:${orderId}`;
    const entry = await ledgerService.debitPoints({
      userId,
      amount: pointsToRedeem,
      source: "order_redemption",
      referenceId: String(orderId),
      referenceType: "order",
      idempotencyKey,
      metadata: { cart_total_minor: cartTotalMinor },
    });

    if (analytics) {
      analytics
        .track("rewards.points.redeemed", {
          user_id: userId,
          order_id: orderId,
          amount: pointsToRedeem,
          discount_minor: preview.discount_minor,
          balance_after: entry.balance_after,
        })
        .catch(() => {});
    }

    return {
      ledger_entry_id: entry.id,
      points_redeemed: pointsToRedeem,
      discount_minor: preview.discount_minor,
      balance_after: entry.balance_after,
    };
  }

  /**
   * Confirm earn after order is paid. Idempotent on (orderId, 'earn').
   * @param {{ userId, orderId, paidAmountMinor }} params
   */
  async function confirmEarn({ userId, orderId, paidAmountMinor }) {
    if (!paidAmountMinor || paidAmountMinor <= 0) {
      return { credited: false, reason: "zero_amount" };
    }
    const minOrder = await rewardConfig.getNumber("min_order_for_earn_minor");
    if (paidAmountMinor < (minOrder || 100)) {
      return { credited: false, reason: "below_min_order", points: 0 };
    }

    const preview = await previewEarn({ userId, cartTotalMinor: paidAmountMinor });
    if (preview.earn_points <= 0) {
      return { credited: false, reason: "no_earn", points: 0 };
    }

    const tierInfo = await tierService.getTierInfo(userId);
    const idempotencyKey = `earn:${orderId}`;
    const entry = await ledgerService.creditPoints({
      userId,
      amount: preview.earn_points,
      source: "order_earn",
      referenceId: String(orderId),
      referenceType: "order",
      idempotencyKey,
      tierAtEarn: tierInfo.tier,
      multiplierApplied: preview.combined_multiplier,
      metadata: {
        order_amount_minor: paidAmountMinor,
        base_points: preview.base_points,
        tier_multiplier: preview.tier_multiplier,
        streak_multiplier: preview.streak_multiplier,
      },
    });

    // Nudge tier requalification
    try {
      await tierService.requalify(userId);
    } catch (err) {
      if (logger) logger.warn({ err, userId }, "checkout.requalify.failed");
    }

    if (analytics) {
      analytics
        .track("rewards.points.earned", {
          user_id: userId,
          order_id: orderId,
          amount: preview.earn_points,
          source: "order_earn",
          tier_at_earn: tierInfo.tier,
          multiplier_applied: preview.combined_multiplier,
          balance_after: entry.balance_after,
        })
        .catch(() => {});
    }

    return {
      credited: true,
      points: preview.earn_points,
      ledger_entry_id: entry.id,
      balance_after: entry.balance_after,
    };
  }

  /**
   * On refund: void both the earn entry and the redemption entry (if any).
   * @param {{ userId, orderId, reason? }} params
   */
  async function refundOrder({ userId, orderId, reason = "order_refunded" }) {
    const results = { earn_voided: false, redemption_voided: false };

    const earnKey = `earn:${orderId}`;
    const redeemKey = `redeem:${orderId}`;

    const earnEntry = await db.query(
      "SELECT * FROM reward_ledger_entries WHERE idempotency_key = $1",
      [earnKey]
    );
    if (earnEntry.rowCount > 0 && !earnEntry.rows[0].voided_at) {
      await ledgerService.voidEntry({
        ledgerEntryId: earnEntry.rows[0].id,
        reason: `${reason}:earn_clawback`,
      });
      results.earn_voided = true;
      results.earn_amount = earnEntry.rows[0].amount;
    }

    const redeemEntry = await db.query(
      "SELECT * FROM reward_ledger_entries WHERE idempotency_key = $1",
      [redeemKey]
    );
    if (redeemEntry.rowCount > 0 && !redeemEntry.rows[0].voided_at) {
      await ledgerService.voidEntry({
        ledgerEntryId: redeemEntry.rows[0].id,
        reason: `${reason}:redemption_refund`,
      });
      results.redemption_voided = true;
      results.redemption_amount = Math.abs(redeemEntry.rows[0].amount);
    }

    if (analytics) {
      analytics
        .track("rewards.order.refunded", {
          user_id: userId,
          order_id: orderId,
          ...results,
        })
        .catch(() => {});
    }

    return results;
  }

  return {
    previewEarn,
    previewRedemption,
    applyRedemption,
    confirmEarn,
    refundOrder,
  };
}

module.exports = { createCheckoutService };
