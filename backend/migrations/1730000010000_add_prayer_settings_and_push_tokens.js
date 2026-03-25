/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("user_prayer_settings", {
    user_id: {
      type: "integer",
      notNull: true,
      primaryKey: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    latitude: { type: "numeric(8,5)", notNull: true, default: 21.4225 },
    longitude: { type: "numeric(8,5)", notNull: true, default: 39.8262 },
    timezone: { type: "varchar(64)", notNull: true, default: "UTC" },
    calculation_method: {
      type: "varchar(32)",
      notNull: true,
      default: "muslim_world_league"
    },
    quiet_mode: {
      type: "varchar(16)",
      notNull: true,
      default: "prayer_windows",
      check: "quiet_mode IN ('off', 'prayer_windows', 'always')"
    },
    quiet_minutes_before: { type: "integer", notNull: true, default: 10 },
    quiet_minutes_after: { type: "integer", notNull: true, default: 20 },
    last_reminded_prayer_key: { type: "varchar(64)" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createTable("notification_device_tokens", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    platform: {
      type: "varchar(16)",
      notNull: true,
      check: "platform IN ('ios', 'android', 'web')"
    },
    token: { type: "varchar(512)", notNull: true, unique: true },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("notification_device_tokens", ["user_id", "platform", "is_active"]);
};

exports.down = (pgm) => {
  pgm.dropTable("notification_device_tokens");
  pgm.dropTable("user_prayer_settings");
};
