const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");

function createNotificationsRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  router.get(
    "/",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const result = await db.query(
        `SELECT id, type, payload, is_read, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );

      res.status(200).json({ limit, offset, items: result.rows });
    })
  );

  router.post(
    "/:notificationId/read",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const notificationId = Number(req.params.notificationId);
      if (!notificationId) {
        throw httpError(400, "notificationId must be a number");
      }

      const result = await db.query(
        `UPDATE notifications
         SET is_read = true
         WHERE id = $1 AND user_id = $2
         RETURNING id, is_read`,
        [notificationId, req.user.id]
      );
      if (result.rowCount === 0) {
        throw httpError(404, "Notification not found");
      }
      res.status(200).json(result.rows[0]);
    })
  );

  return router;
}

module.exports = {
  createNotificationsRouter
};
