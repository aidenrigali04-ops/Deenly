const express = require("express");
const crypto = require("crypto");
const { authenticate, authorize } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { optionalString, requireString } = require("../../utils/validators");

const TABLE_SQL = {
  users:
    "SELECT id, email, username, role, is_active, created_at, updated_at FROM users ORDER BY id DESC LIMIT $1 OFFSET $2",
  profiles:
    "SELECT id, user_id, display_name, bio, avatar_url, created_at, updated_at FROM profiles ORDER BY id DESC LIMIT $1 OFFSET $2",
  posts:
    "SELECT id, author_id, post_type, content, media_url, media_status, visibility_status, created_at FROM posts ORDER BY id DESC LIMIT $1 OFFSET $2",
  interactions:
    "SELECT id, user_id, post_id, interaction_type, comment_text, created_at FROM interactions ORDER BY id DESC LIMIT $1 OFFSET $2",
  follows:
    "SELECT id, follower_id, following_id, created_at FROM follows ORDER BY id DESC LIMIT $1 OFFSET $2",
  post_views:
    "SELECT id, user_id, post_id, watch_time_ms, completion_rate, viewed_at FROM post_views ORDER BY id DESC LIMIT $1 OFFSET $2",
  reports:
    "SELECT id, reporter_user_id, target_type, target_id, reason, category, status, reviewed_by, created_at FROM reports ORDER BY id DESC LIMIT $1 OFFSET $2",
  moderation_actions:
    "SELECT id, report_id, moderator_user_id, action_type, note, created_at FROM moderation_actions ORDER BY id DESC LIMIT $1 OFFSET $2",
  user_blocks:
    "SELECT id, blocker_id, blocked_id, created_at FROM user_blocks ORDER BY id DESC LIMIT $1 OFFSET $2",
  user_mutes:
    "SELECT id, muter_id, muted_id, created_at FROM user_mutes ORDER BY id DESC LIMIT $1 OFFSET $2",
  analytics_events:
    "SELECT id, event_name, payload, created_at FROM analytics_events ORDER BY id DESC LIMIT $1 OFFSET $2",
  refresh_tokens:
    "SELECT id, user_id, expires_at, revoked_at, created_at FROM refresh_tokens ORDER BY id DESC LIMIT $1 OFFSET $2",
  user_interests:
    "SELECT id, user_id, interest_key, created_at FROM user_interests ORDER BY id DESC LIMIT $1 OFFSET $2",
  notifications:
    "SELECT id, user_id, type, payload, is_read, created_at FROM notifications ORDER BY id DESC LIMIT $1 OFFSET $2",
  user_warnings:
    "SELECT id, user_id, moderator_user_id, reason, note, created_at FROM user_warnings ORDER BY id DESC LIMIT $1 OFFSET $2",
  user_restrictions:
    "SELECT id, user_id, moderator_user_id, restriction_type, reason, starts_at, ends_at, is_active, created_at FROM user_restrictions ORDER BY id DESC LIMIT $1 OFFSET $2",
  appeals:
    "SELECT id, user_id, report_id, restriction_id, message, status, reviewed_by, reviewed_at, created_at FROM appeals ORDER BY id DESC LIMIT $1 OFFSET $2",
  waitlist_entries:
    "SELECT id, email, source, note, created_at FROM waitlist_entries ORDER BY id DESC LIMIT $1 OFFSET $2",
  beta_invites:
    "SELECT id, code, email, created_by, redeemed_by, redeemed_at, max_uses, uses_count, is_active, created_at FROM beta_invites ORDER BY id DESC LIMIT $1 OFFSET $2",
  support_tickets:
    "SELECT id, user_id, email, subject, message, status, priority, assigned_to, created_at, updated_at FROM support_tickets ORDER BY id DESC LIMIT $1 OFFSET $2",
  creator_subscription_tiers:
    "SELECT id, creator_user_id, title, monthly_price_minor, currency, status, created_at, updated_at FROM creator_subscription_tiers ORDER BY id DESC LIMIT $1 OFFSET $2",
  creator_subscriptions:
    "SELECT id, tier_id, creator_user_id, subscriber_user_id, status, stripe_subscription_id, current_period_end, created_at FROM creator_subscriptions ORDER BY id DESC LIMIT $1 OFFSET $2",
  affiliate_codes:
    "SELECT id, affiliate_user_id, code, is_active, uses_count, created_at, updated_at FROM affiliate_codes ORDER BY id DESC LIMIT $1 OFFSET $2",
  affiliate_conversions:
    "SELECT id, affiliate_code_id, checkout_session_id, order_id, affiliate_user_id, seller_user_id, buyer_user_id, amount_minor, commission_minor, currency, created_at FROM affiliate_conversions ORDER BY id DESC LIMIT $1 OFFSET $2",
  creator_ranking_snapshots:
    "SELECT id, snapshot_date, creator_user_id, gross_earnings_minor, supporters_count, conversions_count, score, created_at FROM creator_ranking_snapshots ORDER BY snapshot_date DESC, id DESC LIMIT $1 OFFSET $2"
};

function createAdminRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });
  const modGuard = authorize(["moderator", "admin"]);

  router.get(
    "/tables/:table",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const table = String(req.params.table || "");
      const query = TABLE_SQL[table];
      if (!query) {
        throw httpError(404, "Unknown table");
      }
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const result = await db.query(query, [limit, offset]);
      res.status(200).json({ table, limit, offset, items: result.rows });
    })
  );

  router.post(
    "/warnings",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const userId = Number(req.body?.userId);
      if (!userId) {
        throw httpError(400, "userId must be a number");
      }
      const reason = requireString(req.body?.reason, "reason", 3, 300);
      const note = optionalString(req.body?.note, "note", 1000);
      const result = await db.query(
        `INSERT INTO user_warnings (user_id, moderator_user_id, reason, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, moderator_user_id, reason, note, created_at`,
        [userId, req.user.id, reason, note]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.post(
    "/restrictions",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const userId = Number(req.body?.userId);
      if (!userId) {
        throw httpError(400, "userId must be a number");
      }
      const restrictionType = requireString(
        req.body?.restrictionType,
        "restrictionType",
        4,
        32
      );
      const reason = requireString(req.body?.reason, "reason", 3, 300);
      const endsAt = optionalString(req.body?.endsAt, "endsAt", 64);
      const result = await db.query(
        `INSERT INTO user_restrictions (user_id, moderator_user_id, restriction_type, reason, ends_at)
         VALUES ($1, $2, $3, $4, $5::timestamptz)
         RETURNING id, user_id, moderator_user_id, restriction_type, reason, starts_at, ends_at, is_active, created_at`,
        [userId, req.user.id, restrictionType, reason, endsAt || null]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.post(
    "/appeals/:appealId/review",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const appealId = Number(req.params.appealId);
      if (!appealId) {
        throw httpError(400, "appealId must be a number");
      }
      const status = requireString(req.body?.status, "status", 4, 16);
      if (!["reviewing", "approved", "rejected"].includes(status)) {
        throw httpError(400, "status must be reviewing, approved, or rejected");
      }
      const result = await db.query(
        `UPDATE appeals
         SET status = $1,
             reviewed_by = $2,
             reviewed_at = NOW()
         WHERE id = $3
         RETURNING id, status, reviewed_by, reviewed_at`,
        [status, req.user.id, appealId]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "Appeal not found");
      }
      res.status(200).json(result.rows[0]);
    })
  );

  router.post(
    "/invites",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const email = optionalString(req.body?.email, "email", 254);
      const maxUses = Math.min(Math.max(Number(req.body?.maxUses) || 1, 1), 1000);
      const code = crypto.randomBytes(16).toString("hex");
      const result = await db.query(
        `INSERT INTO beta_invites (code, email, created_by, max_uses)
         VALUES ($1, $2, $3, $4)
         RETURNING id, code, email, max_uses, uses_count, is_active, created_at`,
        [code, email, req.user.id, maxUses]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.post(
    "/support/:ticketId",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const ticketId = Number(req.params.ticketId);
      if (!ticketId) {
        throw httpError(400, "ticketId must be a number");
      }
      const status = optionalString(req.body?.status, "status", 16) || "in_progress";
      const priority = optionalString(req.body?.priority, "priority", 16) || "normal";

      const result = await db.query(
        `UPDATE support_tickets
         SET status = $1,
             priority = $2,
             assigned_to = $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING id, status, priority, assigned_to, updated_at`,
        [status, priority, req.user.id, ticketId]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "Support ticket not found");
      }
      res.status(200).json(result.rows[0]);
    })
  );

  router.get(
    "/monetization/summary",
    authMiddleware,
    modGuard,
    asyncHandler(async (_req, res) => {
      const totals = await db.query(
        `SELECT
           COALESCE(SUM(amount_minor), 0)::int AS gross_volume_minor,
           COALESCE(SUM(platform_fee_minor), 0)::int AS total_platform_fees_minor,
           COUNT(*) FILTER (WHERE kind = 'product')::int AS product_orders_count,
           COUNT(*) FILTER (WHERE kind = 'support')::int AS support_orders_count,
           COUNT(*) FILTER (WHERE kind = 'subscription')::int AS subscription_orders_count
         FROM orders
         WHERE status = 'completed'`
      );
      const subscriptions = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'active')::int AS active_count,
           COUNT(*) FILTER (WHERE status = 'canceled')::int AS canceled_count,
           COUNT(*) FILTER (WHERE status = 'past_due')::int AS past_due_count
         FROM creator_subscriptions`
      );
      const affiliates = await db.query(
        `SELECT
           COUNT(*)::int AS conversions_count,
           COALESCE(SUM(commission_minor), 0)::int AS total_commission_minor
         FROM affiliate_conversions`
      );
      res.status(200).json({
        totals: totals.rows[0],
        subscriptions: subscriptions.rows[0],
        affiliates: affiliates.rows[0]
      });
    })
  );

  return router;
}

module.exports = {
  createAdminRouter
};
