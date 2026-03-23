/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createIndex("posts", ["created_at", "id"], {
    name: "posts_created_at_id_idx"
  });
  pgm.createIndex("follows", ["follower_id", "following_id"], {
    name: "follows_follower_following_idx"
  });
  pgm.createIndex("interactions", ["user_id", "post_id", "interaction_type"], {
    name: "interactions_user_post_type_idx"
  });

  pgm.createTable("post_views", {
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
    watch_time_ms: { type: "integer", notNull: true },
    completion_rate: { type: "numeric(5,2)", notNull: true },
    viewed_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createConstraint(
    "post_views",
    "post_views_completion_rate_check",
    "CHECK (completion_rate >= 0 AND completion_rate <= 100)"
  );
  pgm.createConstraint(
    "post_views",
    "post_views_watch_time_non_negative_check",
    "CHECK (watch_time_ms >= 0)"
  );

  pgm.createIndex("post_views", "post_id");
  pgm.createIndex("post_views", "user_id");
  pgm.createIndex("post_views", ["post_id", "viewed_at"]);
};

exports.down = (pgm) => {
  pgm.dropTable("post_views");
  pgm.dropIndex("interactions", ["user_id", "post_id", "interaction_type"], {
    name: "interactions_user_post_type_idx"
  });
  pgm.dropIndex("follows", ["follower_id", "following_id"], {
    name: "follows_follower_following_idx"
  });
  pgm.dropIndex("posts", ["created_at", "id"], {
    name: "posts_created_at_id_idx"
  });
};
