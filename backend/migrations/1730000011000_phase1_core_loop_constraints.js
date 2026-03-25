/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("interactions", {
    deleted_at: {
      type: "timestamptz",
      notNull: false
    }
  });

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS interactions_unique_non_comment_active_idx
    ON interactions (user_id, post_id, interaction_type)
    WHERE interaction_type IN ('benefited', 'reflect_later')
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS interactions_comments_pagination_idx
    ON interactions (post_id, created_at DESC, id DESC)
    WHERE interaction_type = 'comment' AND deleted_at IS NULL
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS post_views_user_post_viewed_at_idx
    ON post_views (user_id, post_id, viewed_at DESC)
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP INDEX IF EXISTS post_views_user_post_viewed_at_idx");
  pgm.sql("DROP INDEX IF EXISTS interactions_comments_pagination_idx");
  pgm.sql("DROP INDEX IF EXISTS interactions_unique_non_comment_active_idx");
  pgm.dropColumn("interactions", "deleted_at");
};
