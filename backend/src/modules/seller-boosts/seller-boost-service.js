const { createSellerBoostRepository } = require("./seller-boost-repository");
const {
  SellerBoostInvalidStateError,
  SellerBoostNotFoundError,
  SellerBoostPostOwnershipError
} = require("./seller-boost-errors");
const { createStubSellerBoostPaymentPort } = require("./seller-boost-payment");
const {
  createSellerBoostTierResolver,
  getSellerBoostTierById
} = require("../../config/seller-boost-catalog");
const { buildSellerBoostRankingContextPayload } = require("./seller-boost-attribution");

function noopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function addDurationDaysUtc(fromDate, durationDays) {
  const d = new Date(fromDate.getTime());
  const days = Number(durationDays);
  if (!Number.isFinite(days) || days < 1) {
    throw new TypeError("durationDays must be a positive number");
  }
  d.setUTCDate(d.getUTCDate() + Math.floor(days));
  return d;
}

function validateIdempotencyKey(key) {
  const s = String(key || "").trim();
  if (s.length < 1 || s.length > 128) {
    throw new TypeError("idempotencyKey must be 1–128 characters");
  }
  return s;
}

function validateSellerUserId(userId) {
  const n = Number(userId);
  if (!Number.isInteger(n) || n < 1) {
    throw new TypeError("sellerUserId must be a positive integer");
  }
  return n;
}

function normalizePostIds(postIds) {
  if (!Array.isArray(postIds) || postIds.length === 0) {
    throw new TypeError("postIds must be a non-empty array");
  }
  const ids = postIds.map((p) => Number(p)).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length !== postIds.length) {
    throw new TypeError("postIds must be positive integers");
  }
  return ids;
}

