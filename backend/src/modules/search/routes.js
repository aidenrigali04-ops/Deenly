const express = require("express");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { parseSearchKeywords } = require("../../utils/search-keywords");

function createSearchRouter({ db }) {
  const router = express.Router();

  router.get(
    "/users",
    asyncHandler(async (req, res) => {
      const query = String(req.query.q || "").trim();
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const { all, terms } = parseSearchKeywords(query);

      let result;
      if (all) {
        result = await db.query(
          `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url,
                  CASE WHEN p.show_business_on_profile THEN p.business_offering ELSE NULL END AS business_offering,
                  p.is_verified
           FROM profiles p
           JOIN users u ON u.id = p.user_id
           ORDER BY p.display_name ASC, p.user_id ASC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
      } else if (terms.length === 0) {
        result = await db.query(
          `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url,
                  CASE WHEN p.show_business_on_profile THEN p.business_offering ELSE NULL END AS business_offering,
                  p.is_verified
           FROM profiles p
           JOIN users u ON u.id = p.user_id
           WHERE false
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
      } else {
        result = await db.query(
          `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url,
                  CASE WHEN p.show_business_on_profile THEN p.business_offering ELSE NULL END AS business_offering,
                  p.is_verified
           FROM profiles p
           JOIN users u ON u.id = p.user_id
           WHERE NOT EXISTS (
             SELECT 1
             FROM unnest($1::text[]) AS kw
             WHERE NOT (
               strpos(lower(COALESCE(p.display_name, '')), kw) > 0
               OR strpos(lower(COALESCE(u.username, '')), kw) > 0
               OR strpos(lower(COALESCE(p.bio, '')), kw) > 0
               OR strpos(lower(COALESCE(p.business_offering, '')), kw) > 0
               OR strpos(lower(COALESCE(p.website_url, '')), kw) > 0
             )
           )
           ORDER BY p.display_name ASC, p.user_id ASC
           LIMIT $2 OFFSET $3`,
          [terms, limit, offset]
        );
      }

      res.status(200).json({ q: query, limit, offset, items: result.rows });
    })
  );

  router.get(
    "/posts",
    asyncHandler(async (req, res) => {
      const query = String(req.query.q || "").trim();
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const postType = req.query.postType ? String(req.query.postType) : null;
      if (postType && !["post", "marketplace", "reel"].includes(postType)) {
        throw httpError(400, "postType must be post, marketplace, or reel");
      }

      const { all, terms } = parseSearchKeywords(query);

      const baseVisibility = `
         p.visibility_status = 'visible'
           AND p.media_status = 'ready'
           AND p.removed_at IS NULL
           AND ($1::text IS NULL OR p.post_type = $1::text)`;

      let result;
      if (all) {
        result = await db.query(
          `SELECT p.id, p.author_id, p.post_type, p.content, p.media_url, p.style_tag, p.tags, p.created_at,
                  p.is_business_post, p.cta_label, p.cta_url,
                  pr.display_name AS author_display_name
           FROM posts p
           JOIN profiles pr ON pr.user_id = p.author_id
           WHERE ${baseVisibility}
           ORDER BY p.created_at DESC, p.id DESC
           LIMIT $2 OFFSET $3`,
          [postType, limit, offset]
        );
      } else if (terms.length === 0) {
        result = await db.query(
          `SELECT p.id, p.author_id, p.post_type, p.content, p.media_url, p.style_tag, p.tags, p.created_at,
                  p.is_business_post, p.cta_label, p.cta_url,
                  pr.display_name AS author_display_name
           FROM posts p
           JOIN profiles pr ON pr.user_id = p.author_id
           WHERE false
           LIMIT $2 OFFSET $3`,
          [postType, limit, offset]
        );
      } else {
        result = await db.query(
          `SELECT p.id, p.author_id, p.post_type, p.content, p.media_url, p.style_tag, p.tags, p.created_at,
                  p.is_business_post, p.cta_label, p.cta_url,
                  pr.display_name AS author_display_name
           FROM posts p
           JOIN profiles pr ON pr.user_id = p.author_id
           WHERE ${baseVisibility}
             AND NOT EXISTS (
               SELECT 1
               FROM unnest($4::text[]) AS kw
               WHERE NOT (
                 strpos(lower(COALESCE(p.content, '')), kw) > 0
                 OR strpos(lower(COALESCE(p.style_tag, '')), kw) > 0
                 OR strpos(lower(COALESCE(pr.display_name, '')), kw) > 0
                 OR strpos(lower(COALESCE(pr.bio, '')), kw) > 0
                 OR strpos(lower(COALESCE(pr.business_offering, '')), kw) > 0
               )
             )
           ORDER BY p.created_at DESC, p.id DESC
           LIMIT $2 OFFSET $3`,
          [postType, limit, offset, terms]
        );
      }

      res.status(200).json({ q: query, postType, limit, offset, items: result.rows });
    })
  );

  return router;
}

module.exports = {
  createSearchRouter
};
