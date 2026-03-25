/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE checkout_sessions
    DROP CONSTRAINT IF EXISTS checkout_sessions_kind_check;
  `);
  pgm.sql(`
    ALTER TABLE checkout_sessions
    ADD CONSTRAINT checkout_sessions_kind_check
    CHECK (kind IN ('product','support','subscription'));
  `);

  pgm.sql(`
    ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_kind_check;
  `);
  pgm.sql(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_kind_check
    CHECK (kind IN ('product','support','subscription'));
  `);

  pgm.createTable("creator_subscription_tiers", {
    id: "id",
    creator_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    title: {
      type: "varchar(120)",
      notNull: true
    },
    description: {
      type: "text"
    },
    monthly_price_minor: {
      type: "integer",
      notNull: true
    },
    currency: {
      type: "varchar(3)",
      notNull: true,
      default: "usd"
    },
    stripe_price_id: {
      type: "varchar(255)"
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "draft"
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
    "creator_subscription_tiers",
    "creator_subscription_tiers_status_check",
    "CHECK (status IN ('draft','published','archived'))"
  );
  pgm.createConstraint(
    "creator_subscription_tiers",
    "creator_subscription_tiers_monthly_price_positive_check",
    "CHECK (monthly_price_minor > 0)"
  );
  pgm.createIndex("creator_subscription_tiers", ["creator_user_id", "status"]);

  pgm.createTable("creator_subscriptions", {
    id: "id",
    tier_id: {
      type: "integer",
      notNull: true,
      references: "creator_subscription_tiers(id)",
      onDelete: "cascade"
    },
    creator_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    subscriber_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    stripe_subscription_id: {
      type: "varchar(255)",
      unique: true
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "active"
    },
    current_period_end: {
      type: "timestamptz"
    },
    cancel_at_period_end: {
      type: "boolean",
      notNull: true,
      default: false
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
    "creator_subscriptions",
    "creator_subscriptions_status_check",
    "CHECK (status IN ('active','canceled','past_due','incomplete','expired'))"
  );
  pgm.createIndex("creator_subscriptions", ["subscriber_user_id", "creator_user_id"], {
    unique: true
  });
  pgm.createIndex("creator_subscriptions", ["creator_user_id", "status"]);

  pgm.createTable("affiliate_codes", {
    id: "id",
    affiliate_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    code: {
      type: "varchar(64)",
      notNull: true,
      unique: true
    },
    is_active: {
      type: "boolean",
      notNull: true,
      default: true
    },
    uses_count: {
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
  pgm.createIndex("affiliate_codes", ["affiliate_user_id", "is_active"]);

  pgm.createTable("affiliate_conversions", {
    id: "id",
    affiliate_code_id: {
      type: "integer",
      notNull: true,
      references: "affiliate_codes(id)",
      onDelete: "cascade"
    },
    checkout_session_id: {
      type: "integer",
      references: "checkout_sessions(id)",
      onDelete: "set null"
    },
    order_id: {
      type: "integer",
      references: "orders(id)",
      onDelete: "set null"
    },
    affiliate_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    seller_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    buyer_user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    amount_minor: {
      type: "integer",
      notNull: true
    },
    commission_minor: {
      type: "integer",
      notNull: true
    },
    currency: {
      type: "varchar(3)",
      notNull: true,
      default: "usd"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createConstraint(
    "affiliate_conversions",
    "affiliate_conversions_amount_positive_check",
    "CHECK (amount_minor > 0)"
  );
  pgm.createConstraint(
    "affiliate_conversions",
    "affiliate_conversions_commission_non_negative_check",
    "CHECK (commission_minor >= 0)"
  );
  pgm.createIndex("affiliate_conversions", ["order_id"], { unique: true, where: "order_id IS NOT NULL" });
  pgm.createIndex("affiliate_conversions", ["affiliate_user_id", "created_at"]);
  pgm.createIndex("affiliate_conversions", ["seller_user_id", "created_at"]);

  pgm.createTable("creator_ranking_snapshots", {
    id: "id",
    snapshot_date: {
      type: "date",
      notNull: true
    },
    creator_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    gross_earnings_minor: {
      type: "integer",
      notNull: true,
      default: 0
    },
    supporters_count: {
      type: "integer",
      notNull: true,
      default: 0
    },
    conversions_count: {
      type: "integer",
      notNull: true,
      default: 0
    },
    score: {
      type: "numeric",
      notNull: true,
      default: 0
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("creator_ranking_snapshots", ["snapshot_date", "creator_user_id"], {
    unique: true
  });
  pgm.createIndex("creator_ranking_snapshots", ["snapshot_date", "score"]);
};

exports.down = (pgm) => {
  pgm.dropTable("creator_ranking_snapshots");
  pgm.dropTable("affiliate_conversions");
  pgm.dropTable("affiliate_codes");
  pgm.dropTable("creator_subscriptions");
  pgm.dropTable("creator_subscription_tiers");

  pgm.sql(`
    ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_kind_check;
  `);
  pgm.sql(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_kind_check
    CHECK (kind IN ('product','support'));
  `);
  pgm.sql(`
    ALTER TABLE checkout_sessions
    DROP CONSTRAINT IF EXISTS checkout_sessions_kind_check;
  `);
  pgm.sql(`
    ALTER TABLE checkout_sessions
    ADD CONSTRAINT checkout_sessions_kind_check
    CHECK (kind IN ('product','support'));
  `);
};
