/* eslint-disable camelcase */

/**
 * Migration 4 of 4 — Service Table Reconciliation
 *
 * The service layer references table and column names that diverge from
 * the original migrations. Rather than rewriting the tested services,
 * this migration creates the exact tables the services expect:
 *
 *  - seller_boosts        (service: reward-boosts.js)
 *  - boost_spend_events   (service: reward-boosts.js recordSpend)
 *  - trust_profiles       (service: reward-trust.js)
 *
 * It also adjusts admin_actions.admin_id (service) vs admin_user_id (migration).
 *
 * The original migration-3 tables (boost_purchases, boost_impressions,
 * seller_trust_profiles) remain intact for now. Once data is migrated
 * (if any exists), they can be dropped in a future migration.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ─── seller_boosts ───────────────────────────────────────────────────
  // Matches: reward-boosts.js service exactly
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS seller_boosts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      listing_id varchar(64),
      store_id varchar(64),
      type varchar(20) NOT NULL DEFAULT 'standard',
      status varchar(20) NOT NULL DEFAULT 'draft',
      budget_minor integer NOT NULL,
      spent_minor integer NOT NULL DEFAULT 0,
      multiplier numeric(4,2) NOT NULL DEFAULT 1.50,
      duration_hours integer NOT NULL,
      starts_at timestamptz,
      ends_at timestamptz,
      paused_at timestamptz,
      completed_at timestamptz,
      cancelled_at timestamptz,
      cancel_reason varchar(255),
      payment_reference varchar(255),
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT seller_boosts_type_check CHECK (
        type IN ('standard','premium','featured')
      ),
      CONSTRAINT seller_boosts_status_check CHECK (
        status IN ('draft','active','paused','completed','cancelled')
      ),
      CONSTRAINT seller_boosts_multiplier_range CHECK (
        multiplier >= 1.00 AND multiplier <= 5.00
      ),
      CONSTRAINT seller_boosts_budget_positive CHECK (budget_minor > 0),
      CONSTRAINT seller_boosts_spent_non_negative CHECK (spent_minor >= 0),
      CONSTRAINT seller_boosts_spent_within_budget CHECK (spent_minor <= budget_minor),
      CONSTRAINT seller_boosts_duration_range CHECK (duration_hours >= 1 AND duration_hours <= 720)
    );
  `);
  pgm.createIndex("seller_boosts", ["seller_id", "status"]);
  pgm.createIndex("seller_boosts", ["listing_id"], { where: "listing_id IS NOT NULL" });
  pgm.createIndex("seller_boosts", ["store_id"], { where: "store_id IS NOT NULL" });
  pgm.createIndex("seller_boosts", ["status", "ends_at"]);

  // ─── boost_spend_events ──────────────────────────────────────────────
  // Matches: reward-boosts.js recordSpend INSERT
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS boost_spend_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      boost_id uuid NOT NULL REFERENCES seller_boosts(id) ON DELETE CASCADE,
      amount_minor integer NOT NULL,
      reason varchar(60) NOT NULL DEFAULT 'impression',
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT boost_spend_events_amount_positive CHECK (amount_minor > 0)
    );
  `);
  pgm.createIndex("boost_spend_events", ["boost_id", "created_at"]);

  // ─── trust_profiles ──────────────────────────────────────────────────
  // Matches: reward-trust.js service exactly
  // Uses 'score' and 'band' (not 'trust_score'/'trust_band')
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS trust_profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      score integer NOT NULL DEFAULT 500,
      band varchar(20) NOT NULL DEFAULT 'good',
      identity_score integer NOT NULL DEFAULT 0,
      behavioral_score integer NOT NULL DEFAULT 0,
      transaction_score integer NOT NULL DEFAULT 0,
      social_score integer NOT NULL DEFAULT 0,
      device_score integer NOT NULL DEFAULT 0,
      penalty_multiplier numeric(4,2) NOT NULL DEFAULT 1.00,
      flags_active integer NOT NULL DEFAULT 0,
      last_calculated_at timestamptz NOT NULL DEFAULT current_timestamp,
      previous_score integer,
      previous_band varchar(20),
      score_change_reason varchar(255),
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT trust_profiles_score_range CHECK (
        score >= 0 AND score <= 1000
      ),
      CONSTRAINT trust_profiles_penalty_range CHECK (
        penalty_multiplier >= 0.00 AND penalty_multiplier <= 1.00
      )
    );
  `);
  pgm.createIndex("trust_profiles", ["band"]);
  pgm.createIndex("trust_profiles", ["score"]);
  pgm.createIndex("trust_profiles", ["last_calculated_at"]);

  // ─── admin_actions column fix ────────────────────────────────────────
  // Service uses 'admin_id' but migration-3 created 'admin_user_id'.
  // Rename the column to match the service.
  pgm.sql(`
    ALTER TABLE admin_actions
      RENAME COLUMN admin_user_id TO admin_id;
  `);
  // Also add 'metadata' column used by the service logAction
  pgm.sql(`
    ALTER TABLE admin_actions
      ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
  `);
};

exports.down = (pgm) => {
  // Reverse column rename
  pgm.sql(`
    ALTER TABLE admin_actions
      DROP COLUMN IF EXISTS metadata;
  `);
  pgm.sql(`
    ALTER TABLE admin_actions
      RENAME COLUMN admin_id TO admin_user_id;
  `);

  pgm.dropTable("trust_profiles", { ifExists: true });
  pgm.dropTable("boost_spend_events", { ifExists: true });
  pgm.dropTable("seller_boosts", { ifExists: true });
};
