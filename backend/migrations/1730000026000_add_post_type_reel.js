/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
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

exports.down = (pgm) => {
  pgm.sql(`DELETE FROM user_interests WHERE interest_key = 'reel'`);
  pgm.sql(`DELETE FROM posts WHERE post_type = 'reel'`);
  pgm.sql(`ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_post_type_check`);
  pgm.sql(`
    ALTER TABLE posts
    ADD CONSTRAINT posts_post_type_check
    CHECK (post_type IN ('post', 'recitation', 'marketplace'));
  `);
  pgm.sql(`ALTER TABLE user_interests DROP CONSTRAINT IF EXISTS user_interests_interest_key_check`);
  pgm.sql(`
    ALTER TABLE user_interests
    ADD CONSTRAINT user_interests_interest_key_check
    CHECK (interest_key IN ('post', 'recitation', 'marketplace'));
  `);
};
