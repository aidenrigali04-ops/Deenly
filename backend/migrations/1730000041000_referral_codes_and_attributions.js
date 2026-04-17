exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("referral_codes", {
    id: "id",
    referrer_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade",
      unique: true
    },
    code: {
      type: "varchar(64)",
      notNull: true,
      unique: true
    },
    status: {
      type: "varchar(16)",
      notNull: true,
      default: "active"
    },
    max_redemptions: {
      type: "integer",
      notNull: true,
      default: 100
    },
    attributable_signups_count: {
      type: "integer",
      notNull: true,
      default: 0
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

  pgm.createConstraint(
    "referral_codes",
    "referral_codes_status_check",
    "CHECK (status IN ('active','paused','revoked'))"
  );

  pgm.createConstraint(
    "referral_codes",
    "referral_codes_max_redemptions_check",
    "CHECK (max_redemptions >= 1)"
  );

  pgm.createTable("referral_attributions", {
    id: "id",
    referral_code_id: {
      type: "integer",
      notNull: true,
      references: "referral_codes(id)",
      onDelete: "cascade"
    },
    referrer_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    referee_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    status: {
      type: "varchar(24)",
      notNull: true
    },
    attributed_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    first_qualified_order_id: {
      type: "integer",
      references: "orders(id)",
      onDelete: "set null"
    },
    clear_after_at: { type: "timestamptz" },
    referrer_ledger_entry_id: {
      type: "integer",
      references: "reward_ledger_entries(id)",
      onDelete: "set null"
    },
    referee_ledger_entry_id: {
      type: "integer",
      references: "reward_ledger_entries(id)",
      onDelete: "set null"
    },
    qualified_at: { type: "timestamptz" },
    void_reason: { type: "varchar(64)" },
    metadata: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
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

  pgm.createConstraint(
    "referral_attributions",
    "referral_attributions_status_check",
    "CHECK (status IN ('pending_purchase','pending_clear','qualified','rejected','voided','expired'))"
  );

  pgm.createIndex("referral_attributions", ["referrer_user_id", "status"]);
  pgm.createIndex("referral_attributions", ["first_qualified_order_id"], {
    where: "first_qualified_order_id IS NOT NULL"
  });

  pgm.sql(`
    CREATE UNIQUE INDEX referral_attributions_referee_user_id_key
    ON referral_attributions (referee_user_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP INDEX IF EXISTS referral_attributions_referee_user_id_key;");
  pgm.dropTable("referral_attributions");
  pgm.dropTable("referral_codes");
};
