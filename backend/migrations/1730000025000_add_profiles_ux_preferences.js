/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("profiles", {
    show_business_on_profile: { type: "boolean", notNull: true, default: false },
    default_feed_tab: { type: "varchar(32)" },
    app_landing: { type: "varchar(16)" },
    onboarding_intents: { type: "text[]", notNull: true, default: "{}" },
    seller_checklist_completed_at: { type: "timestamptz" }
  });
  pgm.addConstraint(
    "profiles",
    "profiles_default_feed_tab_check",
    "CHECK (default_feed_tab IS NULL OR default_feed_tab IN ('for_you','opportunities','marketplace'))"
  );
  pgm.addConstraint(
    "profiles",
    "profiles_app_landing_check",
    "CHECK (app_landing IS NULL OR app_landing IN ('home','marketplace'))"
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint("profiles", "profiles_app_landing_check");
  pgm.dropConstraint("profiles", "profiles_default_feed_tab_check");
  pgm.dropColumns("profiles", [
    "show_business_on_profile",
    "default_feed_tab",
    "app_landing",
    "onboarding_intents",
    "seller_checklist_completed_at"
  ]);
};
