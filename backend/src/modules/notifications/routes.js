const express = require("express");
const { authenticate, authenticateOptional } = require("../../middleware/auth");
const { asyncHandler } = require("../../utils/async-handler");
const { httpError } = require("../../utils/http-error");
const {
  acknowledgePrayerReminder,
  getPrayerSettings,
  updatePrayerSettings
} = require("../../services/prayer-settings");
const { evaluatePrayerStatus } = require("../../services/prayer-times");

function createNotificationsRouter({ db, config, pushNotifications }) {
  const router = express.Router();
  const authMiddleware = authenticate({ config, db });
  const optionalAuthMiddleware = authenticateOptional({ config, db });

  router.get(
    "/",
    optionalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      if (!req.user) {
        res.status(200).json({ limit, offset, items: [] });
        return;
      }

      const result = await db.query(
        `SELECT n.id,
                n.type,
                n.payload,
                n.is_read,
                n.created_at,
                ap.display_name AS actor_display_name
         FROM notifications n
         LEFT JOIN profiles ap
           ON ap.user_id = (NULLIF(n.payload->>'actorUserId', ''))::int
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC
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

  router.get(
    "/prayer-settings",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const settings = await getPrayerSettings(db, req.user.id);
      res.status(200).json(settings);
    })
  );

  router.put(
    "/prayer-settings",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const settings = await updatePrayerSettings(db, req.user.id, req.body || {});
      res.status(200).json(settings);
    })
  );

  router.get(
    "/prayer-status",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const settings = await getPrayerSettings(db, req.user.id);
      const status = evaluatePrayerStatus(settings, new Date());
      res.status(200).json({
        ...status,
        reminderText: status.shouldRemind ? "Time for Salah" : null
      });
    })
  );

  router.post(
    "/prayer-status/ack",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const reminderKey = String(req.body?.reminderKey || "").trim();
      if (!reminderKey) {
        throw httpError(400, "reminderKey is required");
      }
      await acknowledgePrayerReminder(db, req.user.id, reminderKey);
      res.status(200).json({ ok: true, reminderKey });
    })
  );

  router.post(
    "/push/devices",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const platform = String(req.body?.platform || "").trim().toLowerCase();
      const token = String(req.body?.token || "").trim();
      if (!platform || !token) {
        throw httpError(400, "platform and token are required");
      }
      if (!pushNotifications?.registerDeviceToken) {
        throw httpError(503, "Push notifications are not configured");
      }
      const device = await pushNotifications.registerDeviceToken({
        userId: req.user.id,
        platform,
        token
      });
      if (!device) {
        throw httpError(400, "Invalid push device payload");
      }
      res.status(201).json(device);
    })
  );

  router.delete(
    "/push/devices",
    authMiddleware,
    asyncHandler(async (req, res) => {
      const token = String(req.body?.token || "").trim();
      if (!token) {
        throw httpError(400, "token is required");
      }
      if (!pushNotifications?.unregisterDeviceToken) {
        throw httpError(503, "Push notifications are not configured");
      }
      await pushNotifications.unregisterDeviceToken({ userId: req.user.id, token });
      res.status(200).json({ ok: true });
    })
  );

  router.post(
    "/push/test",
    authMiddleware,
    asyncHandler(async (req, res) => {
      if (!pushNotifications?.sendUserPush) {
        throw httpError(503, "Push notifications are not configured");
      }
      const result = await pushNotifications.sendUserPush({
        userId: req.user.id,
        type: "test_push",
        payload: { message: "Time for Salah" }
      });
      res.status(200).json(result);
    })
  );

  return router;
}

module.exports = {
  createNotificationsRouter
};
