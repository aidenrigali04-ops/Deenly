const { createRewardsLedgerRepository } = require("./rewards-ledger-repository");
const { planCheckoutProductRedemption } = require("./checkout-redemption-planner");
const { redemptionRulesFromAppConfig } = require("./rewards-redemption-defaults");
const { InsufficientPointsError } = require("./rewards-ledger-errors");
const { getTrustSignalThresholds } = require("../trust/trust-signal-thresholds");
const {
  maybeRewardsCheckoutHighDiscountTrustFlag,
  maybeRewardsCheckoutReversalTrustFlag,
  tryRecordTrustFlag
} = require("../trust/trust-surface-flag-builders");

function noopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function balanceStringToSafeMinor(balancePoints) {
  try {
    const b = BigInt(String(balancePoints));
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if (b > max) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (b < 0n) {
      return 0;
    }
    return Number(b);
  } catch {
    return 0;
  }
}

/**
 * Full rules object for the checkout planner (checkout path only reads `redemption`;
 * wallet display reads `rewardsBase`). All numeric policy comes from {@link loadEnv}.
 */
function buildRulesConfigFromAppConfig(config) {
  const c = config || {};
  const maxDay = Number(c.rewardsMaxEarnPerUserPerDayMinor);
  const maxMonth = Number(c.rewardsMaxEarnPerUserPerMonthMinor);
  const maxSingle = Number(c.rewardsMaxSingleGrantMinor);
  const minGrant = Number(c.rewardsMinGrantMinor);
  const ptsDec = [0, 2, 3].includes(Number(c.rewardsPointsDecimals)) ? Number(c.rewardsPointsDecimals) : 0;
  return {
    rewardsBase: {
      currencyCode: String(c.rewardsCurrencyCode || "DEEN_PTS"),
      pointsDecimals: ptsDec,
      maxEarnPerUserPerDayMinor: Number.isFinite(maxDay) && maxDay > 0 ? maxDay : 5000,
      maxEarnPerUserPerMonthMinor: Number.isFinite(maxMonth) && maxMonth > 0 ? maxMonth : 50_000,
      minGrantMinor: Number.isFinite(minGrant) && minGrant > 0 ? minGrant : 1,
      maxSingleGrantMinor: Number.isFinite(maxSingle) && maxSingle > 0 ? maxSingle : 2000
    },
    earn: {
      actionPointsMinor: {},
      minQualityForEngagementEarn: Number.isFinite(c.rewardsRulesMinQualityForEngagementEarn)
        ? c.rewardsRulesMinQualityForEngagementEarn
        : 0.55,
      minDwellSecondsForReaction: Number.isFinite(c.rewardsRulesMinDwellSecondsForReaction)
        ? c.rewardsRulesMinDwellSecondsForReaction
        : 3,
      requireQualifiedDepth: []
    },
    caps: {
      maxEarnPerUserPerDayMinor: Number.isFinite(maxDay) && maxDay > 0 ? maxDay : 5000,
      maxEarnPerUserPerMonthMinor: Number.isFinite(maxMonth) && maxMonth > 0 ? maxMonth : 50_000,
      maxSingleGrantMinor: Number.isFinite(maxSingle) && maxSingle > 0 ? maxSingle : 2000,
      minGrantMinor: Number.isFinite(minGrant) && minGrant > 0 ? minGrant : 1
    },
    antiFarming: {
      maxGrantsPerRollingHour: Number.isInteger(c.rewardsRulesMaxGrantsPerRollingHour)
        ? c.rewardsRulesMaxGrantsPerRollingHour
        : 40,
      minSecondsBetweenGrantsSameTarget: Number.isFinite(c.rewardsRulesMinSecondsBetweenGrantsSameTarget)
        ? c.rewardsRulesMinSecondsBetweenGrantsSameTarget
        : 45,
      blockPassiveSurfaces: true
    },
    redemption: redemptionRulesFromAppConfig(c),
    reversal: {
      fullRefundClawbackRatio:
        Number.isFinite(c.rewardsReversalFullRefundClawbackRatio) && c.rewardsReversalFullRefundClawbackRatio >= 0
          ? c.rewardsReversalFullRefundClawbackRatio
          : 1,
      partialRefundClawbackRatio:
        Number.isFinite(c.rewardsReversalPartialRefundClawbackRatio) && c.rewardsReversalPartialRefundClawbackRatio >= 0
          ? c.rewardsReversalPartialRefundClawbackRatio
          : 0.5,
      chargebackClawbackRatio:
        Number.isFinite(c.rewardsReversalChargebackClawbackRatio) && c.rewardsReversalChargebackClawbackRatio >= 0
          ? c.rewardsReversalChargebackClawbackRatio
          : 1,
      maxReversalAgeDays:
        Number.isInteger(c.rewardsReversalMaxAgeDays) && c.rewardsReversalMaxAgeDays > 0
          ? c.rewardsReversalMaxAgeDays
          : 120
    }
  };
}

