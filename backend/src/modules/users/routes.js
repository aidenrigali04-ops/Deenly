const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString, requireString } = require("../../utils/validators");
const { httpError } = require("../../utils/http-error");
const INTEREST_KEYS = new Set(["recitation", "community", "short_video"]);

function createUsersRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  router.get(
    "/me",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url, p.created_at, p.updated_at
         FROM profiles p
         JOIN users u ON u.id = p.user_id
         WHERE p.user_id = $1
         LIMIT 1`,
        [req.user.id]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "User profile not found");
      }
      res.status(200).json(result.rows[0]);
    })
  );

  router.get(
    "/me/interests",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT interest_key, created_at
         FROM user_interests
         WHERE user_id = $1
         ORDER BY created_at ASC`,
        [req.user.id]
      );

      res.status(200).json({
        items: result.rows.map((row) => row.interest_key)
      });
    })
  );

  router.put(
    "/me/interests",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const interests = Array.isArray(req.body?.interests) ? req.body.interests : [];
      const normalized = interests
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .filter((entry) => INTEREST_KEYS.has(entry));

      await db.query("DELETE FROM user_interests WHERE user_id = $1", [req.user.id]);
      for (const interestKey of [...new Set(normalized)]) {
        await db.query(
          `INSERT INTO user_interests (user_id, interest_key)
           VALUES ($1, $2)`,
          [req.user.id, interestKey]
        );
      }

      res.status(200).json({
        items: [...new Set(normalized)]
      });
    })
  );

  router.get(
    "/me/sessions",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT id, user_id, expires_at, revoked_at, created_at
         FROM refresh_tokens
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.user.id]
      );
      res.status(200).json({ items: result.rows });
    })
  );

  router.post(
    "/me/sessions/:sessionId/revoke",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const sessionId = Number(req.params.sessionId);
      if (!sessionId) {
        throw httpError(400, "sessionId must be a number");
      }
      const result = await db.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE id = $1
           AND user_id = $2
         RETURNING id, revoked_at`,
        [sessionId, req.user.id]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "Session not found");
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
        `UPDATE profiles p
         SET display_name = $1, bio = $2, avatar_url = $3, updated_at = NOW()
         FROM users u
         WHERE p.user_id = $4
           AND u.id = p.user_id
         RETURNING p.user_id, u.username, p.display_name, p.bio, p.avatar_url, p.created_at, p.updated_at`,
        [displayName, bio, avatarUrl, req.user.id]
      );

      if (result.rowCount === 0) {
        throw httpError(404, "User profile not found");
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
        `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url, p.created_at, p.updated_at
         FROM profiles p
         JOIN users u ON u.id = p.user_id
         WHERE p.user_id = $1
         LIMIT 1`,
        [userId]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "User not found");
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
        `SELECT p.user_id, u.username, p.display_name, p.bio, p.avatar_url, p.created_at, p.updated_at
         FROM profiles p
         JOIN users u ON u.id = p.user_id
         WHERE ($1::text = '' OR p.display_name ILIKE ('%' || $1 || '%') OR u.username ILIKE ('%' || $1 || '%'))
         ORDER BY p.display_name ASC, p.user_id ASC
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
  createUsersRouter
};
