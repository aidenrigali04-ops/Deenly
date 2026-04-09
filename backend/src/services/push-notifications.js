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

    const accessToken = String(process.env.EXPO_ACCESS_TOKEN || "").trim();
    let delivered = 0;

    if (accessToken) {
      let ExpoCtor;
      try {
        ({ Expo: ExpoCtor } = await import("expo-server-sdk"));
      } catch (err) {
        logger?.warn?.({ err }, "expo_server_sdk_import_failed");
        ExpoCtor = null;
      }

      if (ExpoCtor) {
        const expo = new ExpoCtor({ accessToken });
        const bodyText =
          typeof payload?.message === "string"
            ? payload.message
            : typeof payload?.body === "string"
              ? payload.body
              : String(type || "Notification");
        const title = typeof payload?.title === "string" ? payload.title : "Deenly";
        const data =
          payload && typeof payload === "object" && !Array.isArray(payload) ? { type, ...payload } : { type };

        const messages = [];
        for (const row of tokens.rows) {
          if (String(row.platform || "").toLowerCase() === "web") {
            continue;
          }
          const t = String(row.token || "").trim();
          if (!ExpoCtor.isExpoPushToken(t)) {
            continue;
          }
          messages.push({
            to: t,
            sound: "default",
            title,
            body: bodyText,
            data
          });
        }

        if (messages.length > 0) {
          const chunks = expo.chunkPushNotifications(messages);
          for (const chunk of chunks) {
            try {
              const tickets = await expo.sendPushNotificationsAsync(chunk);
              for (const ticket of tickets) {
                if (ticket.status === "ok") {
                  delivered += 1;
                } else {
                  logger?.warn?.({ userId, ticket }, "expo_push_ticket_error");
                }
              }
            } catch (err) {
              logger?.warn?.({ err, userId }, "expo_push_send_failed");
            }
          }
        }
      }
    }

    logger.info(
      {
        userId,
        type,
        tokenCount: tokens.rowCount,
        delivered,
        expoConfigured: Boolean(accessToken),
        payload
      },
      "push_delivery_complete"
    );

    return { delivered, suppressed: false };
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
