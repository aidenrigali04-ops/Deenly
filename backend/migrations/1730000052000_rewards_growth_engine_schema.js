/* eslint-disable camelcase */

/**
 * Deenly Rewards + Growth Engine — approved additive schema.
 *
 * Principles:
 * - Points balance is derived from reward_ledger_entries only (no balance column on reward_accounts).
 * - reward_ledger_entries are append-only (UPDATE blocked by trigger; corrections use reversal rows).
 *   DELETE is not blocked so ON DELETE CASCADE from reward_accounts / user teardown still works.
 * - Existing reward/referral/boost/redemption tables are not modified here (only new objects + triggers).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("feed_ranking_signals", {
    id: "id",
    entity_type: {
      type: "varchar(24)",
      notNull: true
    },
    entity_id: {
      type: "varchar(64)",
      notNull: true
    },
    signal_key: {
      type: "varchar(80)",
      notNull: true
    },
    value_numeric: { type: "numeric(24,8)" },
    value_jsonb: { type: "jsonb" },
    ingestion_batch_id: { type: "uuid" },
    source: {
      type: "varchar(48)",
      notNull: true
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint(
    "feed_ranking_signals",
    "feed_ranking_signals_entity_type_check",
    "CHECK (entity_type IN ('post','user','creator_product','order','seller'))"
  );
  pgm.createIndex("feed_ranking_signals", ["entity_type", "entity_id", "signal_key", "created_at"]);
  pgm.createIndex("feed_ranking_signals", ["source", "created_at"]);
  pgm.createIndex("feed_ranking_signals", ["ingestion_batch_id"], {
    where: "ingestion_batch_id IS NOT NULL"
  });

  pgm.createTable("seller_trust_profiles", {
    user_id: {
      type: "integer",
      notNull: true,
      primaryKey: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    trust_score: { type: "numeric(12,4)" },
    open_user_reports_count: {
      type: "integer",
      notNull: true,
      default: 0
    },
    open_reward_fraud_flags_count: {
      type: "integer",
      notNull: true,
      default: 0
    },
    reward_reversal_count_30d: {
      type: "integer",
      notNull: true,
      default: 0
    },
    metadata: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    computed_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint(
    "seller_trust_profiles",
    "seller_trust_profiles_open_reports_non_negative",
    "CHECK (open_user_reports_count >= 0 AND open_reward_fraud_flags_count >= 0 AND reward_reversal_count_30d >= 0)"
  );
  pgm.createIndex("seller_trust_profiles", ["computed_at"]);

  pgm.createTable("reward_fraud_flags", {
    id: "id",
    flag_type: {
      type: "varchar(64)",
      notNull: true
    },
    severity: {
      type: "varchar(16)",
      notNull: true,
      default: "low"
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "open"
    },
    subject_user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    related_entity_type: { type: "varchar(48)" },
    related_entity_id: { type: "varchar(128)" },
    reward_ledger_entry_id: {
      type: "integer",
      references: "reward_ledger_entries(id)",
      onDelete: "set null"
    },
    referral_attribution_id: {
      type: "integer",
      references: "referral_attributions(id)",
      onDelete: "set null"
    },
    seller_boost_purchase_id: {
      type: "integer",
      references: "seller_boost_purchases(id)",
      onDelete: "set null"
    },
    metadata: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    reviewer_user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    reviewed_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint(
    "reward_fraud_flags",
    "reward_fraud_flags_severity_check",
    "CHECK (severity IN ('info','low','medium','high'))"
  );
  pgm.addConstraint(
    "reward_fraud_flags",
    "reward_fraud_flags_status_check",
    "CHECK (status IN ('open','triaged','dismissed','confirmed'))"
  );
  pgm.createIndex("reward_fraud_flags", ["status", "severity", "created_at"]);
  pgm.createIndex("reward_fraud_flags", ["subject_user_id", "created_at"]);
  pgm.createIndex("reward_fraud_flags", ["reward_ledger_entry_id"], {
    where: "reward_ledger_entry_id IS NOT NULL"
  });
  pgm.createIndex("reward_fraud_flags", ["referral_attribution_id"], {
    where: "referral_attribution_id IS NOT NULL"
  });

  pgm.createTable("rewards_admin_actions", {
    id: "id",
    actor_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "restrict"
    },
    action_kind: {
      type: "varchar(64)",
      notNull: true
    },
    scope: {
      type: "varchar(32)",
      notNull: true,
      default: "rewards"
    },
    target_kind: { type: "varchar(48)" },
    target_id: { type: "varchar(128)" },
    reward_ledger_entry_id: {
      type: "integer",
      references: "reward_ledger_entries(id)",
      onDelete: "set null"
    },
    referral_attribution_id: {
      type: "integer",
      references: "referral_attributions(id)",
      onDelete: "set null"
    },
    reward_fraud_flag_id: {
      type: "integer",
      references: "reward_fraud_flags(id)",
      onDelete: "set null"
    },
    payload: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint(
    "rewards_admin_actions",
    "rewards_admin_actions_scope_check",
    "CHECK (scope IN ('rewards','referrals','ranking','fraud','boost','growth'))"
  );
  pgm.createIndex("rewards_admin_actions", ["actor_user_id", "created_at"]);
  pgm.createIndex("rewards_admin_actions", ["scope", "action_kind", "created_at"]);
  pgm.createIndex("rewards_admin_actions", ["referral_attribution_id"], {
    where: "referral_attribution_id IS NOT NULL"
  });
  pgm.createIndex("rewards_admin_actions", ["reward_fraud_flag_id"], {
    where: "reward_fraud_flag_id IS NOT NULL"
  });

  pgm.sql(`
    COMMENT ON TABLE reward_accounts IS 'One wallet row per user; balance is SUM(reward_ledger_entries.delta_points) — no stored balance column.';
    COMMENT ON TABLE reward_ledger_entries IS 'Append-only ledger: earn/spend/reversal rows only. UPDATE forbidden by trigger; use reversal rows for corrections. DELETE may occur via CASCADE when removing accounts.';
    COMMENT ON TABLE feed_ranking_signals IS 'Append-only ingestion of ranking inputs (materialized or pipeline snapshots).';
    COMMENT ON TABLE seller_trust_profiles IS 'Per-seller trust snapshot for rewards/ranking services; recompute jobs refresh counts — not the moderation reports source of truth.';
    COMMENT ON TABLE reward_fraud_flags IS 'Rewards-domain fraud / risk queue; distinct from analytics_events and generic trust_review_flags when a typed FK is needed.';
    COMMENT ON TABLE rewards_admin_actions IS 'Append-only audit log for admin/growth operations on rewards-related entities.';
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION forbid_reward_ledger_row_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      RAISE EXCEPTION 'reward_ledger_entries are append-only; use reversal entries instead of UPDATE';
    END;
    $fn$;

    DROP TRIGGER IF EXISTS reward_ledger_entries_forbid_update ON reward_ledger_entries;
    CREATE TRIGGER reward_ledger_entries_forbid_update
      BEFORE UPDATE ON reward_ledger_entries
      FOR EACH ROW
      EXECUTE PROCEDURE forbid_reward_ledger_row_mutation();

  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS reward_ledger_entries_forbid_update ON reward_ledger_entries;
    DROP FUNCTION IF EXISTS forbid_reward_ledger_row_mutation();
  `);

  pgm.dropTable("rewards_admin_actions");
  pgm.dropTable("reward_fraud_flags");
  pgm.dropTable("seller_trust_profiles");
  pgm.dropTable("feed_ranking_signals");
};
