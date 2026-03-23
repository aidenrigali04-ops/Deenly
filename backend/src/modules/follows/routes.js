const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");

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

      res.status(201).json({
        status: "ok",
        followerId: req.user.id,
        followingId
      });
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
