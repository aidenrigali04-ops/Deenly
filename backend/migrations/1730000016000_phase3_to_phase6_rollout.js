/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("posts", {
    is_business_post: {
      type: "boolean",
      notNull: true,
      default: false
    },
    cta_label: {
      type: "varchar(80)"
    },
    cta_url: {
      type: "text"
    },
    removed_at: {
      type: "timestamptz"
    },
    removed_by: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    }
  });

  pgm.addConstraint(
    "posts",
    "posts_business_cta_pair_check",
    "CHECK ((cta_label IS NULL AND cta_url IS NULL) OR (cta_label IS NOT NULL AND cta_url IS NOT NULL))"
  );
  pgm.createIndex("posts", ["is_business_post", "created_at"]);
  pgm.createIndex("posts", ["removed_at"]);

  pgm.createTable("ad_campaigns", {
    id: "id",
    creator_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    post_id: {
      type: "integer",
      notNull: true,
      references: "posts(id)",
      onDelete: "cascade"
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "draft"
    },
    budget_minor: {
      type: "integer",
      notNull: true
    },
    spent_minor: {
      type: "integer",
      notNull: true,
      default: 0
    },
    currency: {
      type: "varchar(3)",
      notNull: true,
      default: "usd"
    },
    daily_cap_impressions: {
      type: "integer",
      notNull: true,
      default: 1000
    },
    starts_at: {
      type: "timestamptz"
    },
    ends_at: {
      type: "timestamptz"
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
    "ad_campaigns",
    "ad_campaigns_status_check",
    "CHECK (status IN ('draft','active','paused','ended','rejected'))"
  );
  pgm.createConstraint(
    "ad_campaigns",
    "ad_campaigns_budget_positive_check",
    "CHECK (budget_minor > 0 AND spent_minor >= 0 AND spent_minor <= budget_minor)"
  );
  pgm.createIndex("ad_campaigns", ["status", "created_at"]);
  pgm.createIndex("ad_campaigns", ["creator_user_id", "created_at"]);

  pgm.createTable("ad_creative_reviews", {
    id: "id",
    campaign_id: {
      type: "integer",
      notNull: true,
      references: "ad_campaigns(id)",
      onDelete: "cascade"
    },
    reviewer_user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "pending"
    },
    notes: {
      type: "text"
    },
    reviewed_at: {
      type: "timestamptz"
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
    "ad_creative_reviews",
    "ad_creative_reviews_status_check",
    "CHECK (status IN ('pending','approved','rejected'))"
  );
  pgm.createIndex("ad_creative_reviews", ["status", "created_at"]);
  pgm.createIndex("ad_creative_reviews", ["campaign_id"], { unique: true });

  pgm.createTable("ad_events", {
    id: "id",
    campaign_id: {
      type: "integer",
      notNull: true,
      references: "ad_campaigns(id)",
      onDelete: "cascade"
    },
    event_type: {
      type: "varchar(20)",
      notNull: true
    },
    viewer_user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "set null"
    },
    metadata: {
      type: "jsonb",
      notNull: true,
      default: "{}"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createConstraint(
    "ad_events",
    "ad_events_event_type_check",
    "CHECK (event_type IN ('impression','click'))"
  );
  pgm.createIndex("ad_events", ["campaign_id", "created_at"]);
  pgm.createIndex("ad_events", ["event_type", "created_at"]);

  pgm.createTable("ad_spend_ledger", {
    id: "id",
    campaign_id: {
      type: "integer",
      notNull: true,
      references: "ad_campaigns(id)",
      onDelete: "cascade"
    },
    event_id: {
      type: "integer",
      references: "ad_events(id)",
      onDelete: "set null"
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
      type: "text"
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createConstraint(
    "ad_spend_ledger",
    "ad_spend_ledger_amount_positive_check",
    "CHECK (amount_minor > 0)"
  );
  pgm.createIndex("ad_spend_ledger", ["campaign_id", "created_at"]);

  pgm.createTable("creator_conversion_daily", {
    id: "id",
    summary_date: {
      type: "date",
      notNull: true
    },
    creator_user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "cascade"
    },
    post_views_count: {
      type: "integer",
      notNull: true,
      default: 0
    },
    cta_clicks_count: {
      type: "integer",
      notNull: true,
      default: 0
    },
    purchases_count: {
      type: "integer",
      notNull: true,
      default: 0
    },
    gross_minor: {
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
  pgm.createIndex("creator_conversion_daily", ["summary_date", "creator_user_id"], {
    unique: true
  });

  pgm.createTable("feed_quality_daily", {
    id: "id",
    summary_date: {
      type: "date",
      notNull: true,
      unique: true
    },
    avg_completion_rate: {
      type: "numeric",
      notNull: true,
      default: 0
    },
    avg_watch_time_ms: {
      type: "numeric",
      notNull: true,
      default: 0
    },
    reported_posts_count: {
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
};

exports.down = (pgm) => {
  pgm.dropTable("feed_quality_daily");
  pgm.dropTable("creator_conversion_daily");
  pgm.dropTable("ad_spend_ledger");
  pgm.dropTable("ad_events");
  pgm.dropTable("ad_creative_reviews");
  pgm.dropTable("ad_campaigns");
  pgm.dropConstraint("posts", "posts_business_cta_pair_check");
  pgm.dropColumns("posts", ["is_business_post", "cta_label", "cta_url", "removed_at", "removed_by"]);
};
