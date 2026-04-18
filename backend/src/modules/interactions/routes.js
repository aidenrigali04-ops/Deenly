const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString, requireString } = require("../../utils/validators");
const { httpError } = require("../../utils/http-error");
const { createNotification } = require("../../services/notifications");
const { throwIfUserFacingPolicyViolation } = require("../../utils/content-safety");
const { createRankingSignalHooks } = require("../feed/feed-rank-signals");

const INTERACTION_TYPES = new Set(["benefited", "reflect_later", "comment"]);
const NON_COMMENT_TYPES = new Set(["benefited", "reflect_later"]);

function decodeCommentsCursor(cursor) {
  if (!cursor) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!decoded || !decoded.createdAt || !Number.isInteger(decoded.id)) {
      throw new Error("invalid");
    }
    return decoded;
  } catch {
    throw httpError(400, "Invalid comments cursor");
  }
}

function encodeCommentsCursor(row) {
  return Buffer.from(
    JSON.stringify({
      createdAt: row.created_at,
      id: row.id
    })
  ).toString("base64url");
}

function createInteractionsRouter({
  db,
  config,
  analytics,
  pushNotifications,
  logger = null,
  rewardsQualifiedCommentEarnHook = null
}) {
  const router = express.Router();
  const rankingSignalHooks = createRankingSignalHooks({ db, analytics, config });
  const authMiddleware = authenticate({
    config: config || { jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "" },
    db
  });

  router.post(
    "/",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postId = Number(req.body?.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }

      const interactionType = requireString(
        req.body?.interactionType,
        "interactionType",
        3,
        32
      );
      if (!INTERACTION_TYPES.has(interactionType)) {
        throw httpError(400, "Unsupported interactionType");
      }

      const commentText =
        interactionType === "comment"
          ? requireString(req.body?.commentText, "commentText", 1, 2000)
          : optionalString(req.body?.commentText, "commentText", 2000);
      if (interactionType === "comment") {
        const restriction = await db.query(
          `SELECT id
           FROM user_restrictions
           WHERE user_id = $1
             AND is_active = true
             AND restriction_type IN ('comment_suspended', 'account_suspended')
             AND (ends_at IS NULL OR ends_at > NOW())
           LIMIT 1`,
          [req.user.id]
        );
        if (restriction.rowCount > 0) {
          throw httpError(403, "Commenting is temporarily restricted");
        }
      }
      if (interactionType === "comment") {
        throwIfUserFacingPolicyViolation(commentText, config, {
          termMessage: "Comment includes blocked language",
          urlMessage: "Comment links to a blocked website"
        });
      }

      const existing = await db.query(
        `SELECT id
         FROM interactions
         WHERE user_id = $1
           AND post_id = $2
           AND interaction_type = $3
           AND deleted_at IS NULL
           AND interaction_type != 'comment'
         LIMIT 1`,
        [req.user.id, postId, interactionType]
      );

      if (existing.rowCount > 0) {
        return res.status(200).json({
          id: existing.rows[0].id,
          duplicate: true
        });
      }

      const result = await db.query(
        `INSERT INTO interactions (user_id, post_id, interaction_type, comment_text)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, post_id, interaction_type, comment_text, created_at, deleted_at`,
        [req.user.id, postId, interactionType, commentText]
      );
      const postOwnerResult = await db.query(
        "SELECT author_id FROM posts WHERE id = $1 LIMIT 1",
        [postId]
      );
      const postOwnerId = postOwnerResult.rows[0]?.author_id || null;
      if (postOwnerId && postOwnerId !== req.user.id) {
        const payload = {
          actorUserId: req.user.id,
          postId
        };
        if (interactionType === "comment" && commentText) {
          const preview =
            commentText.length > 180 ? `${commentText.slice(0, 177).trimEnd()}…` : commentText;
          payload.commentPreview = preview;
        }
        await createNotification(db, postOwnerId, `post_${interactionType}`, payload, {
          pushNotifications
        });
      }
      if (analytics) {
        await analytics.trackEvent(
          interactionType === "benefited" ? "like_post" : "engage_post",
          {
          userId: req.user.id,
          postId,
          interactionType
          }
        );
      }

      try {
        await rankingSignalHooks.onSocialEngagementRankingSignalsUpdated({
          postId,
          userId: req.user.id,
          interactionType
        });
      } catch {
        /* best-effort ranking signal hook */
      }

      if (interactionType === "comment" && rewardsQualifiedCommentEarnHook) {
        try {
          await rewardsQualifiedCommentEarnHook.maybeCreditAfterCommentInsert({
            userId: req.user.id,
            postId,
            interactionId: Number(result.rows[0].id),
            commentText,
            postAuthorId: postOwnerId
          });
        } catch (earnErr) {
          const log = logger && typeof logger.warn === "function" ? logger : { warn() {} };
          log.warn({ err: earnErr, postId, userId: req.user.id }, "rewards_comment_earn_hook_failed");
        }
      }

      return res.status(201).json(result.rows[0]);
    })
  );

  router.post(
    "/cta-click",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postId = Number(req.body?.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }
      const postResult = await db.query(
        `SELECT id, author_id, cta_url
         FROM posts
         WHERE id = $1
           AND visibility_status = 'visible'
           AND removed_at IS NULL
         LIMIT 1`,
        [postId]
      );
      if (postResult.rowCount === 0) {
        throw httpError(404, "Post not found");
      }
      const post = postResult.rows[0];
      if (!post.cta_url) {
        throw httpError(400, "Post has no CTA");
      }
      if (analytics) {
        await analytics.trackEvent("creator_cta_click", {
          userId: req.user.id,
          postId,
          authorId: post.author_id
        });
      }
      res.status(201).json({ ok: true, postId });
    })
  );

  router.post(
    "/view",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postId = Number(req.body?.postId);
      const watchTimeMs = Number(req.body?.watchTimeMs);
      const completionRate = Number(req.body?.completionRate);

      if (!postId) {
        throw httpError(400, "postId must be a number");
      }
      if (!Number.isFinite(watchTimeMs) || watchTimeMs < 0) {
        throw httpError(400, "watchTimeMs must be a non-negative number");
      }
      if (
        !Number.isFinite(completionRate) ||
        completionRate < 0 ||
        completionRate > 100
      ) {
        throw httpError(400, "completionRate must be a number between 0 and 100");
      }

      const exists = await db.query("SELECT id FROM posts WHERE id = $1 LIMIT 1", [postId]);
      if (exists.rowCount === 0) {
        throw httpError(404, "Post not found");
      }

      const normalizedWatchTime = Math.floor(watchTimeMs);
      const normalizedCompletionRate = Number(completionRate.toFixed(2));
      const dedupeWindowSeconds = Number(config.viewDedupeWindowSeconds || 45);
      const existingInWindow = await db.query(
        `SELECT id, watch_time_ms, completion_rate
         FROM post_views
         WHERE user_id = $1
           AND post_id = $2
           AND viewed_at >= NOW() - ($3::int * interval '1 second')
         ORDER BY viewed_at DESC
         LIMIT 1`,
        [req.user.id, postId, dedupeWindowSeconds]
      );

      let result;
      let deduped = false;
      if (existingInWindow.rowCount > 0) {
        deduped = true;
        const existing = existingInWindow.rows[0];
        result = await db.query(
          `UPDATE post_views
           SET watch_time_ms = GREATEST(watch_time_ms, $2),
               completion_rate = GREATEST(completion_rate, $3),
               viewed_at = NOW()
           WHERE id = $1
           RETURNING id, user_id, post_id, watch_time_ms, completion_rate, viewed_at`,
          [existing.id, normalizedWatchTime, normalizedCompletionRate]
        );
      } else {
        result = await db.query(
          `INSERT INTO post_views (user_id, post_id, watch_time_ms, completion_rate)
           VALUES ($1, $2, $3, $4)
           RETURNING id, user_id, post_id, watch_time_ms, completion_rate, viewed_at`,
          [req.user.id, postId, normalizedWatchTime, normalizedCompletionRate]
        );
      }

      if (analytics) {
        await analytics.trackEvent("view_post", {
          userId: req.user.id,
          postId,
          watchTimeMs: normalizedWatchTime,
          completionRate: normalizedCompletionRate,
          deduped
        });
      }

      try {
        await rankingSignalHooks.onPostViewSignalsWritten({
          userId: req.user.id,
          postId,
          deduped
        });
      } catch {
        /* ranking hooks are best-effort */
      }

      res.status(deduped ? 200 : 201).json({
        ...result.rows[0],
        deduped
      });
    })
  );

  router.delete(
    "/",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postId = Number(req.body?.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }
      const interactionType = requireString(req.body?.interactionType, "interactionType", 3, 32);
      if (!NON_COMMENT_TYPES.has(interactionType)) {
        throw httpError(400, "interactionType must be benefited or reflect_later");
      }

      const result = await db.query(
        `DELETE FROM interactions
         WHERE user_id = $1
           AND post_id = $2
           AND interaction_type = $3
         RETURNING id`,
        [req.user.id, postId, interactionType]
      );
      if (analytics && result.rowCount > 0) {
        await analytics.trackEvent("remove_interaction", {
          userId: req.user.id,
          postId,
          interactionType
        });
      }
      res.status(200).json({
        deleted: result.rowCount > 0
      });
    })
  );

  router.get(
    "/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const type = req.query.type ? String(req.query.type) : null;
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      if (type && !INTERACTION_TYPES.has(type)) {
        throw httpError(400, "Unsupported interaction type");
      }

      const result = await db.query(
        `SELECT i.id, i.post_id, i.interaction_type, i.comment_text, i.created_at,
                p.content, p.post_type, p.media_url
         FROM interactions i
         JOIN posts p ON p.id = i.post_id
         WHERE i.user_id = $1
           AND ($2::text IS NULL OR i.interaction_type = $2::text)
           AND i.deleted_at IS NULL
         ORDER BY i.created_at DESC
         LIMIT $3 OFFSET $4`,
        [req.user.id, type, limit, offset]
      );

      res.status(200).json({
        limit,
        offset,
        items: result.rows
      });
    })
  );

  router.get(
    "/post/:postId",
    asyncHandler(async (req, res) => {
      const postId = Number(req.params.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }

      const result = await db.query(
        `SELECT interaction_type, COUNT(*)::int AS total
         FROM interactions
         WHERE post_id = $1
           AND deleted_at IS NULL
         GROUP BY interaction_type`,
        [postId]
      );

      res.status(200).json({
        postId,
        totals: result.rows
      });
    })
  );

  router.get(
    "/post/:postId/comments",
    asyncHandler(async (req, res) => {
      const postId = Number(req.params.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const cursor = decodeCommentsCursor(req.query.cursor);
      const exists = await db.query("SELECT id FROM posts WHERE id = $1 LIMIT 1", [postId]);
      if (exists.rowCount === 0) {
        throw httpError(404, "Post not found");
      }

      const result = await db.query(
        `SELECT i.id, i.user_id, i.post_id, i.comment_text, i.created_at,
                p.display_name AS commenter_display_name,
                u.username AS commenter_username,
                p.avatar_url AS commenter_avatar_url
         FROM interactions i
         JOIN users u ON u.id = i.user_id
         JOIN profiles p ON p.user_id = i.user_id
         WHERE i.post_id = $1
           AND i.interaction_type = 'comment'
           AND i.deleted_at IS NULL
           AND (
             $2::timestamptz IS NULL
             OR i.created_at < $2::timestamptz
             OR (i.created_at = $2::timestamptz AND i.id < $3::int)
           )
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT $4`,
        [postId, cursor?.createdAt || null, cursor?.id || null, limit + 1]
      );

      const hasMore = result.rows.length > limit;
      const items = hasMore ? result.rows.slice(0, limit) : result.rows;
      const nextCursor = hasMore ? encodeCommentsCursor(items[items.length - 1]) : null;

      res.status(200).json({
        postId,
        items,
        hasMore,
        nextCursor,
        limit
      });
    })
  );

  router.delete(
    "/comments/:interactionId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const interactionId = Number(req.params.interactionId);
      if (!interactionId) {
        throw httpError(400, "interactionId must be a number");
      }

      const interactionResult = await db.query(
        `SELECT id, user_id, post_id
         FROM interactions
         WHERE id = $1
           AND interaction_type = 'comment'
           AND deleted_at IS NULL
         LIMIT 1`,
        [interactionId]
      );
      if (interactionResult.rowCount === 0) {
        throw httpError(404, "Comment not found");
      }
      const interaction = interactionResult.rows[0];
      const isOwner = interaction.user_id === req.user.id;
      const isModerator = ["moderator", "admin"].includes(req.user.role);
      if (!isOwner && !isModerator) {
        throw httpError(403, "You can only delete your own comments");
      }

      await db.query(
        `UPDATE interactions
         SET deleted_at = NOW()
         WHERE id = $1`,
        [interactionId]
      );
      if (analytics) {
        await analytics.trackEvent("delete_comment", {
          userId: req.user.id,
          commentId: interactionId,
          postId: interaction.post_id
        });
      }
      res.status(200).json({
        deleted: true
      });
    })
  );

  return router;
}

module.exports = {
  createInteractionsRouter
};
