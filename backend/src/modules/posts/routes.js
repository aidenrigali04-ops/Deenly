const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString, requireString } = require("../../utils/validators");
const { httpError } = require("../../utils/http-error");

const POST_TYPES = new Set(["recitation", "community", "short_video"]);

function createPostsRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({
    config: config || { jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "" },
    db
  });

  router.post(
    "/",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const postType = requireString(req.body?.postType, "postType", 3, 32);
      if (!POST_TYPES.has(postType)) {
        throw httpError(400, "postType must be recitation, community, or short_video");
      }

      const content = requireString(req.body?.content, "content", 1, 2000);
      const mediaUrl = optionalString(req.body?.mediaUrl, "mediaUrl", 2048);
      const styleTag = optionalString(req.body?.styleTag, "styleTag", 64);

      const result = await db.query(
        `INSERT INTO posts (author_id, post_type, content, media_url, style_tag)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, author_id, post_type, content, media_url, style_tag, created_at, updated_at`,
        [req.user.id, postType, content, mediaUrl, styleTag]
      );

      res.status(201).json(result.rows[0]);
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
        `SELECT p.id, p.author_id, p.post_type, p.content, p.media_url, p.style_tag, p.created_at, p.updated_at,
                pr.display_name AS author_display_name
         FROM posts p
         JOIN profiles pr ON pr.user_id = p.author_id
         WHERE p.id = $1
         LIMIT 1`,
        [postId]
      );

      if (result.rowCount === 0) {
        throw httpError(404, "Post not found");
      }

      res.status(200).json(result.rows[0]);
    })
  );

  return router;
}

module.exports = {
  createPostsRouter
};
