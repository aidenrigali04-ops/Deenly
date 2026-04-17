exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("reward_accounts", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade",
      unique: true
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createTable("reward_ledger_entries", {
    id: "id",
    reward_account_id: {
      type: "integer",
      notNull: true,
      references: "reward_accounts(id)",
      onDelete: "cascade"
    },
    delta_points: {
      type: "bigint",
      notNull: true
    },
    entry_kind: {
      type: "varchar(16)",
      notNull: true
    },
    reason: {
      type: "varchar(64)",
      notNull: true
    },
    idempotency_key: {
      type: "varchar(128)",
      notNull: true
    },
    metadata: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    reverses_ledger_entry_id: {
      type: "integer",
      references: "reward_ledger_entries(id)",
      onDelete: "restrict"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createConstraint(
    "reward_ledger_entries",
    "reward_ledger_entries_entry_kind_check",
    "CHECK (entry_kind IN ('earn','spend','reversal'))"
  );

  pgm.createIndex("reward_ledger_entries", ["reward_account_id", "idempotency_key"], {
    unique: true
  });
  pgm.createIndex("reward_ledger_entries", ["reward_account_id", "created_at", "id"]);

  pgm.sql(`
    CREATE UNIQUE INDEX reward_ledger_one_reversal_per_target
    ON reward_ledger_entries (reverses_ledger_entry_id)
    WHERE entry_kind = 'reversal' AND reverses_ledger_entry_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP INDEX IF EXISTS reward_ledger_one_reversal_per_target;");
  pgm.dropTable("reward_ledger_entries");
  pgm.dropTable("reward_accounts");
};
