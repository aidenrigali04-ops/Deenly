/* eslint-disable camelcase */

/**
 * Migration 3 of 3 — Trust, Boost, Ranking & Admin
 *
 * Tables created:
 *  11. boost_purchases      — Seller-funded boost campaigns
 *  12. boost_impressions    — Per-impression logging for boost spend
 *  13. ranking_signals      — Precomputed organic ranking signals per seller
 *  14. seller_trust_profiles — Composite trust score per seller
 *  15. fraud_flags          — Fraud detection events and resolution
 *  16. admin_actions        — Complete audit trail for admin operations
 *
 * Source of truth: Deenly Business Rules & Economics Specification,
 *                  Fraud & Trust Policy
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ─── 11. boost_purchases ──────────────────────────────────────────────
  // Seller-paid boost campaigns. Budget is in cents. The boost_multiplier
  // modifies organic rank — it NEVER overrides it.
  pgm.sql(`
    CREATE TABLE boost_purchases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id integer REFERENCES creator_products(id) ON DELETE SET NULL,
      boost_type varchar(20) NOT NULL DEFAULT 'standard',
      boost_multiplier numeric(4,2) NOT NULL DEFAULT 1.50,
      budget_minor integer NOT NULL,
      spent_minor integer NOT NULL DEFAULT 0,
      impression_count integer NOT NULL DEFAULT 0,
      status varchar(20) NOT NULL DEFAULT 'active',
      starts_at timestamptz NOT NULL DEFAULT current_timestamp,
      ends_at timestamptz,
      paused_at timestamptz,
      stripe_payment_intent_id varchar(255),
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT boost_purchases_type_check CHECK (
        boost_type IN ('standard','premium','featured')
      ),
      CONSTRAINT boost_purchases_multiplier_range CHECK (
        boost_multiplier >= 1.00 AND boost_multiplier <= 5.00
      ),
      CONSTRAINT boost_purchases_budget_positive CHECK (budget_minor > 0),
      CONSTRAINT boost_purchases_spent_non_negative CHECK (spent_minor >= 0),
      CONSTRAINT boost_purchases_spent_within_budget CHECK (spent_minor <= budget_minor),
      CONSTRAINT boost_purchases_impression_non_negative CHECK (impression_count >= 0),
      CONSTRAINT boost_purchases_status_check CHECK (
        status IN ('active','paused','exhausted','cancelled','expired')
      )
    );
  `);
  pgm.createIndex("boost_purchases", ["seller_user_id", "status"]);
  pgm.createIndex("boost_purchases", ["product_id"], {
    where: "product_id IS NOT NULL"
  });
  pgm.createIndex("boost_purchases", ["status", "ends_at"]);

  // ─── 12. boost_impressions ────────────────────────────────────────────
  // Per-impression log. Each time a boosted item is shown, an impression
  // is logged and the cost deducted from the boost budget.
  pgm.sql(`
    CREATE TABLE boost_impressions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      boost_id uuid NOT NULL REFERENCES boost_purchases(id) ON DELETE CASCADE,
      viewer_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      cost_minor integer NOT NULL,
      position_in_feed integer,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT boost_impressions_cost_non_negative CHECK (cost_minor >= 0)
    );
  `);
  pgm.createIndex("boost_impressions", ["boost_id", "created_at"]);
  pgm.createIndex("boost_impressions", ["viewer_user_id", "created_at"]);

  // ─── 13. ranking_signals ──────────────────────────────────────────────
  // Precomputed organic ranking signals per seller/product. Refreshed by
  // a periodic cron job. The feed module reads these to compute
  // visibility_score = organic_score × boost_multiplier × penalty_multiplier
  pgm.sql(`
    CREATE TABLE ranking_signals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id integer REFERENCES creator_products(id) ON DELETE CASCADE,
      signal_type varchar(30) NOT NULL,
      organic_score numeric(10,4) NOT NULL DEFAULT 0,
      component_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
      period_start timestamptz NOT NULL,
      period_end timestamptz NOT NULL,
      computed_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT ranking_signals_signal_type_check CHECK (
        signal_type IN (
          'seller_overall','product_listing',
          'sales_velocity','review_quality',
          'fulfillment_rate','response_time'
        )
      ),
      CONSTRAINT ranking_signals_score_non_negative CHECK (organic_score >= 0)
    );
  `);
  pgm.createIndex("ranking_signals", ["seller_user_id", "signal_type"]);
  pgm.createIndex("ranking_signals", ["product_id", "signal_type"], {
    where: "product_id IS NOT NULL"
  });
  pgm.createIndex("ranking_signals", ["computed_at"]);
  // Keep only latest signal per seller+product+type
  pgm.sql(`
    CREATE UNIQUE INDEX ranking_signals_latest_unique
    ON ranking_signals (seller_user_id, COALESCE(product_id, 0), signal_type, period_start);
  `);

  // ─── 14. seller_trust_profiles ────────────────────────────────────────
  // Composite trust score per seller. 0-1000 scale.
  // Components: identity (30%), behavioral (25%), transaction (20%),
  //             social (15%), device (10%)
  pgm.sql(`
    CREATE TABLE seller_trust_profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      trust_score integer NOT NULL DEFAULT 500,
      trust_band varchar(20) NOT NULL DEFAULT 'new',
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
      CONSTRAINT seller_trust_profiles_score_range CHECK (
        trust_score >= 0 AND trust_score <= 1000
      ),
      CONSTRAINT seller_trust_profiles_band_check CHECK (
        trust_band IN ('critical','low','new','good','excellent')
      ),
      CONSTRAINT seller_trust_profiles_component_range CHECK (
        identity_score >= 0 AND identity_score <= 300 AND
        behavioral_score >= 0 AND behavioral_score <= 250 AND
        transaction_score >= 0 AND transaction_score <= 200 AND
        social_score >= 0 AND social_score <= 150 AND
        device_score >= 0 AND device_score <= 100
      ),
      CONSTRAINT seller_trust_profiles_penalty_range CHECK (
        penalty_multiplier >= 0.00 AND penalty_multiplier <= 1.00
      )
    );
  `);
  pgm.createIndex("seller_trust_profiles", ["trust_band"]);
  pgm.createIndex("seller_trust_profiles", ["trust_score"]);
  pgm.createIndex("seller_trust_profiles", ["last_calculated_at"]);

  // ─── 15. fraud_flags ──────────────────────────────────────────────────
  // Individual fraud detection events. Can target a user, a transaction,
  // or a referral. Resolved by admin or auto-resolution rules.
  pgm.sql(`
    CREATE TABLE fraud_flags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      flag_type varchar(40) NOT NULL,
      severity varchar(10) NOT NULL DEFAULT 'medium',
      source varchar(30) NOT NULL,
      reference_type varchar(30),
      reference_id varchar(64),
      evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
      status varchar(20) NOT NULL DEFAULT 'open',
      auto_action_taken varchar(40),
      resolved_by integer REFERENCES users(id) ON DELETE SET NULL,
      resolved_at timestamptz,
      resolution_note varchar(500),
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT fraud_flags_type_check CHECK (
        flag_type IN (
          'velocity_breach','daily_cap_breach','duplicate_transaction',
          'self_referral','device_overlap','ip_overlap',
          'referral_farming','refund_abuse','account_sharing',
          'suspicious_pattern','manual_flag','trust_score_drop'
        )
      ),
      CONSTRAINT fraud_flags_severity_check CHECK (
        severity IN ('low','medium','high','critical')
      ),
      CONSTRAINT fraud_flags_source_check CHECK (
        source IN ('system_auto','admin_manual','trust_engine','velocity_check','referral_check')
      ),
      CONSTRAINT fraud_flags_status_check CHECK (
        status IN ('open','investigating','resolved_legitimate','resolved_fraud','auto_resolved','expired')
      )
    );
  `);
  pgm.createIndex("fraud_flags", ["user_id", "status"]);
  pgm.createIndex("fraud_flags", ["flag_type", "created_at"]);
  pgm.createIndex("fraud_flags", ["status", "severity"]);
  pgm.createIndex("fraud_flags", ["reference_type", "reference_id"]);
  pgm.createIndex("fraud_flags", ["created_at"]);

  // ─── 16. admin_actions ────────────────────────────────────────────────
  // Complete audit trail for all admin operations on the rewards system.
  // Immutable — no UPDATE or DELETE.
  pgm.sql(`
    CREATE TABLE admin_actions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_type varchar(40) NOT NULL,
      target_type varchar(30) NOT NULL,
      target_id varchar(64) NOT NULL,
      target_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      before_state jsonb,
      after_state jsonb,
      reason varchar(500) NOT NULL,
      ip_address varchar(45),
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT admin_actions_action_type_check CHECK (
        action_type IN (
          'manual_credit','manual_debit','freeze_account','unfreeze_account',
          'void_points','tier_override','streak_reset','streak_shield_grant',
          'referral_approve','referral_reject','referral_hold_extend',
          'challenge_create','challenge_cancel','challenge_modify',
          'boost_pause','boost_cancel','boost_refund',
          'fraud_flag_resolve','fraud_flag_create','trust_score_override',
          'config_update','bulk_action','account_ban','account_unban'
        )
      ),
      CONSTRAINT admin_actions_target_type_check CHECK (
        target_type IN (
          'reward_account','ledger_entry','referral','challenge',
          'boost','trust_profile','fraud_flag','config','user'
        )
      )
    );
  `);
  pgm.createIndex("admin_actions", ["admin_user_id", "created_at"]);
  pgm.createIndex("admin_actions", ["target_user_id", "created_at"]);
  pgm.createIndex("admin_actions", ["action_type", "created_at"]);
  pgm.createIndex("admin_actions", ["target_type", "target_id"]);
};

exports.down = (pgm) => {
  pgm.dropTable("admin_actions");
  pgm.dropTable("fraud_flags");
  pgm.dropTable("seller_trust_profiles");
  pgm.dropTable("ranking_signals");
  pgm.dropTable("boost_impressions");
  pgm.dropTable("boost_purchases");
};
