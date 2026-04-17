/**
 * Ranking signal ingestion hooks (Growth / feed modifiers).
 *
 * Signals used by feed ranking are read at query time from `post_views`, `interactions`,
 * `orders`, `reports`, and `seller_boost_*` (see `feed/routes.js`). These hooks emit analytics
 * and may optionally append rows to `feed_ranking_signals` when `FEED_RANKING_SIGNAL_STORE_ENABLED=true`.
 *
 * Temporary assumption: the feed query does not read `feed_ranking_signals` yet — the table is for
 * pipelines, audits, and future materialized features. Ingestion is best-effort and must never block UX.
 */

const { getTrustSignalThresholds } = require("../trust/trust-signal-thresholds");
const { maybeCommerceLargeOrderTrustFlag, tryRecordTrustFlag } = require("../trust/trust-surface-flag-builders");

const SIGNAL_SCHEMA_VERSION = 1;

/** Legacy no-op used by callers that do not wire DB persistence. */
async function ingestRankingSignalsStub(ctx = {}) {
  return { ok: true, skipped: true, schemaVersion: SIGNAL_SCHEMA_VERSION, ...ctx };
}

function shouldSampleRankingSignalEvent(config) {
  const r = Number(config?.feedRankModifierAnalyticsSampleRate ?? 0);
  return Number.isFinite(r) && r > 0 && Math.random() < r;
}

function storeSignalsEnabled(config) {
  return Boolean(config && config.feedRankingSignalStoreEnabled);
}

/**
 * @param {{ query: Function } | null} db
 * @param {object} row
 * @param {string} row.entityType
 * @param {string} row.entityId
 * @param {string} row.signalKey
 * @param {object} [row.valueJson]
 * @param {number|null} [row.valueNumeric]
 * @param {string} row.source
 */
async function persistFeedRankingSignalRow(db, row) {
  if (!db || typeof db.query !== "function") {
    return;
  }
  const valueJson = row.valueJson && typeof row.valueJson === "object" ? JSON.stringify(row.valueJson) : "{}";
  await db.query(
    `INSERT INTO feed_ranking_signals (entity_type, entity_id, signal_key, value_numeric, value_jsonb, source)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      row.entityType,
      String(row.entityId).slice(0, 64),
      String(row.signalKey).slice(0, 80),
      row.valueNumeric == null ? null : Number(row.valueNumeric),
      valueJson,
      String(row.source).slice(0, 48)
    ]
  );
}

async function maybePersistAndStub(db, config, ctx) {
  if (storeSignalsEnabled(config) && db) {
    try {
      await persistFeedRankingSignalRow(db, ctx);
    } catch {
      /* missing migration / replica lag — ignore */
    }
  }
  return { ok: true, skipped: !storeSignalsEnabled(config), schemaVersion: SIGNAL_SCHEMA_VERSION, ...ctx };
}

/**
 * @param {{ db?: { query: Function } | null; analytics?: { trackEvent?: Function } | null; config?: object } | null} deps
 */
function createRankingSignalHooks(deps = {}) {
  const analytics = deps.analytics || null;
  const config = deps.config || {};
  const db = deps.db || null;
  const trustFlagService = deps.trustFlagService || null;

  async function onPostViewSignalsWritten(payload) {
    await maybePersistAndStub(db, config, {
      kind: "post_view",
      entityType: "post",
      entityId: String(payload.postId),
      signalKey: "post_view_quality_v1",
      valueJson: {
        userId: payload.userId,
        deduped: Boolean(payload.deduped)
      },
      source: "post_views"
    });
    if (analytics && typeof analytics.trackEvent === "function" && shouldSampleRankingSignalEvent(config)) {
      try {
        await analytics.trackEvent("feed_ranking_signal_ingested", {
          schemaVersion: SIGNAL_SCHEMA_VERSION,
          surface: "post_views",
          postId: payload.postId,
          userId: payload.userId,
          deduped: Boolean(payload.deduped)
        });
      } catch {
        /* best-effort */
      }
    }
  }

  async function onCommerceRankingSignalsUpdated(payload) {
    await maybePersistAndStub(db, config, {
      kind: "commerce_order",
      entityType: "creator_product",
      entityId: String(payload.productId),
      signalKey: "product_order_completed_v1",
      valueJson: {
        orderId: payload.orderId,
        productId: payload.productId,
        buyerUserId: payload.buyerUserId,
        sellerUserId: payload.sellerUserId,
        orderAmountMinor: payload.orderAmountMinor
      },
      source: "orders_completed"
    });
    if (analytics && typeof analytics.trackEvent === "function" && shouldSampleRankingSignalEvent(config)) {
      try {
        await analytics.trackEvent("feed_ranking_signal_ingested", {
          schemaVersion: SIGNAL_SCHEMA_VERSION,
          surface: "orders_completed",
          productId: payload.productId,
          orderId: payload.orderId
        });
      } catch {
        /* best-effort */
      }
    }
    const thr = getTrustSignalThresholds(config);
    const commerceCandidate = maybeCommerceLargeOrderTrustFlag({
      thresholds: thr,
      buyerUserId: Number(payload.buyerUserId),
      sellerUserId: Number(payload.sellerUserId),
      orderId: Number(payload.orderId),
      productId: Number(payload.productId),
      amountMinor: Number(payload.orderAmountMinor)
    });
    await tryRecordTrustFlag(config, trustFlagService, commerceCandidate);
  }

  async function onSocialEngagementRankingSignalsUpdated(payload) {
    await maybePersistAndStub(db, config, {
      kind: "social_engagement",
      entityType: "post",
      entityId: String(payload.postId),
      signalKey: "interaction_created_v1",
      valueJson: {
        userId: payload.userId,
        interactionType: String(payload.interactionType || "")
      },
      source: "interactions"
    });
    if (analytics && typeof analytics.trackEvent === "function" && shouldSampleRankingSignalEvent(config)) {
      try {
        await analytics.trackEvent("feed_ranking_signal_ingested", {
          schemaVersion: SIGNAL_SCHEMA_VERSION,
          surface: "interactions",
          postId: payload.postId,
          userId: payload.userId,
          interactionType: payload.interactionType
        });
      } catch {
        /* best-effort */
      }
    }
  }

  return {
    onPostViewSignalsWritten,
    onCommerceRankingSignalsUpdated,
    onSocialEngagementRankingSignalsUpdated
  };
}

module.exports = {
  SIGNAL_SCHEMA_VERSION,
  ingestRankingSignalsStub,
  createRankingSignalHooks,
  shouldSampleRankingSignalEvent
};
