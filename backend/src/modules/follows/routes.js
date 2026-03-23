const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { createNotification } = require("../../services/notifications");

function createFollowsRouter({ db, config, analytics }) {
  const router = express.Router();
  const authMiddleware = authenticate({
    config: config || { jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "" },
    db
  });

  router.post(
    "/:userId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const followingId = Number(req.params.userId);
      if (!followingId) {
        throw httpError(400, "userId must be a number");
      }
      if (followingId === req.user.id) {
        throw httpError(400, "You cannot follow yourself");
      }

      await db.query(
        `INSERT INTO follows (follower_id, following_id)
         VALUES ($1, $2)
         ON CONFLICT (follower_id, following_id) DO NOTHING`,
        [req.user.id, followingId]
      );
      if (analytics) {
        await analytics.trackEvent("follow_user", {
          followerId: req.user.id,
          followingId
        });
      }
      await createNotification(db, followingId, "new_follower", {
        actorUserId: req.user.id
      });

      res.status(201).json({
        status: "ok",
        followerId: req.user.id,
        followingId
      });
    })
  );

  router.get(
    "/:userId/followers",
    asyncHandler(async (req, res) => {
      const userId = Number(req.params.userId);
      if (!userId) {
        throw httpError(400, "userId must be a number");
      }
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const result = await db.query(
        `SELECT f.follower_id AS user_id, p.display_name, u.username, f.created_at
         FROM follows f
         JOIN profiles p ON p.user_id = f.follower_id
         JOIN users u ON u.id = f.follower_id
         WHERE f.following_id = $1
         ORDER BY f.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      res.status(200).json({ limit, offset, items: result.rows });
    })
  );

  router.get(
    "/:userId/following",
    asyncHandler(async (req, res) => {
      const userId = Number(req.params.userId);
      if (!userId) {
        throw httpError(400, "userId must be a number");
      }
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const result = await db.query(
        `SELECT f.following_id AS user_id, p.display_name, u.username, f.created_at
         FROM follows f
         JOIN profiles p ON p.user_id = f.following_id
         JOIN users u ON u.id = f.following_id
         WHERE f.follower_id = $1
         ORDER BY f.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      res.status(200).json({ limit, offset, items: result.rows });
    })
  );

  router.delete(
    "/:userId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const followingId = Number(req.params.userId);
      if (!followingId) {
        throw httpError(400, "userId must be a number");
      }

      await db.query(
        `DELETE FROM follows
         WHERE follower_id = $1
           AND following_id = $2`,
        [req.user.id, followingId]
      );

      res.status(200).json({
        status: "ok",
        followerId: req.user.id,
        followingId
      });
    })
  );

  return router;
}

module.exports = {
  createFollowsRouter
};