function mapPurchaseRow(row) {
  return {
    id: row.id,
    sellerUserId: row.seller_user_id,
    checkoutSessionId: row.checkout_session_id,
    packageTierId: row.package_tier_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : null,
    canceledAt: row.canceled_at ? new Date(row.canceled_at).toISOString() : null,
    idempotencyKey: row.idempotency_key,
    paymentConfirmationId: row.payment_confirmation_id,
    metadata: row.metadata,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

function createSellerBoostService(deps) {
  const {
    db,
    analytics,
    logger,
    repository,
    config,
    resolveTier: resolveTierOverride,
    paymentPort = createStubSellerBoostPaymentPort(),
    now = () => new Date()
  } = deps;
  const resolveTier =
    resolveTierOverride ?? (config ? createSellerBoostTierResolver(config) : getSellerBoostTierById);
  const repo = repository || createSellerBoostRepository();
  const log = logger && typeof logger.warn === "function" ? logger : noopLogger();

  async function trackEvent(eventName, payload) {
    if (!analytics || typeof analytics.trackEvent !== "function") {
      return;
    }
    try {
      await analytics.trackEvent(eventName, payload);
    } catch (err) {
      log.warn({ err, eventName }, "seller_boost_analytics_failed");
    }
  }

  /**
   * Create a pending purchase + post targets. Idempotent on (seller, idempotencyKey).
   * Does not charge — use {@link #recordPaymentCompleted} when payment is ready.
   */
  async function createPurchase({
    sellerUserId,
    postIds,
    packageTierId,
    idempotencyKey,
    metadata = {},
    checkoutSessionId = null
  }) {
    const sellerId = validateSellerUserId(sellerUserId);
    const ids = normalizePostIds(postIds);
    const key = validateIdempotencyKey(idempotencyKey);
    const tier = resolveTier(packageTierId);
    if (!tier) {
      throw new TypeError("Unknown packageTierId");
    }

    const { purchase, duplicate } = await db.withTransaction(async (client) => {
      const existing = await repo.findPurchaseBySellerIdempotency(client, sellerId, key);
      if (existing) {
        return { purchase: mapPurchaseRow(existing), duplicate: true };
      }

      const owned = await repo.countPostsOwnedBySeller(client, ids, sellerId);
      if (owned !== ids.length) {
        throw new SellerBoostPostOwnershipError();
      }

      const row = await repo.insertPurchaseWithTargets(
        client,
        {
          seller_user_id: sellerId,
          checkout_session_id: checkoutSessionId,
          package_tier_id: tier.id,
          amount_minor: tier.priceMinor,
          currency: tier.currency,
          idempotency_key: key,
          metadata
        },
        ids
      );
      return { purchase: mapPurchaseRow(row), duplicate: false };
    });

    if (!duplicate) {
      await trackEvent("seller_boost_purchase_created", {
        sellerUserId: sellerId,
        purchaseId: purchase.id,
        packageTierId: tier.id,
        postIds: ids,
        amountMinor: tier.priceMinor
      });
    }

    return { purchase, duplicate };
  }

  /**
   * Mark payment received and activate boost window (starts now, ends after tier duration).
   * Idempotent on paymentConfirmationId when already active.
   */
  async function recordPaymentCompleted({
    purchaseId,
    sellerUserId,
    paymentConfirmationId,
    checkoutSessionId = null
  }) {
    const pid = Number(purchaseId);
    const sellerId = validateSellerUserId(sellerUserId);
    if (!Number.isInteger(pid) || pid < 1) {
      throw new TypeError("purchaseId must be a positive integer");
    }
    const confirm = String(paymentConfirmationId || "").trim();
    if (confirm.length < 1 || confirm.length > 255) {
      throw new TypeError("paymentConfirmationId must be 1–255 characters");
    }

    const { purchase, duplicate } = await db.withTransaction(async (client) => {
      const current = await repo.getPurchaseByIdForSeller(client, pid, sellerId);
      if (!current) {
        throw new SellerBoostNotFoundError();
      }
      if (current.status === "canceled" || current.status === "refunded") {
        throw new SellerBoostInvalidStateError("Purchase is no longer payable");
      }
      if (current.status === "expired") {
        throw new SellerBoostInvalidStateError("Purchase has expired");
      }
      if (current.status === "active") {
        if (String(current.payment_confirmation_id || "") === confirm) {
          return { purchase: mapPurchaseRow(current), duplicate: true };
        }
        throw new SellerBoostInvalidStateError("Purchase already activated with a different confirmation");
      }

      const tier = resolveTier(current.package_tier_id);
      if (!tier) {
        throw new Error("seller_boost_tier_missing_from_catalog");
      }

      const activatedAt = now();
      const startsAt = activatedAt;
      const endsAt = addDurationDaysUtc(startsAt, tier.durationDays);

      const updated = await repo.activateFromPending(client, pid, sellerId, {
        startsAtIso: startsAt.toISOString(),
        endsAtIso: endsAt.toISOString(),
        activatedAtIso: activatedAt.toISOString(),
        paymentConfirmationId: confirm,
        checkoutSessionId
      });
      if (!updated) {
        const again = await repo.getPurchaseByIdForSeller(client, pid, sellerId);
        if (again && again.status === "active" && String(again.payment_confirmation_id || "") === confirm) {
          return { purchase: mapPurchaseRow(again), duplicate: true };
        }
        throw new SellerBoostInvalidStateError("Unable to activate purchase");
      }

      return { purchase: mapPurchaseRow(updated), duplicate: false };
    });

    if (!duplicate) {
      await trackEvent("seller_boost_payment_completed", {
        sellerUserId: sellerId,
        purchaseId: purchase.id,
        paymentConfirmationId: confirm,
        startsAt: purchase.startsAt,
        endsAt: purchase.endsAt
      });
      const tierForContext = resolveTier(purchase.packageTierId);
      if (tierForContext) {
        const targetPostIds = await repo.fetchTargetsForPurchase((text, params) => db.query(text, params), purchase.id);
        await trackEvent(
          "seller_boost_ranking_modifier_context",
          buildSellerBoostRankingContextPayload({
            purchase,
            tier: tierForContext,
            targetPostIds
          })
        );
      }
    }

    return { purchase, duplicate };
  }

  /**
   * Mark purchase refunded (e.g. chargeback / payment void after activation). No payment gateway calls here.
   */
  async function recordPurchaseRefunded({ purchaseId, sellerUserId }) {
    const pid = Number(purchaseId);
    const sellerId = validateSellerUserId(sellerUserId);
    if (!Number.isInteger(pid) || pid < 1) {
      throw new TypeError("purchaseId must be a positive integer");
    }

    const refunded = await db.withTransaction(async (client) => {
      const current = await repo.getPurchaseByIdForSeller(client, pid, sellerId);
      if (!current) {
        throw new SellerBoostNotFoundError();
      }
      if (!["pending_payment", "active"].includes(String(current.status))) {
        throw new SellerBoostInvalidStateError("Purchase cannot be refunded in this state");
      }
      return repo.markRefunded(client, pid, sellerId);
    });

    if (refunded) {
      await trackEvent("seller_boost_purchase_refunded", { sellerUserId: sellerId, purchaseId: pid });
    }

    return { refunded };
  }

  async function cancelPendingPurchase({ purchaseId, sellerUserId }) {
    const pid = Number(purchaseId);
    const sellerId = validateSellerUserId(sellerUserId);
    if (!Number.isInteger(pid) || pid < 1) {
      throw new TypeError("purchaseId must be a positive integer");
    }

    const canceled = await db.withTransaction(async (client) => {
      const current = await repo.getPurchaseByIdForSeller(client, pid, sellerId);
      if (!current) {
        throw new SellerBoostNotFoundError();
      }
      if (current.status !== "pending_payment") {
        throw new SellerBoostInvalidStateError("Only pending purchases can be canceled");
      }
      return repo.cancelPending(client, pid, sellerId);
    });

    if (canceled) {
      await trackEvent("seller_boost_canceled", { sellerUserId: sellerId, purchaseId: pid });
    }

    return { canceled };
  }

  /**
   * If the purchase is active and ends_at <= asOf, mark expired.
   */
  async function expirePurchaseIfDue({ purchaseId, sellerUserId, asOf }) {
    const pid = Number(purchaseId);
    const sellerId = validateSellerUserId(sellerUserId);
    const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
    if (Number.isNaN(asOfDate.getTime())) {
      throw new TypeError("asOf must be a valid Date");
    }

    const expired = await db.withTransaction(async (client) => {
      const current = await repo.getPurchaseByIdForSeller(client, pid, sellerId);
      if (!current) {
        throw new SellerBoostNotFoundError();
      }
      return repo.expireIfDue(client, pid, asOfDate.toISOString());
    });

    if (expired) {
      await trackEvent("seller_boost_expired", {
        sellerUserId: sellerId,
        purchaseId: pid,
        asOf: asOfDate.toISOString()
      });
    }

    return { expired };
  }

  /**
   * Batch expiry for cron/worker. Emits one analytics event per expired id (bounded payload).
   */
  async function expireDuePurchases({ asOf }) {
    const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
    if (Number.isNaN(asOfDate.getTime())) {
      throw new TypeError("asOf must be a valid Date");
    }

    const ids = await db.withTransaction(async (client) => {
      return repo.expireActiveDueBatch(client, asOfDate.toISOString());
    });

    for (const id of ids) {
      await trackEvent("seller_boost_expired", { purchaseId: id, asOf: asOfDate.toISOString(), batch: true });
    }

    return { expiredIds: ids };
  }

  /**
   * Impression / attribution hook — inserts a row only when purchase is active and post is a target.
   */
  async function recordImpression({ purchaseId, postId, viewerUserId = null, metadata = {} }) {
    const pid = Number(purchaseId);
    const post = Number(postId);
    if (!Number.isInteger(pid) || pid < 1 || !Number.isInteger(post) || post < 1) {
      throw new TypeError("purchaseId and postId must be positive integers");
    }

    const recorded = await db.withTransaction(async (client) => {
      return repo.insertImpressionIfActiveTarget(client, {
        purchaseId: pid,
        postId: post,
        viewerUserId,
        metadata
      });
    });

    if (recorded) {
      await trackEvent("seller_boost_impression_recorded", {
        purchaseId: pid,
        postId: post,
        viewerUserId
      });
    }

    return { recorded };
  }

  async function getPurchase({ purchaseId, sellerUserId }) {
    const pid = Number(purchaseId);
    const sellerId = validateSellerUserId(sellerUserId);
    if (!Number.isInteger(pid) || pid < 1) {
      throw new TypeError("purchaseId must be a positive integer");
    }
    const row = await repo.fetchPurchaseForSeller((text, params) => db.query(text, params), pid, sellerId);
    if (!row) {
      return null;
    }
    return mapPurchaseRow(row);
  }

  /** Read targets for a purchase (e.g. future ranking joins). */
  async function listTargetPostIds({ purchaseId, sellerUserId }) {
    const pid = Number(purchaseId);
    const sellerId = validateSellerUserId(sellerUserId);
    const row = await repo.fetchPurchaseForSeller((text, params) => db.query(text, params), pid, sellerId);
    if (!row) {
      throw new SellerBoostNotFoundError();
    }
    return repo.fetchTargetsForPurchase((text, params) => db.query(text, params), pid);
  }

  async function listMyPurchases({ sellerUserId, limit = 20 }) {
    const sellerId = validateSellerUserId(sellerUserId);
    const rows = await repo.listPurchasesForSeller((text, params) => db.query(text, params), sellerId, limit);
    return { items: rows.map(mapPurchaseRow) };
  }

  return {
    createPurchase,
    recordPaymentCompleted,
    recordPurchaseRefunded,
    cancelPendingPurchase,
    expirePurchaseIfDue,
    expireDuePurchases,
    recordImpression,
    getPurchase,
    listTargetPostIds,
    listMyPurchases,
    paymentPort
  };
}

module.exports = {
  createSellerBoostService,
  addDurationDaysUtc,
  mapPurchaseRow
};
