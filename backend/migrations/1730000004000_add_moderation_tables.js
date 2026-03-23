/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("reports", {
    id: "id",
    reporter_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    target_type: {
      type: "varchar(16)",
      notNull: true,
      check: "target_type IN ('post', 'user', 'comment')"
    },
    target_id: { type: "varchar(64)", notNull: true },
    reason: { type: "varchar(200)", notNull: true },
    notes: { type: "text" },
    status: {
      type: "varchar(16)",
      notNull: true,
      default: "open",
      check: "status IN ('open', 'reviewing', 'resolved', 'dismissed')"
    },
    reviewed_by: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    reviewed_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createTable("moderation_actions", {
    id: "id",
    report_id: {
      type: "integer",
      notNull: true,
      references: "reports(id)",
      onDelete: "cascade"
    },
    moderator_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    action_type: {
      type: "varchar(32)",
      notNull: true,
      check: "action_type IN ('hide_post', 'remove_post', 'restore_post', 'suspend_user')"
    },
    note: { type: "varchar(500)" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createTable("user_blocks", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    blocked_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createTable("user_mutes", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    muted_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createIndex("reports", ["status", "created_at"]);
  pgm.createIndex("reports", ["target_type", "target_id"]);
  pgm.createIndex("moderation_actions", "report_id");
  pgm.createIndex("user_blocks", ["user_id", "blocked_user_id"], { unique: true });
  pgm.createIndex("user_mutes", ["user_id", "muted_user_id"], { unique: true });
};

exports.down = (pgm) => {
  pgm.dropTable("user_mutes");
  pgm.dropTable("user_blocks");
  pgm.dropTable("moderation_actions");
  pgm.dropTable("reports");
};
