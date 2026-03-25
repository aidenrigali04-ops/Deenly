const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString, requireString } = require("../../utils/validators");
const { httpError } = require("../../utils/http-error");
const { createNotification } = require("../../services/notifications");

const INTERACTION_TYPES = new Set(["benefited", "reflect_later", "comment"]);

function containsBlockedTerm(text, blockedTerms) {
  if (!text || !blockedTerms || blockedTerms.length === 0) {
    return false;
  }
  const content = text.toLowerCase();
  return blockedTerms.some((term) => content.includes(term.toLowerCase()));
}

function createInteractionsRouter({ db, config, analytics, pushNotifications }) {
  const router = express.Router();
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
      if (
        interactionType === "comment" &&
        containsBlockedTerm(commentText, config.commentBlockedTerms)
      ) {
        throw httpError(400, "Comment includes blocked language");
      }

      const existing = await db.query(
        `SELECT id
         FROM interactions
         WHERE user_id = $1
           AND post_id = $2
           AND interaction_type = $3
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
         RETURNING id, user_id, post_id, interaction_type, comment_text, created_at`,
        [req.user.id, postId, interactionType, commentText]
      );
      const postOwnerResult = await db.query(
        "SELECT author_id FROM posts WHERE id = $1 LIMIT 1",
        [postId]
      );
      const postOwnerId = postOwnerResult.rows[0]?.author_id || null;
      if (postOwnerId && postOwnerId !== req.user.id) {
        await createNotification(
          db,
          postOwnerId,
          `post_${interactionType}`,
          {
            actorUserId: req.user.id,
            postId
          },
          { pushNotifications }
        );
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

      return res.status(201).json(result.rows[0]);
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

      const result = await db.query(
        `INSERT INTO post_views (user_id, post_id, watch_time_ms, completion_rate)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, post_id, watch_time_ms, completion_rate, viewed_at`,
        [req.user.id, postId, Math.floor(watchTimeMs), Number(completionRate.toFixed(2))]
      );

      if (analytics) {
        await analytics.trackEvent("view_post", {
          userId: req.user.id,
          postId,
          watchTimeMs: Math.floor(watchTimeMs),
          completionRate: Number(completionRate.toFixed(2))
        });
      }

      res.status(201).json(result.rows[0]);
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
         GROUP BY interaction_type`,
        [postId]
      );

      res.status(200).json({
        postId,
        totals: result.rows
      });
    })
  );

  return router;
}

module.exports = {
  createInteractionsRouter
};
