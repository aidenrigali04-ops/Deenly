/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("event_chat_mutes", {
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
    muted_by_user_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "CASCADE"
    },
    reason: { type: "varchar(300)" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") }
  });
  pgm.addConstraint("event_chat_mutes", "event_chat_mutes_pk", "PRIMARY KEY (event_id, user_id)");
  pgm.createIndex("event_chat_mutes", ["user_id"], { name: "event_chat_mutes_user_idx" });

  pgm.createTable("event_chat_moderation_actions", {
    id: "id",
    event_id: {
      type: "integer",
      notNull: true,
      references: "events",
      onDelete: "CASCADE"
    },
    actor_user_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "CASCADE"
    },
    target_user_id: {
      type: "integer",
      references: "users",
      onDelete: "SET NULL"
    },
    action_type: { type: "varchar(32)", notNull: true },
    reason: { type: "varchar(300)" },
    note: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") }
  });
  pgm.addConstraint(
    "event_chat_moderation_actions",
    "event_chat_moderation_actions_type_check",
    "CHECK (action_type IN ('remove_attendee', 'mute', 'unmute', 'report'))"
  );
  pgm.createIndex("event_chat_moderation_actions", ["event_id", "created_at"], {
    name: "event_chat_moderation_actions_event_created_idx"
  });
};

exports.down = (pgm) => {
  pgm.dropTable("event_chat_moderation_actions", { ifExists: true, cascade: true });
  pgm.dropTable("event_chat_mutes", { ifExists: true, cascade: true });
};
