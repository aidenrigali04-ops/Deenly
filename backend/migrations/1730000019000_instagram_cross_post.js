/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("user_instagram_connections", {
    id: { type: "serial", primaryKey: true },
    user_id: {
      type: "integer",
      notNull: true,
      unique: true,
      references: "users",
      onDelete: "CASCADE"
    },
    ig_user_id: { type: "varchar(64)", notNull: true },
    page_id: { type: "varchar(64)", notNull: true },
    ig_username: { type: "varchar(128)" },
    page_access_token_enc: { type: "text", notNull: true },
    token_expires_at: { type: "timestamptz" },
    connected_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });
  pgm.createIndex("user_instagram_connections", "ig_user_id");

  pgm.createTable("instagram_cross_posts", {
    id: { type: "serial", primaryKey: true },
    post_id: {
      type: "integer",
      notNull: true,
      unique: true,
      references: "posts",
      onDelete: "CASCADE"
    },
    user_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "CASCADE"
    },
    status: { type: "varchar(24)", notNull: true },
    ig_container_id: { type: "varchar(64)" },
    ig_media_id: { type: "varchar(64)" },
    error_message: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });
  pgm.createIndex("instagram_cross_posts", ["user_id", "status"]);
};

exports.down = (pgm) => {
  pgm.dropTable("instagram_cross_posts");
  pgm.dropTable("user_instagram_connections");
};
