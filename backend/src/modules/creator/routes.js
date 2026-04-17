const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { resolveTargetCreatorUserId } = require("./creator-analytics-access");
const {
  getSellerBoostSummary,
  listSellerBoostPurchases,
  getSellerBoostPurchaseDetail
} = require("./seller-boost-analytics");

function createCreatorRouter({ db, config, mediaStorage }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  router.get(
    "/analytics/overview",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const creatorUserId = resolveTargetCreatorUserId(
        req,
        req.query.creatorUserId != null && String(req.query.creatorUserId).trim() !== ""
          ? Number(req.query.creatorUserId)
          : null
      );
      const overview = await db.query(
        `SELECT
           COALESCE(SUM(pv_count.total_views), 0)::int AS views,
           COALESCE(SUM(i_count.total_engagement), 0)::int AS engagement,
           COALESCE(SUM(o_count.purchases), 0)::int AS purchases,
           COALESCE(SUM(o_count.gross_minor), 0)::int AS gross_minor,
           COALESCE(SUM(o_count.earnings_minor), 0)::int AS earnings_minor
         FROM posts p
         LEFT JOIN (
           SELECT post_id, COUNT(*)::int AS total_views
           FROM post_views
           GROUP BY post_id
         ) pv_count ON pv_count.post_id = p.id
         LEFT JOIN (
           SELECT post_id, COUNT(*)::int AS total_engagement
           FROM interactions
           WHERE deleted_at IS NULL
             AND interaction_type IN ('benefited', 'comment')
           GROUP BY post_id
         ) i_count ON i_count.post_id = p.id
         LEFT JOIN (
           SELECT ppl.post_id,
                  COUNT(*)::int AS purchases,
                  COALESCE(SUM(o.amount_minor), 0)::int AS gross_minor,
                  COALESCE(SUM(o.creator_net_minor), 0)::int AS earnings_minor
           FROM post_product_links ppl
           JOIN orders o ON o.product_id = ppl.product_id
           WHERE o.status = 'completed'
           GROUP BY ppl.post_id
         ) o_count ON o_count.post_id = p.id
         WHERE p.author_id = $1`,
        [creatorUserId]
      );
      res.status(200).json({ creatorUserId, ...overview.rows[0] });
    })
  );

  router.get(
    "/analytics/conversion",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const creatorUserId = resolveTargetCreatorUserId(
        req,
        req.query.creatorUserId != null && String(req.query.creatorUserId).trim() !== ""
          ? Number(req.query.creatorUserId)
          : null
      );
      const conversion = await db.query(
        `WITH views AS (
           SELECT p.author_id AS creator_user_id, COUNT(*)::int AS views_count
           FROM post_views pv
           JOIN posts p ON p.id = pv.post_id
           WHERE p.author_id = $1
           GROUP BY p.author_id
         ),
         cta_clicks AS (
           SELECT COUNT(*)::int AS clicks_count
           FROM analytics_events ae
           WHERE ae.event_name = 'creator_cta_click'
             AND (ae.payload->>'authorId')::int = $1
         ),
         purchases AS (
           SELECT COUNT(*)::int AS purchases_count
           FROM orders o
           WHERE o.seller_user_id = $1
             AND o.status = 'completed'
         )
         SELECT
           COALESCE(v.views_count, 0)::int AS views,
           COALESCE(c.clicks_count, 0)::int AS clicks,
           COALESCE(p.purchases_count, 0)::int AS purchases,
           CASE WHEN COALESCE(v.views_count, 0) = 0 THEN 0
                ELSE ROUND((COALESCE(c.clicks_count, 0)::numeric / v.views_count::numeric) * 100, 2)
           END AS ctr_percent,
           CASE WHEN COALESCE(c.clicks_count, 0) = 0 THEN 0
                ELSE ROUND((COALESCE(p.purchases_count, 0)::numeric / c.clicks_count::numeric) * 100, 2)
           END AS click_to_purchase_percent
         FROM views v
         FULL OUTER JOIN cta_clicks c ON true
         FULL OUTER JOIN purchases p ON true`,
        [creatorUserId]
      );
      res.status(200).json({ creatorUserId, ...conversion.rows[0] });
    })
  );

  router.get(
    "/analytics/seller-boosts/summary",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const sellerUserId = resolveTargetCreatorUserId(
        req,
        req.query.creatorUserId != null && String(req.query.creatorUserId).trim() !== ""
          ? Number(req.query.creatorUserId)
          : null
      );
      const summary = await getSellerBoostSummary(db, sellerUserId);
      res.status(200).json(summary);
    })
  );

  router.get(
    "/analytics/seller-boosts",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const sellerUserId = resolveTargetCreatorUserId(
        req,
        req.query.creatorUserId != null && String(req.query.creatorUserId).trim() !== ""
          ? Number(req.query.creatorUserId)
          : null
      );
      const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const items = await listSellerBoostPurchases(db, sellerUserId, { limit, offset });
      res.status(200).json({ sellerUserId, items, limit, offset });
    })
  );

  router.get(
    "/analytics/seller-boosts/:purchaseId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const sellerUserId = resolveTargetCreatorUserId(
        req,
        req.query.creatorUserId != null && String(req.query.creatorUserId).trim() !== ""
          ? Number(req.query.creatorUserId)
          : null
      );
      const purchaseId = Number(req.params.purchaseId);
      if (!purchaseId) {
        throw httpError(400, "purchaseId must be a number");
      }
      const detail = await getSellerBoostPurchaseDetail(db, sellerUserId, purchaseId);
      if (!detail) {
        throw httpError(404, "Boost purchase not found");
      }
      res.status(200).json(detail);
    })
  );

  router.get(
    "/storefront/:creatorId",
    asyncHandler(async (req, res) => {
      const creatorId = Number(req.params.creatorId);
      if (!creatorId) {
        throw httpError(400, "creatorId must be a number");
      }
      const profile = await db.query(
        `SELECT p.user_id, p.display_name, p.bio, p.avatar_url
         FROM profiles p
         WHERE p.user_id = $1
         LIMIT 1`,
        [creatorId]
      );
      if (profile.rowCount === 0) {
        throw httpError(404, "Creator not found");
      }
      const products = await db.query(
        `SELECT id, title, description, price_minor, currency, created_at
         FROM creator_products
         WHERE creator_user_id = $1
           AND status = 'published'
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
        [creatorId]
      );
      const tiers = await db.query(
        `SELECT id, title, description, monthly_price_minor, currency
         FROM creator_subscription_tiers
         WHERE creator_user_id = $1
           AND status = 'published'
         ORDER BY monthly_price_minor ASC, id ASC`,
        [creatorId]
      );
      const item = profile.rows[0];
      res.status(200).json({
        creator: {
          ...item,
          avatar_url: mediaStorage?.resolveMediaUrl
            ? mediaStorage.resolveMediaUrl({
                mediaKey: item.avatar_url,
                mediaUrl: item.avatar_url
              })
            : item.avatar_url
        },
        products: products.rows,
        tiers: tiers.rows
      });
    })
  );

  return router;
}

module.exports = {
  createCreatorRouter
};
