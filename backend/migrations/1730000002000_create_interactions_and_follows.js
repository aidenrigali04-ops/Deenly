/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("interactions", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    post_id: {
      type: "integer",
      notNull: true,
      references: "posts(id)",
      onDelete: "cascade"
    },
    interaction_type: {
      type: "varchar(32)",
      notNull: true,
      check: "interaction_type IN ('benefited', 'reflect_later', 'comment')"
    },
    comment_text: { type: "text" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createConstraint(
    "interactions",
    "comments_require_text_check",
    "CHECK ((interaction_type = 'comment' AND comment_text IS NOT NULL) OR (interaction_type != 'comment'))"
  );

  pgm.createIndex("interactions", "post_id");
  pgm.createIndex("interactions", "user_id");
  pgm.createIndex("interactions", ["post_id", "interaction_type"]);
  pgm.createIndex("interactions", ["user_id", "post_id", "interaction_type"]);

  pgm.createTable("follows", {
    id: "id",
    follower_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    following_id: {
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

  pgm.createConstraint(
    "follows",
    "no_self_follow_check",
    "CHECK (follower_id != following_id)"
  );

  pgm.createIndex("follows", ["follower_id", "following_id"], { unique: true });
  pgm.createIndex("follows", "follower_id");
  pgm.createIndex("follows", "following_id");
};

exports.down = (pgm) => {
  pgm.dropTable("follows");
  pgm.dropTable("interactions");
};
