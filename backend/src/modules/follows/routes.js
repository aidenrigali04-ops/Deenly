const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const { createNotification } = require("../../services/notifications");

function createFollowsRouter({ db, config, analytics, pushNotifications }) {
  const router = express.Router();
  const authMiddleware = authenticate({
    config: config || { jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "" },
    db
  });

  async function getFollowSnapshot({ actorId, targetId }) {
    const result = await db.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM follows
           WHERE follower_id = $1
             AND following_id = $2
         ) AS is_following,
         (SELECT COUNT(*)::int FROM follows WHERE following_id = $2) AS target_followers_count,
         (SELECT COUNT(*)::int FROM follows WHERE follower_id = $2) AS target_following_count,
         (SELECT COUNT(*)::int FROM follows WHERE following_id = $1) AS actor_followers_count,
         (SELECT COUNT(*)::int FROM follows WHERE follower_id = $1) AS actor_following_count`,
      [actorId, targetId]
    );
    return result.rows[0];
  }

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

      const insertResult = await db.query(
        `INSERT INTO follows (follower_id, following_id)
         VALUES ($1, $2)
         ON CONFLICT (follower_id, following_id) DO NOTHING`,
        [req.user.id, followingId]
      );
      const created = insertResult.rowCount > 0;
      if (analytics && created) {
        await analytics.trackEvent("follow_user", {
          followerId: req.user.id,
          followingId
        });
      }
      if (created) {
        await createNotification(
          db,
          followingId,
          "new_follower",
          {
            actorUserId: req.user.id
          },
          { pushNotifications }
        );
      }

      const snapshot = await getFollowSnapshot({ actorId: req.user.id, targetId: followingId });

      res.status(201).json({
        status: "ok",
        created,
        deleted: false,
        followerId: req.user.id,
        followingId,
        isFollowing: snapshot.is_following,
        targetCounts: {
          followers: snapshot.target_followers_count,
          following: snapshot.target_following_count
        },
        actorCounts: {
          followers: snapshot.actor_followers_count,
          following: snapshot.actor_following_count
        }
      });
    })
  );

  router.get(
    "/:userId/status",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const userId = Number(req.params.userId);
      if (!userId) {
        throw httpError(400, "userId must be a number");
      }
      const result = await db.query(
        `SELECT 1
         FROM follows
         WHERE follower_id = $1
           AND following_id = $2
         LIMIT 1`,
        [req.user.id, userId]
      );
      res.status(200).json({
        userId,
        isFollowing: result.rowCount > 0
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

      const deleteResult = await db.query(
        `DELETE FROM follows
         WHERE follower_id = $1
           AND following_id = $2`,
        [req.user.id, followingId]
      );
      const deleted = deleteResult.rowCount > 0;
      const snapshot = await getFollowSnapshot({ actorId: req.user.id, targetId: followingId });

      res.status(200).json({
        status: "ok",
        created: false,
        deleted,
        followerId: req.user.id,
        followingId,
        isFollowing: snapshot.is_following,
        targetCounts: {
          followers: snapshot.target_followers_count,
          following: snapshot.target_following_count
        },
        actorCounts: {
          followers: snapshot.actor_followers_count,
          following: snapshot.actor_following_count
        }
      });
    })
  );

  return router;
}

module.exports = {
  createFollowsRouter
};
