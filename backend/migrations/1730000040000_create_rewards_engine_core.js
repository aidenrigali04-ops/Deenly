/* eslint-disable camelcase */

/**
 * Migration 1 of 3 — Rewards Engine Core
 *
 * Tables created:
 *   1. reward_accounts       — One per user, holds tier/streak state
 *   2. reward_ledger_entries  — Append-only immutable points ledger
 *   3. reward_redemptions     — Point redemption requests
 *   4. reward_rules_config    — Configurable business rules (key-value)
 *
 * Source of truth: Deenly Business Rules & Economics Specification
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ─── 1. reward_accounts ───────────────────────────────────────────────
  // One row per user. Holds derived balance (trigger-maintained), tier,
  // streak state. The balance column is kept in sync by a trigger on
  // reward_ledger_entries — it is NEVER updated directly by application code.
  pgm.sql(`
    CREATE TABLE reward_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      balance integer NOT NULL DEFAULT 0,
      lifetime_earned integer NOT NULL DEFAULT 0,
      lifetime_redeemed integer NOT NULL DEFAULT 0,
      tier varchar(20) NOT NULL DEFAULT 'explorer',
      tier_qualified_at timestamptz,
      tier_grace_until timestamptz,
      rolling_12m_points integer NOT NULL DEFAULT 0,
      streak_current integer NOT NULL DEFAULT 0,
      streak_longest integer NOT NULL DEFAULT 0,
      streak_last_checkin_date date,
      streak_shields_remaining integer NOT NULL DEFAULT 0,
      streak_multiplier numeric(3,2) NOT NULL DEFAULT 1.00,
      points_earned_today integer NOT NULL DEFAULT 0,
      points_earned_today_date date,
      is_frozen boolean NOT NULL DEFAULT false,
      frozen_reason varchar(100),
      frozen_at timestamptz,
      last_activity_at timestamptz NOT NULL DEFAULT current_timestamp,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT reward_accounts_tier_check CHECK (
        tier IN ('explorer','member','insider','vip','elite')
      ),
      CONSTRAINT reward_accounts_balance_non_negative CHECK (balance >= 0),
      CONSTRAINT reward_accounts_lifetime_earned_non_negative CHECK (lifetime_earned >= 0),
      CONSTRAINT reward_accounts_lifetime_redeemed_non_negative CHECK (lifetime_redeemed >= 0),
      CONSTRAINT reward_accounts_streak_current_non_negative CHECK (streak_current >= 0),
      CONSTRAINT reward_accounts_streak_shields_non_negative CHECK (streak_shields_remaining >= 0),
      CONSTRAINT reward_accounts_streak_multiplier_min CHECK (streak_multiplier >= 1.00),
      CONSTRAINT reward_accounts_rolling_12m_non_negative CHECK (rolling_12m_points >= 0)
    );
  `);
  pgm.createIndex("reward_accounts", ["user_id"]);
  pgm.createIndex("reward_accounts", ["tier"]);
  pgm.createIndex("reward_accounts", ["streak_last_checkin_date"]);
  pgm.createIndex("reward_accounts", ["last_activity_at"]);

  // ─── 2. reward_ledger_entries ─────────────────────────────────────────
  // Append-only, immutable. Source of truth for all point balances.
  // No UPDATE or DELETE ever happens on this table.
  // balance_after is the user's balance AFTER this entry was applied.
  pgm.sql(`
    CREATE TABLE reward_ledger_entries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type varchar(10) NOT NULL,
      amount integer NOT NULL,
      balance_after integer NOT NULL,
      source varchar(40) NOT NULL,
      source_ref_type varchar(30),
      source_ref_id varchar(64),
      description varchar(255),
      tier_at_time varchar(20),
      multiplier_applied numeric(4,2) DEFAULT 1.00,
      idempotency_key varchar(128),
      metadata jsonb DEFAULT '{}'::jsonb,
      expires_at timestamptz,
      voided_at timestamptz,
      voided_reason varchar(255),
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT reward_ledger_entries_type_check CHECK (
        type IN ('credit','debit')
      ),
      CONSTRAINT reward_ledger_entries_amount_positive CHECK (amount > 0),
      CONSTRAINT reward_ledger_entries_source_check CHECK (
        source IN (
          'purchase','referral_earned','referral_bonus',
          'streak_bonus','challenge_reward','tier_bonus',
          'manual_credit','signup_bonus','review',
          'redemption','expiration','manual_debit',
          'fraud_void','refund_clawback'
        )
      ),
      CONSTRAINT reward_ledger_entries_balance_non_negative CHECK (balance_after >= 0)
    );
  `);
  pgm.createIndex("reward_ledger_entries", ["user_id", "created_at"]);
  pgm.createIndex("reward_ledger_entries", ["source", "created_at"]);
  pgm.createIndex("reward_ledger_entries", ["idempotency_key"], {
    unique: true,
    where: "idempotency_key IS NOT NULL"
  });
  pgm.createIndex("reward_ledger_entries", ["source_ref_type", "source_ref_id"]);
  pgm.createIndex("reward_ledger_entries", ["expires_at"], {
    where: "expires_at IS NOT NULL AND voided_at IS NULL"
  });
  pgm.createIndex("reward_ledger_entries", ["user_id", "source", "created_at"]);

  // Duplicate purchase detection: same user + order within 5 min window
  // Enforced at application level with idempotency_key, but we add a
  // partial unique index as a safety net for purchase-sourced entries.
  pgm.sql(`
    CREATE UNIQUE INDEX reward_ledger_entries_purchase_dedup
    ON reward_ledger_entries (user_id, source_ref_type, source_ref_id)
    WHERE source = 'purchase' AND voided_at IS NULL;
  `);

  // ─── 3. reward_redemptions ────────────────────────────────────────────
  // Tracks user requests to redeem points for discounts at checkout.
  pgm.sql(`
    CREATE TABLE reward_redemptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ledger_entry_id uuid REFERENCES reward_ledger_entries(id) ON DELETE SET NULL,
      order_id integer REFERENCES orders(id) ON DELETE SET NULL,
      points_amount integer NOT NULL,
      dollar_value_minor integer NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'pending',
      applied_at timestamptz,
      reversed_at timestamptz,
      reverse_reason varchar(255),
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp,
      CONSTRAINT reward_redemptions_points_min CHECK (points_amount >= 500),
      CONSTRAINT reward_redemptions_dollar_value_positive CHECK (dollar_value_minor > 0),
      CONSTRAINT reward_redemptions_status_check CHECK (
        status IN ('pending','applied','reversed','expired')
      ),
      CONSTRAINT reward_redemptions_cap_check CHECK (
        dollar_value_minor <= 2000
      )
    );
  `);
  pgm.createIndex("reward_redemptions", ["user_id", "created_at"]);
  pgm.createIndex("reward_redemptions", ["order_id"]);
  pgm.createIndex("reward_redemptions", ["status"]);

  // ─── 4. reward_rules_config ───────────────────────────────────────────
  // Key-value configuration store for all reward business rules.
  // Allows runtime updates without code deploys.
  pgm.sql(`
    CREATE TABLE reward_rules_config (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_key varchar(100) NOT NULL UNIQUE,
      rule_value jsonb NOT NULL,
      description varchar(500),
      updated_by integer REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp
    );
  `);

  // Seed default configuration values from Business Rules spec
  pgm.sql(`
    INSERT INTO reward_rules_config (rule_key, rule_value, description) VALUES
    -- Points earning
    ('points_per_dollar', '10', 'Base Deenly Points earned per $1 spent'),
    ('min_order_amount_minor', '2500', 'Minimum order amount in cents to earn points ($25)'),
    ('min_redemption_points', '500', 'Minimum points required to redeem (500 DP = $5)'),
    ('max_redemption_pct', '15', 'Maximum % of order that can be paid with points'),
    ('max_redemption_cap_minor', '2000', 'Maximum dollar cap on redemption per order ($20)'),
    ('points_to_dollar_ratio', '100', 'Points per $1 in redemption value (100 DP = $1)'),

    -- Daily earn caps by tier
    ('daily_earn_cap_explorer', '500', 'Max DP earnable per day for Explorer tier'),
    ('daily_earn_cap_member', '750', 'Max DP earnable per day for Member tier'),
    ('daily_earn_cap_insider', '1000', 'Max DP earnable per day for Insider tier'),
    ('daily_earn_cap_vip', '1500', 'Max DP earnable per day for VIP tier'),
    ('daily_earn_cap_elite', '2500', 'Max DP earnable per day for Elite tier'),

    -- Tier thresholds (rolling 12-month points)
    ('tier_threshold_explorer', '0', 'Points needed for Explorer tier'),
    ('tier_threshold_member', '1000', 'Points needed for Member tier'),
    ('tier_threshold_insider', '5000', 'Points needed for Insider tier'),
    ('tier_threshold_vip', '15000', 'Points needed for VIP tier'),
    ('tier_threshold_elite', '50000', 'Points needed for Elite tier'),

    -- Tier multipliers
    ('tier_multiplier_explorer', '1.00', 'Earn multiplier for Explorer'),
    ('tier_multiplier_member', '1.25', 'Earn multiplier for Member'),
    ('tier_multiplier_insider', '1.50', 'Earn multiplier for Insider'),
    ('tier_multiplier_vip', '2.00', 'Earn multiplier for VIP'),
    ('tier_multiplier_elite', '3.00', 'Earn multiplier for Elite'),

    -- Tier grace period
    ('tier_grace_period_days', '30', 'Days before tier downgrade after failing requalification'),

    -- Streak multipliers
    ('streak_multiplier_1_6', '1.00', 'Streak multiplier for days 1-6'),
    ('streak_multiplier_7_13', '1.50', 'Streak multiplier for days 7-13'),
    ('streak_multiplier_14_30', '2.00', 'Streak multiplier for days 14-30'),
    ('streak_multiplier_31_plus', '3.00', 'Streak multiplier for days 31+'),

    -- Streak shields by tier
    ('streak_shields_explorer', '0', 'Streak shields for Explorer tier'),
    ('streak_shields_member', '1', 'Streak shields for Member tier'),
    ('streak_shields_insider', '2', 'Streak shields for Insider tier'),
    ('streak_shields_vip', '3', 'Streak shields for VIP tier'),
    ('streak_shields_elite', '5', 'Streak shields for Elite tier'),

    -- Referral rewards
    ('referral_referrer_reward_dp', '250', 'DP awarded to referrer on qualified referral'),
    ('referral_referee_discount_minor', '500', 'Discount in cents for referee ($5)'),
    ('referral_hold_days', '14', 'Days to hold referral reward before release'),
    ('referral_monthly_cap', '20', 'Max referrals per user per month'),
    ('referral_min_purchase_minor', '2500', 'Min purchase by referee to qualify referral ($25)'),

    -- Velocity limits
    ('velocity_max_transactions_per_hour', '10', 'Max earn transactions per hour per user'),
    ('velocity_max_transactions_per_day', '50', 'Max earn transactions per day per user'),
    ('velocity_duplicate_window_seconds', '300', 'Window for duplicate transaction detection (5 min)'),

    -- Points expiration
    ('points_inactivity_expiration_months', '12', 'Months of inactivity before points expire'),

    -- Signup bonus
    ('signup_bonus_dp', '50', 'Points awarded on account creation')
    ;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("reward_rules_config");
  pgm.dropTable("reward_redemptions");
  pgm.dropTable("reward_ledger_entries");
  pgm.dropTable("reward_accounts");
};
