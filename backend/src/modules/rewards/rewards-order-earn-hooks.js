const { orderQualifiesForReferral } = require("../referrals/referral-qualification");
const { getReferralDomainConfig } = require("../referrals/referral-config");
const { InvalidReversalError } = require("./rewards-ledger-errors");

function noopLogger() {
  return { info() {}, warn() {}, error() {} };
}

const SURFACE_ORDER_PAID = "order_payment_completed";

/**
 * Stripe-settled buyer purchase earns (purchase_completed, first_product_order_completed).
 * Uses {@link createRewardsEarnService} so caps + shared rules engine apply.
 *
 * Referral qualified earns stay in referral-service (separate idempotency keys — no double credit).
 */
function createRewardsOrderEarnHooks({ db, rewardsEarnService, rewardsLedgerService, appConfig, logger }) {
  const log = logger && typeof logger.warn === "function" ? logger : noopLogger();

  async function poolQuery(text, params) {
    return db.query(text, params);
  }

  async function loadOrderRow(orderId) {
    const r = await poolQuery(
      `SELECT id,
              buyer_user_id,
              seller_user_id,
              kind,
              amount_minor,
              status
       FROM orders
       WHERE id = $1
       LIMIT 1`,
      [orderId]
    );
    return r.rows[0] || null;
  }

  async function countCompletedProductOrdersForBuyer(buyerUserId) {
    const r = await poolQuery(
      `SELECT COUNT(*)::int AS c
       FROM orders
       WHERE buyer_user_id = $1
         AND kind = 'product'
         AND status = 'completed'`,
      [buyerUserId]
    );
    return Number(r.rows[0]?.c ?? 0);
  }

  function buildFacts({ buyerUserId, actionKey }) {
    return {
      actorUserId: buyerUserId,
      actionKey,
      occurredAtIso: new Date().toISOString(),
      surfaceKey: SURFACE_ORDER_PAID,
      isSelfTarget: false
    };
  }

  /**
   * After `orders` row exists with status `completed` (post-commit in Stripe webhook).
   */
  async function afterOrderCompletedEarn({ orderId }) {
    if (!rewardsEarnService || !orderId) {
      return { skipped: "no_service" };
    }
    const order = await loadOrderRow(orderId);
    if (!order || String(order.status) !== "completed") {
      return { skipped: "order_not_completed" };
    }
    const buyerId = order.buyer_user_id != null ? Number(order.buyer_user_id) : null;
    if (!buyerId || buyerId < 1) {
      return { skipped: "no_buyer" };
    }

    const refCfg = getReferralDomainConfig(appConfig);
    const q = orderQualifiesForReferral(order, refCfg);
    if (!q.ok) {
      return { skipped: q.reason };
    }

    const out = {};
    const orderKind = String(order.kind || "");

    try {
      const r1 = await rewardsEarnService.tryCreditEarnFromVerifiedAction({
        userId: buyerId,
        facts: buildFacts({
          buyerUserId: buyerId,
          actionKey: "purchase_completed"
        }),
        signals: {},
        idempotencyKey: `buyer_purchase:completed:order:${orderId}`,
        metadata: { orderId, orderKind }
      });
      out.purchaseCompleted = {
        credited: r1.credited,
        duplicate: r1.duplicate,
        denyReasons: r1.decision?.denyReasons
      };
    } catch (err) {
      log.warn({ err, orderId }, "rewards_order_earn_purchase_completed_failed");
      out.purchaseCompleted = { error: true };
    }

    if (orderKind === "product") {
      const n = await countCompletedProductOrdersForBuyer(buyerId);
      if (n === 1) {
        try {
          const r2 = await rewardsEarnService.tryCreditEarnFromVerifiedAction({
            userId: buyerId,
            facts: buildFacts({
              buyerUserId: buyerId,
              actionKey: "first_product_order_completed"
            }),
            signals: {},
            idempotencyKey: `buyer_purchase:first_product:user:${buyerId}`,
            metadata: { orderId, orderKind }
          });
          out.firstProductOrder = {
            credited: r2.credited,
            duplicate: r2.duplicate,
            denyReasons: r2.decision?.denyReasons
          };
        } catch (err) {
          log.warn({ err, orderId, buyerId }, "rewards_order_earn_first_product_failed");
          out.firstProductOrder = { error: true };
        }
      }
    }

    return out;
  }

  async function tryReverseEarnByIdempotencyKey({
    userId,
    earnIdempotencyKey,
    reverseIdempotencyKey,
    orderId,
    reversalReason = "order_refunded"
  }) {
    if (!rewardsLedgerService || typeof rewardsLedgerService.reverseEntry !== "function") {
      return { reversed: false };
    }
    const row = await rewardsLedgerService.findLedgerEntryRowByUserIdempotencyKey(userId, earnIdempotencyKey);
    if (!row || String(row.entry_kind) !== "earn") {
      return { reversed: false };
    }
    try {
      await rewardsLedgerService.reverseEntry({
        userId,
        originalLedgerEntryId: row.id,
        reason: reversalReason,
        idempotencyKey: reverseIdempotencyKey,
        metadata: { orderId, originalIdempotencyKey: earnIdempotencyKey }
      });
      return { reversed: true };
    } catch (err) {
      if (err instanceof InvalidReversalError) {
        return { reversed: false, already: true };
      }
      log.warn({ err, userId, orderId, earnIdempotencyKey }, "rewards_order_earn_reverse_failed");
      throw err;
    }
  }

  /**
   * Compensating reversals when an order leaves the financially-completed state (refund, dispute loss, etc.).
   * Referral clawbacks remain in referral-service.
   * @param {{ orderId: number, buyerUserId: number, ledgerReversalReason?: string }} params
   */
  async function reverseEarnsForRefundedOrder({ orderId, buyerUserId, ledgerReversalReason = "order_refunded" }) {
    if (!rewardsLedgerService || !orderId || !buyerUserId) {
      return { skipped: "no_ledger" };
    }
    const uid = Number(buyerUserId);
    if (!Number.isInteger(uid) || uid < 1) {
      return { skipped: "bad_buyer" };
    }

    const purchaseKey = `buyer_purchase:completed:order:${orderId}`;
    const purchaseRevKey = `buyer_purchase:rev:completed:order:${orderId}`;

    let purchaseReverse = { reversed: false };
    try {
      purchaseReverse = await tryReverseEarnByIdempotencyKey({
        userId: uid,
        earnIdempotencyKey: purchaseKey,
        reverseIdempotencyKey: purchaseRevKey,
        orderId,
        reversalReason: ledgerReversalReason
      });
    } catch {
      purchaseReverse = { reversed: false, error: true };
    }

    const firstKey = `buyer_purchase:first_product:user:${uid}`;
    const firstRow = await rewardsLedgerService.findLedgerEntryRowByUserIdempotencyKey(uid, firstKey);
    let firstReverse = { reversed: false };
    if (firstRow && String(firstRow.entry_kind) === "earn") {
      const meta = firstRow.metadata && typeof firstRow.metadata === "object" ? firstRow.metadata : {};
      const linkedOrder = meta.orderId != null ? Number(meta.orderId) : NaN;
      if (linkedOrder === Number(orderId)) {
        const firstRevKey = `buyer_purchase:rev:first_product:user:${uid}:order:${orderId}`;
        try {
          firstReverse = await tryReverseEarnByIdempotencyKey({
            userId: uid,
            earnIdempotencyKey: firstKey,
            reverseIdempotencyKey: firstRevKey,
            orderId,
            reversalReason: ledgerReversalReason
          });
        } catch {
          firstReverse = { reversed: false, error: true };
        }
      }
    }

    return { purchaseCompleted: purchaseReverse, firstProductOrder: firstReverse };
  }

  return {
    afterOrderCompletedEarn,
    reverseEarnsForRefundedOrder
  };
}

module.exports = {
  createRewardsOrderEarnHooks,
  SURFACE_ORDER_PAID
};
