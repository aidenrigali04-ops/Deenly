exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("seller_boost_purchases", {
    id: "id",
    seller_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    checkout_session_id: {
      type: "integer",
      references: "checkout_sessions(id)",
      onDelete: "set null"
    },
    package_tier_id: {
      type: "varchar(64)",
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
    status: {
      type: "varchar(24)",
      notNull: true,
      default: "pending_payment"
    },
    starts_at: { type: "timestamptz" },
    ends_at: { type: "timestamptz" },
    activated_at: { type: "timestamptz" },
    canceled_at: { type: "timestamptz" },
    idempotency_key: {
      type: "varchar(128)",
      notNull: true
    },
    payment_confirmation_id: { type: "varchar(255)" },
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
    "seller_boost_purchases",
    "seller_boost_purchases_status_check",
    "CHECK (status IN ('pending_payment','active','expired','canceled','refunded'))"
  );
  pgm.createConstraint(
    "seller_boost_purchases",
    "seller_boost_purchases_amount_positive_check",
    "CHECK (amount_minor > 0)"
  );
  pgm.createIndex("seller_boost_purchases", ["seller_user_id", "idempotency_key"], { unique: true });
  pgm.createIndex("seller_boost_purchases", ["seller_user_id", "status", "created_at"]);
  pgm.createIndex("seller_boost_purchases", ["status", "ends_at"]);

  pgm.createTable("seller_boost_targets", {
    id: "id",
    purchase_id: {
      type: "integer",
      notNull: true,
      references: "seller_boost_purchases(id)",
      onDelete: "cascade"
    },
    post_id: {
      type: "integer",
      notNull: true,
      references: "posts(id)",
      onDelete: "cascade"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("seller_boost_targets", ["purchase_id", "post_id"], { unique: true });
  pgm.createIndex("seller_boost_targets", ["post_id", "purchase_id"]);

  pgm.createTable("seller_boost_impressions", {
    id: "id",
    purchase_id: {
      type: "integer",
      notNull: true,
      references: "seller_boost_purchases(id)",
      onDelete: "cascade"
    },
    post_id: {
      type: "integer",
      notNull: true,
      references: "posts(id)",
      onDelete: "cascade"
    },
    viewer_user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
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
    }
  });
  pgm.createIndex("seller_boost_impressions", ["purchase_id", "created_at"]);
  pgm.createIndex("seller_boost_impressions", ["post_id", "created_at"]);
};

exports.down = (pgm) => {
  pgm.dropTable("seller_boost_impressions");
  pgm.dropTable("seller_boost_targets");
  pgm.dropTable("seller_boost_purchases");
};