function createRewardsCheckoutService({ db, rewardsLedgerService, config, logger, trustFlagService = null }) {
  const repository = createRewardsLedgerRepository();
  const log = logger && typeof logger.warn === "function" ? logger : noopLogger();
  const appConfig = config;

  function rulesCfg() {
    return buildRulesConfigFromAppConfig(config);
  }

  async function loadPublishedProductForRedemption(productId) {
    const r = await db.query(
      `SELECT id,
              price_minor,
              currency,
              status,
              creator_user_id,
              COALESCE(rewards_redemption_eligible, true) AS rewards_redemption_eligible
       FROM creator_products
       WHERE id = $1
         AND status = 'published'
       LIMIT 1`,
      [productId]
    );
    return r.rowCount ? r.rows[0] : null;
  }

  async function getRedemptionSnapshot(userId) {
    const bal = await rewardsLedgerService.getBalance({ userId });
    const lastIso = await repository.getLastCatalogCheckoutRedemptionAt(db.query.bind(db), userId);
    return {
      balanceMinor: balanceStringToSafeMinor(bal.balancePoints),
      lastRedemptionAtIso: lastIso
    };
  }

  /**
   * Plan-only path for checkout when `creator_products` row is already loaded (same planner as preview).
   */
  async function planProductCheckoutRedemption({
    userId,
    product,
    redeemEnabled = true,
    requestedPointsMinor,
    requestedAtIso = new Date().toISOString()
  }) {
    const snapshot = await getRedemptionSnapshot(userId);
    const plan = planCheckoutProductRedemption(
      {
        listPriceMinor: Number(product.price_minor),
        productRewardsEligible: Boolean(product.rewards_redemption_eligible),
        redeemEnabled: Boolean(redeemEnabled),
        requestedPointsMinor: requestedPointsMinor ?? null,
        snapshot,
        requestedAtIso
      },
      rulesCfg()
    );
    return { plan, snapshot, requestedAtIso };
  }

  /**
   * Ledger spend for an already-approved plan; surfaces race-safe insufficient balance as 422-shaped error.
   */
  async function applyLedgerSpendForProductCheckout({
    userId,
    plan,
    redeemClientRequestId,
    productId,
    listPriceMinor
  }) {
    if (!plan || plan.pointsToSpend <= 0) {
      return { spendRes: null, ledgerEntry: null };
    }
    try {
      const spendRes = await rewardsLedgerService.spendPoints({
        userId,
        points: plan.pointsToSpend,
        reason: "redemption_catalog",
        idempotencyKey: `checkout:product:${userId}:${redeemClientRequestId}`.slice(0, 128),
        metadata: {
          surface: "product_checkout",
          productId,
          listPriceMinor,
          discountMinor: plan.discountMinor,
          redeemClientRequestId
        }
      });
      return { spendRes, ledgerEntry: spendRes.ledgerEntry };
    } catch (err) {
      if (err instanceof InsufficientPointsError) {
        const wrap = new Error(
          "Points balance changed before checkout completed. Refresh and try again, or continue without redeeming points."
        );
        wrap.name = "CheckoutRedemptionSpendFailedError";
        wrap.statusCode = 422;
        wrap.code = "insufficient_points_at_checkout";
        wrap.cause = err;
        throw wrap;
      }
      throw err;
    }
  }

  async function previewProductRedemption({ userId, productId, requestedPointsMinor, redeemEnabled = true }) {
    const product = await loadPublishedProductForRedemption(productId);
    if (!product) {
      return { ok: false, status: 404, code: "product_not_found", message: "Product not found" };
    }
    const requestedAtIso = new Date().toISOString();
    const { plan, snapshot } = await planProductCheckoutRedemption({
      userId,
      product,
      redeemEnabled,
      requestedPointsMinor,
      requestedAtIso
    });
    return { ok: true, product, snapshot, plan, requestedAtIso };
  }

  async function insertRedemptionRecord({
    stripeCheckoutSessionId,
    buyerUserId,
    productId,
    listPriceMinor,
    discountMinor,
    pointsSpent,
    currency,
    rewardLedgerSpendEntryId
  }) {
    await db.query(
      `INSERT INTO checkout_reward_redemptions (
         stripe_checkout_session_id,
         buyer_user_id,
         product_id,
         list_price_minor,
         discount_minor,
         points_spent,
         currency,
         reward_ledger_spend_entry_id,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
      [
        stripeCheckoutSessionId,
        buyerUserId,
        productId,
        listPriceMinor,
        discountMinor,
        String(pointsSpent),
        currency,
        rewardLedgerSpendEntryId
      ]
    );
  }

  async function findRedemptionByPaymentIntentId(paymentIntentId) {
    if (!paymentIntentId) {
      return null;
    }
    const r = await db.query(
      `SELECT r.*
       FROM checkout_reward_redemptions r
       INNER JOIN checkout_sessions cs ON cs.stripe_checkout_session_id = r.stripe_checkout_session_id
       INNER JOIN orders o ON o.checkout_session_id = cs.id
       WHERE o.stripe_payment_intent_id = $1
         AND o.status IN ('completed', 'refunded')
       ORDER BY o.id DESC
       LIMIT 1`,
      [String(paymentIntentId)]
    );
    return r.rowCount ? r.rows[0] : null;
  }

  async function markRedemptionReversed(stripeCheckoutSessionId) {
    await db.query(
      `UPDATE checkout_reward_redemptions
       SET status = 'reversed', updated_at = NOW()
       WHERE stripe_checkout_session_id = $1 AND status = 'active'`,
      [stripeCheckoutSessionId]
    );
  }

  /**
   * Non-blocking trust signal after a persisted checkout redemption row (high discount ratio).
   */
  async function notifyTrustAfterRedemptionPersisted({
    buyerUserId,
    productId,
    listPriceMinor,
    discountMinor,
    pointsSpent,
    rewardLedgerSpendEntryId
  }) {
    const thr = getTrustSignalThresholds(appConfig);
    const candidate = maybeRewardsCheckoutHighDiscountTrustFlag({
      thresholds: thr,
      buyerUserId,
      productId,
      listPriceMinor,
      discountMinor,
      pointsSpent,
      ledgerEntryId: rewardLedgerSpendEntryId
    });
    await tryRecordTrustFlag(appConfig, trustFlagService, candidate);
  }

  /**
   * Ledger reversal + redemption row update for expired checkout, refund, or amount mismatch.
   * Idempotent on ledger; best-effort on DB flags.
   */
  async function reverseActiveCheckoutRedemptionIfAny({ stripeSessionId, reasonLabel }) {
    if (!rewardsLedgerService) {
      return;
    }
    const sr = await db.query(
      `SELECT buyer_user_id, metadata
       FROM checkout_sessions
       WHERE stripe_checkout_session_id = $1
       LIMIT 1`,
      [stripeSessionId]
    );
    if (sr.rowCount === 0) {
      return;
    }
    const row = sr.rows[0];
    const buyer = Number(row.buyer_user_id || 0);
    const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const ledgerId = Number(meta.rewardSpendLedgerEntryId || 0);
    if (!buyer || !ledgerId) {
      return;
    }
    const reason = String(reasonLabel || "checkout_reverse").slice(0, 64);
    const idem = `reverse:${String(reasonLabel || "r").slice(0, 24)}:${stripeSessionId}`.slice(0, 128);
    try {
      const { duplicate } = await rewardsLedgerService.reverseEntry({
        userId: buyer,
        originalLedgerEntryId: ledgerId,
        reason,
        idempotencyKey: idem,
        metadata: { surface: "product_checkout", stripeCheckoutSessionId: stripeSessionId }
      });
      if (!duplicate) {
        const thr = getTrustSignalThresholds(appConfig);
        const candidate = maybeRewardsCheckoutReversalTrustFlag({
          thresholds: thr,
          buyerUserId: buyer,
          ledgerEntryId: ledgerId,
          reasonLabel: String(reasonLabel || "")
        });
        await tryRecordTrustFlag(appConfig, trustFlagService, candidate);
      }
    } catch (err) {
      const n = err && err.name;
      if (n === "InvalidReversalError" || n === "LedgerEntryNotFoundError") {
        log.warn({ err, stripeSessionId }, "checkout_redemption_reverse_skipped");
        return;
      }
      throw err;
    }
    await markRedemptionReversed(stripeSessionId);
  }

  return {
    rulesCfg,
    loadPublishedProductForRedemption,
    getRedemptionSnapshot,
    planProductCheckoutRedemption,
    applyLedgerSpendForProductCheckout,
    previewProductRedemption,
    insertRedemptionRecord,
    findRedemptionByPaymentIntentId,
    markRedemptionReversed,
    reverseActiveCheckoutRedemptionIfAny,
    notifyTrustAfterRedemptionPersisted,
    balanceStringToSafeMinor
  };
}

module.exports = {
  createRewardsCheckoutService,
  buildRulesConfigFromAppConfig,
  balanceStringToSafeMinor
};
