/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.dropConstraint("profiles", "profiles_profile_kind_check", { ifExists: true });
  pgm.addConstraint(
    "profiles",
    "profiles_profile_kind_check",
    "CHECK (profile_kind IN ('consumer', 'professional', 'business_interest'))"
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint("profiles", "profiles_profile_kind_check", { ifExists: true });
  pgm.addConstraint(
    "profiles",
    "profiles_profile_kind_check",
    "CHECK (profile_kind IN ('consumer', 'business_interest'))"
  );
};
