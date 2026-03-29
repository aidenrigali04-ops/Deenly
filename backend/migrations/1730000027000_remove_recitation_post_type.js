/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`UPDATE posts SET post_type = 'post' WHERE post_type = 'recitation'`);
  pgm.sql(`UPDATE user_interests SET interest_key = 'post' WHERE interest_key = 'recitation'`);
  pgm.sql(`ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_post_type_check`);
  pgm.sql(`
    ALTER TABLE posts
    ADD CONSTRAINT posts_post_type_check
    CHECK (post_type IN ('post', 'marketplace', 'reel'));
  `);
  pgm.sql(`ALTER TABLE user_interests DROP CONSTRAINT IF EXISTS user_interests_interest_key_check`);
  pgm.sql(`
    ALTER TABLE user_interests
    ADD CONSTRAINT user_interests_interest_key_check
    CHECK (interest_key IN ('post', 'marketplace', 'reel'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_post_type_check`);
  pgm.sql(`
    ALTER TABLE posts
    ADD CONSTRAINT posts_post_type_check
    CHECK (post_type IN ('post', 'recitation', 'marketplace', 'reel'));
  `);
  pgm.sql(`ALTER TABLE user_interests DROP CONSTRAINT IF EXISTS user_interests_interest_key_check`);
  pgm.sql(`
    ALTER TABLE user_interests
    ADD CONSTRAINT user_interests_interest_key_check
    CHECK (interest_key IN ('post', 'recitation', 'marketplace', 'reel'));
  `);
};
