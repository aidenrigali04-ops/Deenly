const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");

function createSafetyRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  router.post(
    "/block/:userId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const blockedUserId = Number(req.params.userId);
      if (!blockedUserId) {
        throw httpError(400, "userId must be a number");
      }
      if (blockedUserId === req.user.id) {
        throw httpError(400, "You cannot block yourself");
      }

      await db.query(
        `INSERT INTO user_blocks (user_id, blocked_user_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, blocked_user_id) DO NOTHING`,
        [req.user.id, blockedUserId]
      );

      res.status(201).json({ status: "ok", userId: req.user.id, blockedUserId });
    })
  );

  router.delete(
    "/block/:userId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const blockedUserId = Number(req.params.userId);
      if (!blockedUserId) {
        throw httpError(400, "userId must be a number");
      }

      await db.query(
        `DELETE FROM user_blocks WHERE user_id = $1 AND blocked_user_id = $2`,
        [req.user.id, blockedUserId]
      );

      res.status(200).json({ status: "ok", userId: req.user.id, blockedUserId });
    })
  );

  router.post(
    "/mute/:userId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const mutedUserId = Number(req.params.userId);
      if (!mutedUserId) {
        throw httpError(400, "userId must be a number");
      }
      if (mutedUserId === req.user.id) {
        throw httpError(400, "You cannot mute yourself");
      }

      await db.query(
        `INSERT INTO user_mutes (user_id, muted_user_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, muted_user_id) DO NOTHING`,
        [req.user.id, mutedUserId]
      );

      res.status(201).json({ status: "ok", userId: req.user.id, mutedUserId });
    })
  );

  router.delete(
    "/mute/:userId",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const mutedUserId = Number(req.params.userId);
      if (!mutedUserId) {
        throw httpError(400, "userId must be a number");
      }

      await db.query(
        `DELETE FROM user_mutes WHERE user_id = $1 AND muted_user_id = $2`,
        [req.user.id, mutedUserId]
      );

      res.status(200).json({ status: "ok", userId: req.user.id, mutedUserId });
    })
  );

  return router;
}

module.exports = {
  createSafetyRouter
};
