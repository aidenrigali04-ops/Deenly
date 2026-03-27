/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("profiles", {
    is_verified: { type: "boolean", notNull: true, default: false }
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("profiles", "is_verified");
};
