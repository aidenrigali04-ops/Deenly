exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("creator_products", {
    rewards_redemption_eligible: {
      type: "boolean",
      notNull: true,
      default: true
    }
  });

  pgm.createTable("checkout_reward_redemptions", {
    id: "id",
    stripe_checkout_session_id: {
      type: "varchar(255)",
      notNull: true,
      unique: true
    },
    buyer_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    product_id: {
      type: "integer",
      notNull: true,
      references: "creator_products(id)",
      onDelete: "cascade"
    },
    list_price_minor: { type: "integer", notNull: true },
    discount_minor: { type: "integer", notNull: true, default: 0 },
    points_spent: { type: "bigint", notNull: true },
    currency: { type: "varchar(3)", notNull: true, default: "usd" },
    reward_ledger_spend_entry_id: {
      type: "integer",
      notNull: true,
      references: "reward_ledger_entries(id)",
      onDelete: "restrict"
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "active"
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
    "checkout_reward_redemptions",
    "checkout_reward_redemptions_status_check",
    "CHECK (status IN ('active','reversed'))"
  );
};

exports.down = (pgm) => {
  pgm.dropTable("checkout_reward_redemptions");
  pgm.dropColumns("creator_products", ["rewards_redemption_eligible"]);
};
