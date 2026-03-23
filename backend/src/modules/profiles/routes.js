const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString, requireString } = require("../../utils/validators");
const { httpError } = require("../../utils/http-error");

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
        `SELECT p.user_id, p.display_name, p.bio, p.avatar_url, p.created_at, p.updated_at
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
      const displayName = requireString(req.body?.displayName, "displayName", 2, 64);
      const bio = optionalString(req.body?.bio, "bio", 240);
      const avatarUrl = optionalString(req.body?.avatarUrl, "avatarUrl", 2048);

      const result = await db.query(
        `UPDATE profiles
         SET display_name = $1,
             bio = $2,
             avatar_url = $3,
             updated_at = NOW()
         WHERE user_id = $4
         RETURNING user_id, display_name, bio, avatar_url, created_at, updated_at`,
        [displayName, bio, avatarUrl, req.user.id]
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

  return router;
}

module.exports = {
  createProfileRouter
};
