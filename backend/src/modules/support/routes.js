const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { optionalString, requireString } = require("../../utils/validators");

function createSupportRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });

  router.post(
    "/tickets",
    asyncHandler(async (req, res) => {
      const subject = requireString(req.body?.subject, "subject", 3, 180);
      const message = requireString(req.body?.message, "message", 10, 5000);
      const email = optionalString(req.body?.email, "email", 254);
      const userId = req.body?.userId ? Number(req.body.userId) : null;
      const result = await db.query(
        `INSERT INTO support_tickets (user_id, email, subject, message, status, priority)
         VALUES ($1, $2, $3, $4, 'open', 'normal')
         RETURNING id, user_id, email, subject, message, status, priority, created_at`,
        [userId, email, subject, message]
      );
      res.status(201).json(result.rows[0]);
    })
  );

  router.get(
    "/my-tickets",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT id, subject, message, status, priority, created_at, updated_at
         FROM support_tickets
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [req.user.id]
      );
      res.status(200).json({ items: result.rows });
    })
  );

  return router;
}

module.exports = {
  createSupportRouter
};
