const { getPrayerSettings } = require("./prayer-settings");
const { evaluatePrayerStatus } = require("./prayer-times");

function createPushNotifications({ db, logger }) {
  async function registerDeviceToken({ userId, platform, token }) {
    const normalizedPlatform = String(platform || "").toLowerCase();
    const normalizedToken = String(token || "").trim();
    if (!["ios", "android", "web"].includes(normalizedPlatform) || !normalizedToken) {
      return null;
    }

    const result = await db.query(
      `INSERT INTO notification_device_tokens (user_id, platform, token, is_active, updated_at)
       VALUES ($1, $2, $3, true, NOW())
       ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           platform = EXCLUDED.platform,
           is_active = true,
           updated_at = NOW()
       RETURNING id, platform, token, is_active, updated_at`,
      [userId, normalizedPlatform, normalizedToken]
    );
    return result.rows[0];
  }

  async function unregisterDeviceToken({ userId, token }) {
    await db.query(
      `UPDATE notification_device_tokens
       SET is_active = false, updated_at = NOW()
       WHERE user_id = $1
         AND token = $2`,
      [userId, token]
    );
  }

  async function sendUserPush({ userId, type, payload }) {
    const tokens = await db.query(
      `SELECT id, platform, token
       FROM notification_device_tokens
       WHERE user_id = $1
         AND is_active = true`,
      [userId]
    );
    if (tokens.rowCount === 0) {
      return { delivered: 0, suppressed: false, reason: "no_tokens" };
    }

    const settings = await getPrayerSettings(db, userId);
    const status = evaluatePrayerStatus(settings, new Date());
    if (status.isQuietWindow) {
      return { delivered: 0, suppressed: true, reason: "quiet_window" };
    }

    // Provider-agnostic stub: delivery can be swapped with FCM/APNs/WebPush.
    logger.info(
      { userId, type, tokenCount: tokens.rowCount, payload },
      "push_delivery_enqueued"
    );
    return { delivered: tokens.rowCount, suppressed: false };
  }

  return {
    registerDeviceToken,
    unregisterDeviceToken,
    sendUserPush
  };
}

module.exports = {
  createPushNotifications
};
