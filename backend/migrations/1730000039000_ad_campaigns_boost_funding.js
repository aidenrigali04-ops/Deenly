/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("ad_campaigns", {
    boost_funded_at: {
      type: "timestamptz"
    }
  });
  pgm.sql(`
    UPDATE ad_campaigns
    SET boost_funded_at = created_at
    WHERE boost_funded_at IS NULL
  `);
};

exports.down = (pgm) => {
  pgm.dropColumn("ad_campaigns", "boost_funded_at");
};
