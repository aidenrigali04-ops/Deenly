/* eslint-disable camelcase */

exports.shorthands = undefined;

const DEFAULT_BPS = 350;

exports.up = (pgm) => {
  pgm.addColumns("creator_products", {
    platform_fee_bps: {
      type: "integer",
      notNull: true,
      default: DEFAULT_BPS
    },
    boost_tier: {
      type: "varchar(32)"
    }
  });
  pgm.sql(`
    ALTER TABLE creator_products
    ADD CONSTRAINT creator_products_platform_fee_bps_check
    CHECK (platform_fee_bps >= 0 AND platform_fee_bps <= 3500);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE creator_products DROP CONSTRAINT IF EXISTS creator_products_platform_fee_bps_check`);
  pgm.dropColumns("creator_products", ["platform_fee_bps", "boost_tier"]);
};
