/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    UPDATE profiles
    SET default_feed_tab = 'for_you'
    WHERE default_feed_tab = 'opportunities';
  `);
  pgm.dropConstraint("profiles", "profiles_default_feed_tab_check");
  pgm.addConstraint(
    "profiles",
    "profiles_default_feed_tab_check",
    "CHECK (default_feed_tab IS NULL OR default_feed_tab IN ('for_you','marketplace'))"
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint("profiles", "profiles_default_feed_tab_check");
  pgm.addConstraint(
    "profiles",
    "profiles_default_feed_tab_check",
    "CHECK (default_feed_tab IS NULL OR default_feed_tab IN ('for_you','opportunities','marketplace'))"
  );
};
