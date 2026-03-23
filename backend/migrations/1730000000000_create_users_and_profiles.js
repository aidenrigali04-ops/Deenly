/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("users", {
    id: "id",
    email: { type: "varchar(254)", notNull: true, unique: true },
    password_hash: { type: "text", notNull: true },
    role: {
      type: "varchar(24)",
      notNull: true,
      default: "user",
      check: "role IN ('user', 'moderator', 'admin')"
    },
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

  pgm.createTable("profiles", {
    user_id: {
      type: "integer",
      primaryKey: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    display_name: { type: "varchar(64)", notNull: true },
    bio: { type: "varchar(240)" },
    avatar_url: { type: "text" },
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

  pgm.createTable("refresh_tokens", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    token_hash: { type: "text", notNull: true },
    expires_at: { type: "timestamptz", notNull: true },
    revoked_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createIndex("users", "created_at");
  pgm.createIndex("profiles", "display_name");
  pgm.createIndex("refresh_tokens", ["user_id", "created_at"]);
};

exports.down = (pgm) => {
  pgm.dropTable("refresh_tokens");
  pgm.dropTable("profiles");
  pgm.dropTable("users");
};
