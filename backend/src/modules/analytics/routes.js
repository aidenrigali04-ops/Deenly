const express = require("express");
const { authenticate, authorize } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");

function createAnalyticsRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });
  const modGuard = authorize(["moderator", "admin"]);

  router.post(
    "/events/client",
    authMiddleware,
    asyncHandler(async (req, res) => {
      if (!config.growthExperimentsEnabled) {
        return res.status(404).json({ message: "Client analytics experiments are not enabled" });
      }
      const eventName = String(req.body?.eventName || "").trim();
      if (!eventName || eventName.length > 128 || !/^[a-z0-9_]+$/i.test(eventName)) {
        return res.status(400).json({ message: "eventName is required and must be alphanumeric/underscore" });
      }

      const source = String(req.body?.source || "unknown").trim().slice(0, 64) || "unknown";
      const surface = String(req.body?.surface || "unknown").trim().slice(0, 64) || "unknown";
      const platform = String(req.body?.platform || "unknown").trim().slice(0, 32) || "unknown";
      const experimentId = String(req.body?.experimentId || "").trim().slice(0, 96) || null;
      const variantId = String(req.body?.variantId || "").trim().slice(0, 64) || null;
      const persona = String(req.body?.persona || "").trim().slice(0, 32) || null;
      const properties = req.body?.properties && typeof req.body.properties === "object" ? req.body.properties : {};

      await db.query(
        `INSERT INTO analytics_events (event_name, payload)
         VALUES ($1, $2::jsonb)`,
        [
          eventName,
          JSON.stringify({
            userId: req.user.id,
            source,
            surface,
            platform,
            experimentId,
            variantId,
            persona,
            properties
          })
        ]
      );

      res.status(201).json({ ok: true });
    })
  );

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

  router.get(
    "/dashboard/growth",
    authMiddleware,
    modGuard,
    asyncHandler(async (_req, res) => {
      const result = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE event_name = 'offer_attach_prompt_shown')::int AS offer_attach_prompt_shown,
           COUNT(*) FILTER (WHERE event_name = 'offer_attached_to_post')::int AS offer_attached_to_post,
           COUNT(*) FILTER (WHERE event_name = 'checkout_started')::int AS checkout_started,
           COUNT(*) FILTER (WHERE event_name = 'checkout_completed')::int AS checkout_completed,
           COUNT(*) FILTER (WHERE event_name = 'quick_actions_shown')::int AS quick_actions_shown,
           COUNT(*) FILTER (WHERE event_name = 'quick_action_clicked')::int AS quick_action_clicked,
           COUNT(*) FILTER (WHERE event_name = 'resume_flow_clicked')::int AS resume_flow_clicked,
           COUNT(*) FILTER (WHERE event_name = 'task_completed')::int AS task_completed
         FROM analytics_events
         WHERE created_at >= NOW() - INTERVAL '30 days'`
      );
      const row = result.rows[0] || {};
      const checkoutStarted = Number(row.checkout_started || 0);
      const checkoutCompleted = Number(row.checkout_completed || 0);
      const quickShown = Number(row.quick_actions_shown || 0);
      const quickClicked = Number(row.quick_action_clicked || 0);
      res.status(200).json({
        windowDays: 30,
        financial: {
          offerAttachPromptShown: Number(row.offer_attach_prompt_shown || 0),
          offerAttachedToPost: Number(row.offer_attached_to_post || 0),
          checkoutStarted,
          checkoutCompleted,
          checkoutConversionRate: checkoutStarted > 0 ? Number((checkoutCompleted / checkoutStarted).toFixed(4)) : 0
        },
        convenience: {
          quickActionsShown: quickShown,
          quickActionClicked: quickClicked,
          quickActionCtr: quickShown > 0 ? Number((quickClicked / quickShown).toFixed(4)) : 0,
          resumeFlowClicked: Number(row.resume_flow_clicked || 0)
        },
        time: {
          taskCompleted: Number(row.task_completed || 0)
        }
      });
    })
  );

  router.get(
    "/dashboard/experiments",
    authMiddleware,
    modGuard,
    asyncHandler(async (_req, res) => {
      const result = await db.query(
        `SELECT
           COALESCE(payload->>'experimentId', 'none') AS experiment_id,
           COALESCE(payload->>'variantId', 'none') AS variant_id,
           COUNT(*)::int AS total_events,
           COUNT(*) FILTER (WHERE event_name = 'offer_attach_prompt_shown')::int AS offer_prompt_shown,
           COUNT(*) FILTER (WHERE event_name = 'offer_attached_to_post')::int AS offer_attached,
           COUNT(*) FILTER (WHERE event_name = 'task_completed')::int AS task_completed,
           COUNT(*) FILTER (WHERE event_name = 'quick_actions_shown')::int AS quick_actions_shown,
           COUNT(*) FILTER (WHERE event_name = 'quick_action_clicked')::int AS quick_action_clicked,
           COUNT(*) FILTER (WHERE event_name = 'resume_flow_clicked')::int AS resume_flow_clicked
         FROM analytics_events
         WHERE created_at >= NOW() - INTERVAL '30 days'
           AND payload ? 'experimentId'
         GROUP BY COALESCE(payload->>'experimentId', 'none'), COALESCE(payload->>'variantId', 'none')
         ORDER BY total_events DESC`
      );
      const items = result.rows.map((row) => {
        const quickShown = Number(row.quick_actions_shown || 0);
        const quickClicked = Number(row.quick_action_clicked || 0);
        const promptShown = Number(row.offer_prompt_shown || 0);
        const attached = Number(row.offer_attached || 0);
        return {
          experimentId: row.experiment_id,
          variantId: row.variant_id,
          totalEvents: Number(row.total_events || 0),
          offerPromptShown: promptShown,
          offerAttached: attached,
          attachRate: promptShown > 0 ? Number((attached / promptShown).toFixed(4)) : 0,
          taskCompleted: Number(row.task_completed || 0),
          quickActionsShown: quickShown,
          quickActionClicked: quickClicked,
          quickActionCtr: quickShown > 0 ? Number((quickClicked / quickShown).toFixed(4)) : 0,
          resumeFlowClicked: Number(row.resume_flow_clicked || 0)
        };
      });
      const winnerByExperiment = {};
      for (const item of items) {
        const key = item.experimentId;
        const score = (item.attachRate || 0) * 0.6 + (item.quickActionCtr || 0) * 0.4;
        const existing = winnerByExperiment[key];
        if (!existing || score > existing.score) {
          winnerByExperiment[key] = {
            experimentId: key,
            variantId: item.variantId,
            score: Number(score.toFixed(4)),
            rationale: "weighted_attach_and_quick_action_ctr"
          };
        }
      }
      res.status(200).json({ windowDays: 30, items, winnerByExperiment: Object.values(winnerByExperiment) });
    })
  );

  router.get(
    "/dashboard/rollout-status",
    authMiddleware,
    modGuard,
    asyncHandler(async (_req, res) => {
      const [growthResult, monetizationResult, reportsResult] = await Promise.all([
        db.query(
          `SELECT
             COUNT(*) FILTER (WHERE event_name = 'quick_actions_shown')::int AS quick_actions_shown,
             COUNT(*) FILTER (WHERE event_name = 'quick_action_clicked')::int AS quick_action_clicked
           FROM analytics_events
           WHERE created_at >= NOW() - INTERVAL '14 days'`
        ),
        db.query(
          `SELECT
             COUNT(*) FILTER (WHERE event_name = 'checkout_started')::int AS checkout_started,
             COUNT(*) FILTER (WHERE event_name = 'checkout_completed')::int AS checkout_completed
           FROM analytics_events
           WHERE created_at >= NOW() - INTERVAL '14 days'`
        ),
        db.query(
          `SELECT COUNT(*)::int AS open_reports
           FROM reports
           WHERE status IN ('open', 'reviewing')`
        )
      ]);

      const growth = growthResult.rows[0] || {};
      const monetization = monetizationResult.rows[0] || {};
      const reports = reportsResult.rows[0] || {};

      const quickShown = Number(growth.quick_actions_shown || 0);
      const quickClicked = Number(growth.quick_action_clicked || 0);
      const quickActionCtr = quickShown > 0 ? quickClicked / quickShown : 0;

      const checkoutStarted = Number(monetization.checkout_started || 0);
      const checkoutCompleted = Number(monetization.checkout_completed || 0);
      const checkoutConversion = checkoutStarted > 0 ? checkoutCompleted / checkoutStarted : 0;

      const openReports = Number(reports.open_reports || 0);
      const guardrails = {
        checkoutConversionOk: checkoutConversion >= Number(config.rolloutGuardrailCheckoutConversionMin || 0.02),
        quickActionCtrOk: quickActionCtr >= Number(config.rolloutGuardrailQuickActionCtrMin || 0.05),
        reportsOk: openReports <= Number(config.rolloutGuardrailOpenReportsMax || 200)
      };
      res.status(200).json({
        stage: config.rolloutStage,
        cohortPercent: Number(config.rolloutCohortPercent || 10),
        metrics: {
          checkoutConversionRate: Number(checkoutConversion.toFixed(4)),
          quickActionCtr: Number(quickActionCtr.toFixed(4)),
          openReports
        },
        thresholds: {
          checkoutConversionMin: Number(config.rolloutGuardrailCheckoutConversionMin || 0.02),
          quickActionCtrMin: Number(config.rolloutGuardrailQuickActionCtrMin || 0.05),
          openReportsMax: Number(config.rolloutGuardrailOpenReportsMax || 200)
        },
        guardrails,
        rollbackRecommended: !Object.values(guardrails).every(Boolean)
      });
    })
  );

  router.get(
    "/dashboard/rollout-runbook",
    authMiddleware,
    modGuard,
    asyncHandler(async (_req, res) => {
      const status = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE event_name = 'checkout_started')::int AS checkout_started,
           COUNT(*) FILTER (WHERE event_name = 'checkout_completed')::int AS checkout_completed,
           COUNT(*) FILTER (WHERE event_name = 'quick_actions_shown')::int AS quick_actions_shown,
           COUNT(*) FILTER (WHERE event_name = 'quick_action_clicked')::int AS quick_action_clicked
         FROM analytics_events
         WHERE created_at >= NOW() - INTERVAL '14 days'`
      );
      const reports = await db.query(
        `SELECT COUNT(*)::int AS open_reports
         FROM reports
         WHERE status IN ('open', 'reviewing')`
      );
      const row = status.rows[0] || {};
      const openReports = Number(reports.rows[0]?.open_reports || 0);
      const checkoutStarted = Number(row.checkout_started || 0);
      const checkoutCompleted = Number(row.checkout_completed || 0);
      const quickShown = Number(row.quick_actions_shown || 0);
      const quickClicked = Number(row.quick_action_clicked || 0);
      const checkoutConversion = checkoutStarted > 0 ? checkoutCompleted / checkoutStarted : 0;
      const quickActionCtr = quickShown > 0 ? quickClicked / quickShown : 0;
      const guardrailBreaches = [
        checkoutConversion < Number(config.rolloutGuardrailCheckoutConversionMin || 0.02)
          ? "checkout_conversion_below_threshold"
          : null,
        quickActionCtr < Number(config.rolloutGuardrailQuickActionCtrMin || 0.05)
          ? "quick_action_ctr_below_threshold"
          : null,
        openReports > Number(config.rolloutGuardrailOpenReportsMax || 200)
          ? "open_reports_above_threshold"
          : null
      ].filter(Boolean);
      const stageProgression = ["read", "create", "chat", "growth", "full"];
      const currentStageIndex = stageProgression.indexOf(config.rolloutStage);
      const recommendedNextStage =
        guardrailBreaches.length === 0 && currentStageIndex >= 0 && currentStageIndex < stageProgression.length - 1
          ? stageProgression[currentStageIndex + 1]
          : config.rolloutStage;

      res.status(200).json({
        stage: config.rolloutStage,
        cohortPercent: Number(config.rolloutCohortPercent || 10),
        guardrailBreaches,
        rollbackRecommended: guardrailBreaches.length > 0,
        recommendedNextStage,
        runbook: guardrailBreaches.length
          ? [
              "Freeze cohort expansion immediately.",
              "Switch ROLLOUT_STAGE back one level and redeploy.",
              "Review last 24h experiment variants and disable underperforming variant IDs.",
              "Inspect moderation queue and open reports before re-enabling rollout."
            ]
          : [
              "No active breach. Continue monitoring for 24h.",
              `If stable, increase cohort beyond ${config.rolloutCohortPercent}% or advance to ${recommendedNextStage}.`
            ]
      });
    })
  );

  return router;
}

module.exports = {
  createAnalyticsRouter
};
