/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("creator_payout_accounts", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    stripe_account_id: {
      type: "varchar(255)",
      notNull: true,
      unique: true
    },
    charges_enabled: { type: "boolean", notNull: true, default: false },
    payouts_enabled: { type: "boolean", notNull: true, default: false },
    details_submitted: { type: "boolean", notNull: true, default: false },
    country: { type: "varchar(2)" },
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
  pgm.createIndex("creator_payout_accounts", ["user_id"], {
    unique: true
  });

  pgm.createTable("creator_products", {
    id: "id",
    creator_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    title: {
      type: "varchar(180)",
      notNull: true
    },
    description: {
      type: "text"
    },
    price_minor: {
      type: "integer",
      notNull: true
    },
    currency: {
      type: "varchar(3)",
      notNull: true,
      default: "usd"
    },
    delivery_media_key: {
      type: "varchar(512)",
      notNull: true
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
    "creator_products",
    "creator_products_status_check",
    "CHECK (status IN ('draft','published','archived'))"
  );
  pgm.createConstraint(
    "creator_products",
    "creator_products_price_positive_check",
    "CHECK (price_minor > 0)"
  );
  pgm.createIndex("creator_products", ["creator_user_id", "status"]);

  pgm.createTable("post_product_links", {
    id: "id",
    post_id: {
      type: "integer",
      notNull: true,
      references: "posts(id)",
      onDelete: "cascade"
    },
    product_id: {
      type: "integer",
      notNull: true,
      references: "creator_products(id)",
      onDelete: "cascade"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("post_product_links", ["post_id"], { unique: true });
  pgm.createIndex("post_product_links", ["product_id"]);

  pgm.createTable("checkout_sessions", {
    id: "id",
    buyer_user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    seller_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    product_id: {
      type: "integer",
      references: "creator_products(id)",
      onDelete: "set null"
    },
    kind: {
      type: "varchar(20)",
      notNull: true
    },
    stripe_checkout_session_id: {
      type: "varchar(255)",
      notNull: true,
      unique: true
    },
    amount_minor: {
      type: "integer",
      notNull: true
    },
    currency: {
      type: "varchar(3)",
      notNull: true,
      default: "usd"
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "created"
    },
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
    "checkout_sessions",
    "checkout_sessions_kind_check",
    "CHECK (kind IN ('product','support'))"
  );
  pgm.createConstraint(
    "checkout_sessions",
    "checkout_sessions_status_check",
    "CHECK (status IN ('created','completed','failed','expired','canceled'))"
  );
  pgm.createConstraint(
    "checkout_sessions",
    "checkout_sessions_amount_positive_check",
    "CHECK (amount_minor > 0)"
  );
  pgm.createIndex("checkout_sessions", ["buyer_user_id", "created_at"]);
  pgm.createIndex("checkout_sessions", ["seller_user_id", "created_at"]);

  pgm.createTable("orders", {
    id: "id",
    checkout_session_id: {
      type: "integer",
      references: "checkout_sessions(id)",
      onDelete: "set null",
      unique: true
    },
    buyer_user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    seller_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    product_id: {
      type: "integer",
      references: "creator_products(id)",
      onDelete: "set null"
    },
    kind: {
      type: "varchar(20)",
      notNull: true
    },
    amount_minor: {
      type: "integer",
      notNull: true
    },
    platform_fee_minor: {
      type: "integer",
      notNull: true
    },
    creator_net_minor: {
      type: "integer",
      notNull: true
    },
    currency: {
      type: "varchar(3)",
      notNull: true,
      default: "usd"
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "completed"
    },
    stripe_payment_intent_id: {
      type: "varchar(255)"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createConstraint("orders", "orders_kind_check", "CHECK (kind IN ('product','support'))");
  pgm.createConstraint(
    "orders",
    "orders_status_check",
    "CHECK (status IN ('completed','refunded','disputed'))"
  );
  pgm.createConstraint("orders", "orders_amount_positive_check", "CHECK (amount_minor > 0)");
  pgm.createConstraint("orders", "orders_fee_non_negative_check", "CHECK (platform_fee_minor >= 0)");
  pgm.createConstraint("orders", "orders_net_non_negative_check", "CHECK (creator_net_minor >= 0)");
  pgm.createIndex("orders", ["buyer_user_id", "created_at"]);
  pgm.createIndex("orders", ["seller_user_id", "created_at"]);
  pgm.createIndex("orders", ["product_id", "created_at"]);

  pgm.createTable("earnings_ledger", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    order_id: {
      type: "integer",
      references: "orders(id)",
      onDelete: "set null"
    },
    entry_type: {
      type: "varchar(20)",
      notNull: true
    },
    amount_minor: {
      type: "integer",
      notNull: true
    },
    currency: {
      type: "varchar(3)",
      notNull: true,
      default: "usd"
    },
    note: {
      type: "varchar(255)"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createConstraint(
    "earnings_ledger",
    "earnings_ledger_entry_type_check",
    "CHECK (entry_type IN ('credit','debit','payout'))"
  );
  pgm.createIndex("earnings_ledger", ["user_id", "created_at"]);
  pgm.createIndex("earnings_ledger", ["order_id"]);

  pgm.createTable("webhook_events", {
    id: "id",
    provider: {
      type: "varchar(50)",
      notNull: true
    },
    event_id: {
      type: "varchar(255)",
      notNull: true
    },
    event_type: {
      type: "varchar(255)",
      notNull: true
    },
    payload: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    processed_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("webhook_events", ["provider", "event_id"], {
    unique: true
  });
};

exports.down = (pgm) => {
  pgm.dropTable("webhook_events");
  pgm.dropTable("earnings_ledger");
  pgm.dropTable("orders");
  pgm.dropTable("checkout_sessions");
  pgm.dropTable("post_product_links");
  pgm.dropTable("creator_products");
  pgm.dropTable("creator_payout_accounts");
};
