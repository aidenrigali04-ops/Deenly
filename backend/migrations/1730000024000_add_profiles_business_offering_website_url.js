/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("profiles", {
    business_offering: { type: "text", notNull: false },
    website_url: { type: "text", notNull: false }
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("profiles", ["business_offering", "website_url"]);
};
