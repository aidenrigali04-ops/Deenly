/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("profiles", {
    profile_kind: { type: "varchar(24)", notNull: true, default: "consumer" },
    business_onboarding_step: { type: "smallint", notNull: true, default: 0 },
    business_onboarding_dismissed_at: { type: "timestamptz" }
  });
  pgm.addConstraint(
    "profiles",
    "profiles_profile_kind_check",
    "CHECK (profile_kind IN ('consumer', 'business_interest'))"
  );
  pgm.sql(
    `UPDATE profiles SET business_onboarding_dismissed_at = NOW() WHERE business_onboarding_dismissed_at IS NULL`
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint("profiles", "profiles_profile_kind_check");
  pgm.dropColumns("profiles", [
    "profile_kind",
    "business_onboarding_step",
    "business_onboarding_dismissed_at"
  ]);
};
