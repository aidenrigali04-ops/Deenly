const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString, requireString } = require("../../utils/validators");
const { httpError } = require("../../utils/http-error");

const POST_TYPES = new Set(["recitation", "community", "short_video"]);

function createPostsRouter({ db, config, analytics, mediaStorage }) {
  const router = express.Router();
  const authMiddleware = authenticate({
    config: config || { jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "" },
    db
  });

  router.post(
    "/",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const restriction = await db.query(
        `SELECT id
         FROM user_restrictions
         WHERE user_id = $1
           AND is_active = true
           AND restriction_type IN ('posting_suspended', 'account_suspended')
           AND (ends_at IS NULL OR ends_at > NOW())
         LIMIT 1`,
        [req.user.id]
      );
      if (restriction.rowCount > 0) {
        throw httpError(403, "Posting is temporarily restricted");
      }

      const postType = requireString(req.body?.postType, "postType", 3, 32);
      if (!POST_TYPES.has(postType)) {
        throw httpError(400, "postType must be recitation, community, or short_video");
      }

      const content = requireString(req.body?.content, "content", 1, 2000);
      const mediaUrl = optionalString(req.body?.mediaUrl, "mediaUrl", 2048);
      const styleTag = optionalString(req.body?.styleTag, "styleTag", 64);

      const result = await db.query(
        `INSERT INTO posts (author_id, post_type, content, media_url, style_tag, media_status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, author_id, post_type, content, media_url, media_mime_type, style_tag, media_status, visibility_status, created_at, updated_at`,
        [req.user.id, postType, content, mediaUrl, styleTag, "ready"]
      );
      if (analytics) {
        await analytics.trackEvent("create_post", {
          userId: req.user.id,
          postId: result.rows[0].id,
          postType
        });
      }

      res.status(201).json(result.rows[0]);
    })
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const postType = req.query.postType || null;
      const authorId = req.query.authorId ? Number(req.query.authorId) : null;

      if (postType && !POST_TYPES.has(postType)) {
        throw httpError(400, "postType must be recitation, community, or short_video");
      }
      if (req.query.authorId && !authorId) {
        throw httpError(400, "authorId must be a number");
      }

      const result = await db.query(
        `SELECT p.id, p.author_id, p.post_type, p.content, p.media_url, p.media_mime_type, p.style_tag, p.media_status,
                p.visibility_status, p.created_at, p.updated_at,
                pr.display_name AS author_display_name,
                COALESCE(vs.view_count, 0)::int AS view_count,
                COALESCE(vs.avg_watch_time_ms, 0)::int AS avg_watch_time_ms,
                COALESCE(vs.avg_completion_rate, 0)::numeric AS avg_completion_rate
         FROM posts p
         JOIN profiles pr ON pr.user_id = p.author_id
         LEFT JOIN (
           SELECT post_id,
                  COUNT(*)::int AS view_count,
                  AVG(watch_time_ms)::int AS avg_watch_time_ms,
                  ROUND(AVG(completion_rate), 2) AS avg_completion_rate
           FROM post_views
           GROUP BY post_id
         ) vs ON vs.post_id = p.id
         WHERE ($1::text IS NULL OR p.post_type = $1::text)
           AND ($2::int IS NULL OR p.author_id = $2::int)
           AND p.visibility_status = 'visible'
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT $3 OFFSET $4`,
        [postType, authorId, limit, offset]
      );

      const items = result.rows.map((row) => ({
        ...row,
        media_url: mediaStorage?.resolveMediaUrl
          ? mediaStorage.resolveMediaUrl({
              mediaKey: row.media_upload_key || row.media_url,
              mediaUrl: row.media_url
            })
          : row.media_url
      }));
      res.status(200).json({ limit, offset, items });
    })
  );

  router.get(
    "/:postId",
    asyncHandler(async (req, res) => {
      const postId = Number(req.params.postId);
      if (!postId) {
        throw httpError(400, "postId must be a number");
      }

      const result = await db.query(
        `SELECT p.id, p.author_id, p.post_type, p.content, p.media_url, p.media_mime_type, p.style_tag, p.media_status, p.visibility_status, p.created_at, p.updated_at,
                pr.display_name AS author_display_name,
                COALESCE(vs.view_count, 0)::int AS view_count,
                COALESCE(vs.avg_watch_time_ms, 0)::int AS avg_watch_time_ms,
                COALESCE(vs.avg_completion_rate, 0)::numeric AS avg_completion_rate
         FROM posts p
         JOIN profiles pr ON pr.user_id = p.author_id
         LEFT JOIN (
           SELECT post_id,
                  COUNT(*)::int AS view_count,
                  AVG(watch_time_ms)::int AS avg_watch_time_ms,
                  ROUND(AVG(completion_rate), 2) AS avg_completion_rate
           FROM post_views
           GROUP BY post_id
         ) vs ON vs.post_id = p.id
         WHERE p.id = $1
           AND p.visibility_status = 'visible'
         LIMIT 1`,
        [postId]
      );

      if (result.rowCount === 0) {
        throw httpError(404, "Post not found");
      }

      const row = result.rows[0];
      res.status(200).json({
        ...row,
        media_url: mediaStorage?.resolveMediaUrl
          ? mediaStorage.resolveMediaUrl({
              mediaKey: row.media_upload_key || row.media_url,
              mediaUrl: row.media_url
            })
          : row.media_url
      });
    })
  );

  return router;
}

module.exports = {
  createPostsRouter
};
