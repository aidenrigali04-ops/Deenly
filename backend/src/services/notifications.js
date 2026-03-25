const { getPrayerSettings } = require("./prayer-settings");
const { evaluatePrayerStatus } = require("./prayer-times");

async function createNotification(db, userId, type, payload = {}, options = {}) {
  if (!userId) {
    return { created: false, suppressed: true, reason: "missing_user" };
  }

  try {
    const prayerSettings = await getPrayerSettings(db, userId);
    const prayerStatus = evaluatePrayerStatus(prayerSettings, new Date());
    if (prayerStatus.isQuietWindow) {
      return { created: false, suppressed: true, reason: "quiet_window" };
    }

    await db.query(
      `INSERT INTO notifications (user_id, type, payload)
       VALUES ($1, $2, $3::jsonb)`,
      [userId, type, JSON.stringify(payload)]
    );

    if (options.pushNotifications?.sendUserPush) {
      await options.pushNotifications.sendUserPush({ userId, type, payload });
    }
    return { created: true, suppressed: false };
  } catch {
    // Notification delivery is best-effort and should not break request flow.
    return { created: false, suppressed: true, reason: "best_effort_failure" };
  }
}

module.exports = {
  createNotification
};
