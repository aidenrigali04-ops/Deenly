/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("events", {
    id: "id",
    host_user_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "CASCADE"
    },
    title: { type: "varchar(180)", notNull: true },
    description: { type: "text" },
    starts_at: { type: "timestamptz", notNull: true },
    ends_at: { type: "timestamptz" },
    timezone: { type: "varchar(64)" },
    is_online: { type: "boolean", notNull: true, default: false },
    online_url: { type: "varchar(2000)" },
    address_display: { type: "varchar(500)" },
    latitude: { type: "double precision" },
    longitude: { type: "double precision" },
    visibility: { type: "varchar(16)", notNull: true, default: "public" },
    capacity: { type: "integer" },
    status: { type: "varchar(16)", notNull: true, default: "scheduled" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") }
  });
  pgm.addConstraint(
    "events",
    "events_visibility_check",
    "CHECK (visibility IN ('public', 'private', 'invite'))"
  );
  pgm.addConstraint(
    "events",
    "events_status_check",
    "CHECK (status IN ('scheduled', 'canceled', 'completed'))"
  );
  pgm.addConstraint("events", "events_capacity_positive_check", "CHECK (capacity IS NULL OR capacity > 0)");
  pgm.addConstraint(
    "events",
    "events_geo_pair_check",
    "CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))"
  );
  pgm.addConstraint(
    "events",
    "events_geo_range_check",
    "CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90))"
  );
  pgm.addConstraint(
    "events",
    "events_geo_lng_range_check",
    "CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))"
  );
  pgm.addConstraint(
    "events",
    "events_time_window_check",
    "CHECK (ends_at IS NULL OR ends_at >= starts_at)"
  );
  pgm.createIndex("events", ["host_user_id", "starts_at"], {
    name: "events_host_starts_idx"
  });
  pgm.createIndex("events", ["visibility", "status", "starts_at"], {
    name: "events_visibility_status_starts_idx"
  });

  pgm.createTable("event_rsvps", {
    event_id: {
      type: "integer",
      notNull: true,
      references: "events",
      onDelete: "CASCADE"
    },
    user_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "CASCADE"
    },
    status: { type: "varchar(16)", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") }
  });
  pgm.addConstraint("event_rsvps", "event_rsvps_status_check", "CHECK (status IN ('interested', 'going'))");
  pgm.addConstraint("event_rsvps", "event_rsvps_pk", "PRIMARY KEY (event_id, user_id)");
  pgm.createIndex("event_rsvps", ["user_id", "status"], {
    name: "event_rsvps_user_status_idx"
  });

  pgm.createTable("event_chat_messages", {
    id: "id",
    event_id: {
      type: "integer",
      notNull: true,
      references: "events",
      onDelete: "CASCADE"
    },
    sender_user_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "CASCADE"
    },
    body: { type: "varchar(4000)", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") }
  });
  pgm.createIndex("event_chat_messages", ["event_id", "id"], {
    name: "event_chat_messages_event_id_id_idx"
  });
};

exports.down = (pgm) => {
  pgm.dropTable("event_chat_messages", { ifExists: true, cascade: true });
  pgm.dropTable("event_rsvps", { ifExists: true, cascade: true });
  pgm.dropTable("events", { ifExists: true, cascade: true });
};
