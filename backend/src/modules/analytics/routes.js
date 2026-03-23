const express = require("express");
const { authenticate, authorize } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");

function createAnalyticsRouter({ db, config }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });
  const modGuard = authorize(["moderator", "admin"]);

  router.get(
    "/events/summary",
    authMiddleware,
    modGuard,
    asyncHandler(async (req, res) => {
      const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
      const result = await db.query(
        `SELECT event_name, COUNT(*)::int AS total
         FROM analytics_events
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY event_name
         ORDER BY total DESC`,
        [days]
      );

      res.status(200).json({
        days,
        totals: result.rows
      });
    })
  );

  return router;
}

module.exports = {
  createAnalyticsRouter
};
