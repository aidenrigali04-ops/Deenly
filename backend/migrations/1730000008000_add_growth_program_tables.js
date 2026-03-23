/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("user_interests", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    interest_key: {
      type: "varchar(32)",
      notNull: true,
      check: "interest_key IN ('recitation', 'community', 'short_video')"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("user_interests", ["user_id", "interest_key"], {
    unique: true
  });

  pgm.createTable("notifications", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    type: { type: "varchar(64)", notNull: true },
    payload: { type: "jsonb", notNull: true, default: "{}" },
    is_read: { type: "boolean", notNull: true, default: false },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("notifications", ["user_id", "created_at"]);

  pgm.addColumns("reports", {
    category: {
      type: "varchar(32)",
      notNull: true,
      default: "other",
      check: "category IN ('haram_content', 'misinformation', 'harassment', 'spam', 'other')"
    },
    evidence_url: { type: "text" }
  });

  pgm.createTable("user_warnings", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    moderator_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    reason: { type: "varchar(300)", notNull: true },
    note: { type: "text" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("user_warnings", ["user_id", "created_at"]);

  pgm.createTable("user_restrictions", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    moderator_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    restriction_type: {
      type: "varchar(32)",
      notNull: true,
      check: "restriction_type IN ('posting_suspended', 'comment_suspended', 'account_suspended')"
    },
    reason: { type: "varchar(300)", notNull: true },
    starts_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    ends_at: { type: "timestamptz" },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("user_restrictions", ["user_id", "is_active"]);

  pgm.createTable("appeals", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    report_id: {
      type: "integer",
      references: "reports(id)",
      onDelete: "set null"
    },
    restriction_id: {
      type: "integer",
      references: "user_restrictions(id)",
      onDelete: "set null"
    },
    message: { type: "text", notNull: true },
    status: {
      type: "varchar(16)",
      notNull: true,
      default: "open",
      check: "status IN ('open', 'reviewing', 'approved', 'rejected')"
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
  pgm.createIndex("appeals", ["status", "created_at"]);

  pgm.createTable("waitlist_entries", {
    id: "id",
    email: { type: "varchar(254)", notNull: true, unique: true },
    source: { type: "varchar(64)", notNull: true, default: "web" },
    note: { type: "varchar(300)" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createTable("beta_invites", {
    id: "id",
    code: { type: "varchar(64)", notNull: true, unique: true },
    email: { type: "varchar(254)" },
    created_by: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    redeemed_by: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    redeemed_at: { type: "timestamptz" },
    max_uses: { type: "integer", notNull: true, default: 1 },
    uses_count: { type: "integer", notNull: true, default: 0 },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createTable("support_tickets", {
    id: "id",
    user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    email: { type: "varchar(254)" },
    subject: { type: "varchar(180)", notNull: true },
    message: { type: "text", notNull: true },
    status: {
      type: "varchar(16)",
      notNull: true,
      default: "open",
      check: "status IN ('open', 'in_progress', 'resolved', 'closed')"
    },
    priority: {
      type: "varchar(16)",
      notNull: true,
      default: "normal",
      check: "priority IN ('low', 'normal', 'high', 'urgent')"
    },
    assigned_to: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
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
  pgm.createIndex("support_tickets", ["status", "created_at"]);
};

exports.down = (pgm) => {
  pgm.dropTable("support_tickets");
  pgm.dropTable("beta_invites");
  pgm.dropTable("waitlist_entries");
  pgm.dropTable("appeals");
  pgm.dropTable("user_restrictions");
  pgm.dropTable("user_warnings");
  pgm.dropColumns("reports", ["category", "evidence_url"]);
  pgm.dropTable("notifications");
  pgm.dropTable("user_interests");
};
