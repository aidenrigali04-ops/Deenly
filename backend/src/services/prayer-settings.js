const { DEFAULT_SETTINGS, normalizePrayerSettings } = require("./prayer-times");

async function getPrayerSettings(db, userId) {
  const existing = await db.query(
    `SELECT user_id, latitude, longitude, timezone, calculation_method, quiet_mode,
            quiet_minutes_before, quiet_minutes_after, last_reminded_prayer_key, created_at, updated_at
     FROM user_prayer_settings
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  if (existing.rowCount > 0) {
    return normalizePrayerSettings(existing.rows[0]);
  }

  const inserted = await db.query(
    `INSERT INTO user_prayer_settings (
        user_id, latitude, longitude, timezone, calculation_method, quiet_mode, quiet_minutes_before, quiet_minutes_after
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING user_id, latitude, longitude, timezone, calculation_method, quiet_mode,
                quiet_minutes_before, quiet_minutes_after, last_reminded_prayer_key, created_at, updated_at`,
    [
      userId,
      DEFAULT_SETTINGS.latitude,
      DEFAULT_SETTINGS.longitude,
      DEFAULT_SETTINGS.timezone,
      DEFAULT_SETTINGS.calculation_method,
      DEFAULT_SETTINGS.quiet_mode,
      DEFAULT_SETTINGS.quiet_minutes_before,
      DEFAULT_SETTINGS.quiet_minutes_after
    ]
  );
  return normalizePrayerSettings(inserted.rows[0]);
}

async function updatePrayerSettings(db, userId, input) {
  const next = normalizePrayerSettings(input);
  const result = await db.query(
    `INSERT INTO user_prayer_settings (
        user_id, latitude, longitude, timezone, calculation_method, quiet_mode, quiet_minutes_before, quiet_minutes_after, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          timezone = EXCLUDED.timezone,
          calculation_method = EXCLUDED.calculation_method,
          quiet_mode = EXCLUDED.quiet_mode,
          quiet_minutes_before = EXCLUDED.quiet_minutes_before,
          quiet_minutes_after = EXCLUDED.quiet_minutes_after,
          updated_at = NOW()
      RETURNING user_id, latitude, longitude, timezone, calculation_method, quiet_mode,
                quiet_minutes_before, quiet_minutes_after, last_reminded_prayer_key, created_at, updated_at`,
    [
      userId,
      next.latitude,
      next.longitude,
      next.timezone,
      next.calculation_method,
      next.quiet_mode,
      next.quiet_minutes_before,
      next.quiet_minutes_after
    ]
  );
  return normalizePrayerSettings(result.rows[0]);
}

async function acknowledgePrayerReminder(db, userId, reminderKey) {
  await db.query(
    `UPDATE user_prayer_settings
     SET last_reminded_prayer_key = $2, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, reminderKey]
  );
}

module.exports = {
  getPrayerSettings,
  updatePrayerSettings,
  acknowledgePrayerReminder
};
