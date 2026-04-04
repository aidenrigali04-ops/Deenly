/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("profiles", {
    professional_setup_completed_at: { type: "timestamptz" },
    business_tools_unlocked_at: { type: "timestamptz" }
  });

  pgm.sql(
    `UPDATE profiles
     SET professional_setup_completed_at = COALESCE(professional_setup_completed_at, business_onboarding_dismissed_at)
     WHERE profile_kind = 'professional'`
  );

  pgm.sql(
    `UPDATE profiles
     SET business_tools_unlocked_at = COALESCE(
       business_tools_unlocked_at,
       seller_checklist_completed_at,
       business_onboarding_dismissed_at
     )
     WHERE profile_kind = 'business_interest'`
  );
};

exports.down = (pgm) => {
  pgm.dropColumns("profiles", ["professional_setup_completed_at", "business_tools_unlocked_at"]);
};
