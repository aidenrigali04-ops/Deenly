/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("posts", {
    id: "id",
    author_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    post_type: {
      type: "varchar(32)",
      notNull: true,
      check: "post_type IN ('recitation', 'community', 'short_video')"
    },
    content: { type: "text", notNull: true },
    media_url: { type: "text" },
    style_tag: { type: "varchar(64)" },
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

  pgm.createIndex("posts", "author_id");
  pgm.createIndex("posts", "post_type");
  pgm.createIndex("posts", "created_at");
  pgm.createIndex("posts", ["post_type", "created_at"]);
};

exports.down = (pgm) => {
  pgm.dropTable("posts");
};
