/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("creator_products", {
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
    "creator_products",
    "creator_products_audience_target_check",
    "CHECK (audience_target IN ('b2b','b2c','both'))"
  );
  pgm.createIndex("creator_products", ["creator_user_id", "audience_target"]);
  pgm.createIndex("creator_products", ["business_category"]);
};

exports.down = (pgm) => {
  pgm.dropConstraint("creator_products", "creator_products_audience_target_check");
  pgm.dropIndex("creator_products", ["creator_user_id", "audience_target"]);
  pgm.dropIndex("creator_products", ["business_category"]);
  pgm.dropColumns("creator_products", ["audience_target", "business_category"]);
};
