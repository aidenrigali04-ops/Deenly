const express = require("express");
const { authenticate, authorize } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");

function createAnalyticsRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });
  const modGuard = authorize(["moderator", "admin"]);

  router.get(
    "/events/summary",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
      const byDay = String(req.query.byDay || "false") === "true";
      const result = await db.query(
        `SELECT event_name,
                ${byDay ? "DATE_TRUNC('day', created_at) AS event_day," : ""}
                COUNT(*)::int AS total
         FROM analytics_events
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY event_name ${byDay ? ", DATE_TRUNC('day', created_at)" : ""}
         ORDER BY ${byDay ? "event_day DESC," : ""} total DESC`,
        [days]
      );

      res.status(200).json({
        days,
        byDay,
        totals: result.rows
      });
    })
  );

  router.get(
    "/events",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const result = await db.query(
        `SELECT id, event_name, payload, created_at
         FROM analytics_events
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      res.status(200).json({ limit, offset, items: result.rows });
    })
  );

  router.get(
    "/dashboard/funnel",
    authMiddleware,
    modGuard,
    asyncHandler(async (_req, res) => {
      const result = await db.query(
        `SELECT
           COUNT(DISTINCT CASE WHEN event_name = 'signup' THEN (payload->>'userId')::int END)::int AS signups,
           COUNT(DISTINCT CASE WHEN event_name = 'follow_user' THEN (payload->>'followerId')::int END)::int AS first_follows,
           COUNT(DISTINCT CASE WHEN event_name = 'create_post' THEN (payload->>'authorId')::int END)::int AS first_posts,
           COUNT(DISTINCT CASE WHEN event_name IN ('like_post', 'engage_post') THEN (payload->>'userId')::int END)::int AS first_interactions
         FROM analytics_events`
      );
      res.status(200).json(result.rows[0]);
    })
  );

  router.get(
    "/dashboard/retention",
    authMiddleware,
    modGuard,
    asyncHandler(async (_req, res) => {
      const result = await db.query(
        `WITH cohorts AS (
           SELECT DATE_TRUNC('day', created_at) AS cohort_day, id AS user_id
           FROM users
         ),
         activity AS (
           SELECT DISTINCT (payload->>'userId')::int AS user_id, DATE_TRUNC('day', created_at) AS activity_day
           FROM analytics_events
           WHERE payload ? 'userId'
         )
         SELECT
           COUNT(DISTINCT c.user_id)::int AS cohort_size,
           COUNT(DISTINCT CASE WHEN a.activity_day <= c.cohort_day + INTERVAL '1 day' THEN c.user_id END)::int AS d1_active,
           COUNT(DISTINCT CASE WHEN a.activity_day <= c.cohort_day + INTERVAL '7 day' THEN c.user_id END)::int AS d7_active,
           COUNT(DISTINCT CASE WHEN a.activity_day <= c.cohort_day + INTERVAL '30 day' THEN c.user_id END)::int AS d30_active
         FROM cohorts c
         LEFT JOIN activity a ON a.user_id = c.user_id`
      );
      res.status(200).json(result.rows[0]);
    })
  );

  router.get(
    "/dashboard/feed-health",
    authMiddleware,
    modGuard,
    asyncHandler(async (_req, res) => {
      const result = await db.query(
        `SELECT
           ROUND(COALESCE(AVG(completion_rate), 0), 2)::numeric AS avg_completion_rate,
           ROUND(COALESCE(AVG(watch_time_ms), 0), 2)::numeric AS avg_watch_time_ms,
           COUNT(*)::int AS total_views,
           (
             SELECT COUNT(*)::int
             FROM reports
             WHERE target_type = 'post'
               AND status IN ('open', 'reviewing')
           ) AS open_post_reports
         FROM post_views`
      );
      res.status(200).json(result.rows[0]);
    })
  );

  router.get(
    "/dashboard/monetization",
    authMiddleware,
    modGuard,
    asyncHandler(async (_req, res) => {
      const [eventsResult, orderResult] = await Promise.all([
        db.query(
          `SELECT
             COUNT(*) FILTER (WHERE event_name = 'checkout_started')::int AS checkout_started_count,
             COUNT(*) FILTER (WHERE event_name = 'purchase_completed')::int AS purchase_completed_events_count,
             COUNT(*) FILTER (WHERE event_name = 'creator_product_draft_saved')::int AS product_draft_saved_count,
             COUNT(*) FILTER (WHERE event_name = 'creator_product_published')::int AS product_published_count,
             COUNT(*) FILTER (WHERE event_name = 'creator_tier_draft_saved')::int AS tier_draft_saved_count,
             COUNT(*) FILTER (WHERE event_name = 'creator_tier_published')::int AS tier_published_count
           FROM analytics_events
           WHERE created_at >= NOW() - INTERVAL '30 days'`
        ),
        db.query(
          `SELECT
             COUNT(*)::int AS orders_completed_count,
             COALESCE(SUM(amount_minor), 0)::int AS gmv_minor,
             COALESCE(SUM(platform_fee_minor), 0)::int AS platform_fee_minor,
             COALESCE(SUM(creator_net_minor), 0)::int AS creator_net_minor
           FROM orders
           WHERE status = 'completed'
             AND created_at >= NOW() - INTERVAL '30 days'`
        )
      ]);

      const e = eventsResult.rows[0] || {};
      const o = orderResult.rows[0] || {};
      const started = Number(e.checkout_started_count || 0);
      const completed = Number(e.purchase_completed_events_count || 0);
      const checkoutConversionRate = started > 0 ? Number((completed / started).toFixed(4)) : 0;

      res.status(200).json({
        windowDays: 30,
        funnel: {
          checkoutStarted: started,
          purchasesCompletedEvents: completed,
          checkoutConversionRate
        },
        creatorFlow: {
          productDraftSaved: Number(e.product_draft_saved_count || 0),
          productPublished: Number(e.product_published_count || 0),
          tierDraftSaved: Number(e.tier_draft_saved_count || 0),
          tierPublished: Number(e.tier_published_count || 0)
        },
        economics: {
          ordersCompleted: Number(o.orders_completed_count || 0),
          gmvMinor: Number(o.gmv_minor || 0),
          platformFeeMinor: Number(o.platform_fee_minor || 0),
          creatorNetMinor: Number(o.creator_net_minor || 0)
        }
      });
    })
  );

  return router;
}

module.exports = {
  createAnalyticsRouter
};
