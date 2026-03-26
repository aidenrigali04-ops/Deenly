/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("posts", {
    audience_target: {
      type: "varchar(16)",
      notNull: true,
      default: "both"
    },
    business_category: {
      type: "varchar(64)"
    }
  });
  pgm.addConstraint(
    "posts",
    "posts_audience_target_check",
    "CHECK (audience_target IN ('b2b','b2c','both'))"
  );
  pgm.createIndex("posts", ["audience_target", "created_at"]);
  pgm.createIndex("posts", ["business_category", "created_at"]);
};

exports.down = (pgm) => {
  pgm.dropConstraint("posts", "posts_audience_target_check");
  pgm.dropColumns("posts", ["audience_target", "business_category"]);
};
