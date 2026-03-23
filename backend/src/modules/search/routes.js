const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");

function createSearchRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  router.get(
    "/users",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const query = String(req.query.q || "").trim();
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const result = await db.query(
        `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url
         FROM profiles p
         JOIN users u ON u.id = p.user_id
         WHERE ($1::text = '' OR p.display_name ILIKE ('%' || $1 || '%') OR u.username ILIKE ('%' || $1 || '%'))
         ORDER BY p.display_name ASC, p.user_id ASC
         LIMIT $2 OFFSET $3`,
        [query, limit, offset]
      );

      res.status(200).json({ q: query, limit, offset, items: result.rows });
    })
  );

  router.get(
    "/posts",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const query = String(req.query.q || "").trim();
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const postType = req.query.postType ? String(req.query.postType) : null;
      if (postType && !["recitation", "community", "short_video"].includes(postType)) {
        throw httpError(400, "postType must be recitation, community, or short_video");
      }

      const result = await db.query(
        `SELECT p.id, p.author_id, p.post_type, p.content, p.media_url, p.style_tag, p.created_at,
                pr.display_name AS author_display_name
         FROM posts p
         JOIN profiles pr ON pr.user_id = p.author_id
         WHERE ($1::text = '' OR p.content ILIKE ('%' || $1 || '%'))
           AND ($2::text IS NULL OR p.post_type = $2::text)
           AND p.visibility_status = 'visible'
           AND p.media_status = 'ready'
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT $3 OFFSET $4`,
        [query, postType, limit, offset]
      );

      res.status(200).json({ q: query, postType, limit, offset, items: result.rows });
    })
  );

  return router;
}

module.exports = {
  createSearchRouter
};
