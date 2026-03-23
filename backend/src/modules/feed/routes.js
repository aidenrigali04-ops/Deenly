const express = require("express");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");

function createFeedRouter({ db }) {
  const router = express.Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const postType = req.query.postType || null;

      if (postType && !["recitation", "community", "short_video"].includes(postType)) {
        throw httpError(400, "postType must be recitation, community, or short_video");
      }

      const result = await db.query(
        `SELECT p.id,
                p.author_id,
                p.post_type,
                p.content,
                p.media_url,
                p.style_tag,
                p.created_at,
                pr.display_name AS author_display_name,
                COALESCE(SUM(CASE WHEN i.interaction_type = 'benefited' THEN 1 ELSE 0 END), 0)::int AS benefited_count,
                COALESCE(SUM(CASE WHEN i.interaction_type = 'comment' THEN 1 ELSE 0 END), 0)::int AS comment_count,
                COALESCE(SUM(CASE WHEN i.interaction_type = 'reflect_later' THEN 1 ELSE 0 END), 0)::int AS reflect_later_count
         FROM posts p
         JOIN profiles pr ON pr.user_id = p.author_id
         LEFT JOIN interactions i ON i.post_id = p.id
         WHERE ($1::text IS NULL OR p.post_type = $1::text)
           AND p.visibility_status = 'visible'
           AND p.media_status IN ('ready', 'none')
         GROUP BY p.id, pr.display_name
         ORDER BY (p.created_at
           + ((COALESCE(SUM(CASE WHEN i.interaction_type = 'comment' THEN 1 ELSE 0 END), 0) * interval '2 minutes')
           + (COALESCE(SUM(CASE WHEN i.interaction_type = 'benefited' THEN 1 ELSE 0 END), 0) * interval '1 minute'))) DESC
         LIMIT $2 OFFSET $3`,
        [postType, limit, offset]
      );

      res.status(200).json({
        limit,
        offset,
        items: result.rows
      });
    })
  );

  return router;
}

module.exports = {
  createFeedRouter
};
