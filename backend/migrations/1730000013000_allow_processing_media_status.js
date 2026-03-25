/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE posts
    DROP CONSTRAINT IF EXISTS posts_media_status_check;
  `);
  pgm.sql(`
    ALTER TABLE posts
    ADD CONSTRAINT posts_media_status_check
    CHECK (media_status IN ('none', 'pending', 'processing', 'ready', 'failed'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE posts
    DROP CONSTRAINT IF EXISTS posts_media_status_check;
  `);
  pgm.sql(`
    ALTER TABLE posts
    ADD CONSTRAINT posts_media_status_check
    CHECK (media_status IN ('none', 'pending', 'ready', 'failed'));
  `);
};
