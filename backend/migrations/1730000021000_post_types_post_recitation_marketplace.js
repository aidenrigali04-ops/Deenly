/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_post_type_check`);
  pgm.sql(`
    UPDATE posts
    SET post_type = 'post'
    WHERE post_type IN ('community', 'short_video');
  `);
  pgm.sql(`
    UPDATE posts p
    SET post_type = 'marketplace'
    WHERE p.is_business_post = true
       OR EXISTS (SELECT 1 FROM post_product_links ppl WHERE ppl.post_id = p.id);
  `);
  pgm.sql(`
    ALTER TABLE posts
    ADD CONSTRAINT posts_post_type_check
    CHECK (post_type IN ('post', 'recitation', 'marketplace'));
  `);

  pgm.sql(`ALTER TABLE user_interests DROP CONSTRAINT IF EXISTS user_interests_interest_key_check`);
  pgm.sql(`
    UPDATE user_interests
    SET interest_key = 'post'
    WHERE interest_key IN ('community', 'short_video');
  `);
  pgm.sql(`
    DELETE FROM user_interests a
    USING user_interests b
    WHERE a.user_id = b.user_id
      AND a.interest_key = b.interest_key
      AND a.id > b.id;
  `);
  pgm.sql(`
    ALTER TABLE user_interests
    ADD CONSTRAINT user_interests_interest_key_check
    CHECK (interest_key IN ('post', 'recitation', 'marketplace'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE user_interests DROP CONSTRAINT IF EXISTS user_interests_interest_key_check`);
  pgm.sql(`
    UPDATE user_interests
    SET interest_key = 'community'
    WHERE interest_key = 'post';
  `);
  pgm.sql(`
    ALTER TABLE user_interests
    ADD CONSTRAINT user_interests_interest_key_check
    CHECK (interest_key IN ('recitation', 'community', 'short_video'));
  `);

  pgm.sql(`ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_post_type_check`);
  pgm.sql(`
    UPDATE posts
    SET post_type = 'community'
    WHERE post_type = 'post';
  `);
  pgm.sql(`
    UPDATE posts
    SET post_type = 'community'
    WHERE post_type = 'marketplace';
  `);
  pgm.sql(`
    ALTER TABLE posts
    ADD CONSTRAINT posts_post_type_check
    CHECK (post_type IN ('recitation', 'community', 'short_video'));
  `);
};
