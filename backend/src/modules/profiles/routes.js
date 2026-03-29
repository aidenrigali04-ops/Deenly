const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { resolveProfilePutFields } = require("../../utils/profile-put");

function createProfileRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({
    config: config || { jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "" },
    db
  });

  router.get(
    "/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT p.user_id, p.display_name, p.bio, p.avatar_url, p.business_offering, p.website_url, p.created_at, p.updated_at
         FROM profiles p
         WHERE p.user_id = $1
         LIMIT 1`,
        [req.user.id]
      );

      if (result.rowCount === 0) {
        throw httpError(404, "Profile not found");
      }

      res.status(200).json(result.rows[0]);
    })
  );

  router.put(
    "/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const existing = await db.query(
        `SELECT display_name, bio, avatar_url, business_offering, website_url
         FROM profiles WHERE user_id = $1 LIMIT 1`,
        [req.user.id]
      );
      if (existing.rowCount === 0) {
        throw httpError(404, "Profile not found");
      }
      const { displayName, bio, avatarUrl, businessOffering, websiteUrl } = resolveProfilePutFields(
        req.body,
        existing.rows[0]
      );

      const result = await db.query(
        `UPDATE profiles
         SET display_name = $1,
             bio = $2,
             avatar_url = $3,
             business_offering = $4,
             website_url = $5,
             updated_at = NOW()
         WHERE user_id = $6
         RETURNING user_id, display_name, bio, avatar_url, business_offering, website_url, created_at, updated_at`,
        [displayName, bio, avatarUrl, businessOffering, websiteUrl, req.user.id]
      );

      if (result.rowCount === 0) {
        throw httpError(404, "Profile not found");
      }

      res.status(200).json(result.rows[0]);
    })
  );

  router.get(
    "/:userId",
    asyncHandler(async (req, res) => {
      const userId = Number(req.params.userId);
      if (!userId) {
        throw httpError(400, "userId must be a number");
      }

      const result = await db.query(
        `SELECT p.user_id, p.display_name, p.bio, p.avatar_url, p.created_at, p.updated_at
         FROM profiles p
         WHERE p.user_id = $1
         LIMIT 1`,
        [userId]
      );

      if (result.rowCount === 0) {
        throw httpError(404, "Profile not found");
      }

      res.status(200).json(result.rows[0]);
    })
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const search = (req.query.search || "").toString().trim();

      const result = await db.query(
        `SELECT p.user_id, p.display_name, p.bio, p.avatar_url, p.business_offering, p.website_url, p.created_at, p.updated_at
         FROM profiles p
         WHERE ($1::text = '' OR p.display_name ILIKE ('%' || $1 || '%'))
         ORDER BY p.display_name ASC
         LIMIT $2 OFFSET $3`,
        [search, limit, offset]
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
  createProfileRouter
};
