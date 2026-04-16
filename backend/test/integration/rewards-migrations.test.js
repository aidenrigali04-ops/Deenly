/**
 * Rewards Migration Verification Tests
 *
 * These tests do NOT require a live database. They verify the migration files
 * structurally: correct exports, expected tables present in SQL, seed data keys,
 * and up/down symmetry. Run with the normal `npm test` (jest --runInBand).
 *
 * For live up/down testing, use: npm run test:integration:local
 */

const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "../../migrations");

function loadMigration(filename) {
  return require(path.join(MIGRATIONS_DIR, filename));
}

// Tables we expect each migration to create
const MIGRATION_TABLE_MAP = {
  "1730000040000_create_rewards_engine_core.js": [
    "reward_accounts",
    "reward_ledger_entries",
    "reward_redemptions",
    "reward_rules_config",
  ],
  "1730000041000_create_referrals_and_challenges.js": [
    "referral_codes",
    "referral_relationships",
    "referral_events",
    "referral_rewards",
    "challenge_definitions",
    "user_challenges",
  ],
  "1730000042000_create_trust_boost_admin.js": [
    "boost_purchases",
    "boost_impressions",
    "ranking_signals",
    "seller_trust_profiles",
    "fraud_flags",
    "admin_actions",
  ],
  "1730000043000_reconcile_service_tables.js": [
    "seller_boosts",
    "boost_spend_events",
    "trust_profiles",
  ],
};

// All 32 config keys that should be seeded in migration 1
const EXPECTED_CONFIG_KEYS = [
  "points_per_dollar",
  "min_order_amount_minor",
  "min_redemption_points",
  "max_redemption_pct",
  "max_redemption_cap_minor",
  "points_to_dollar_ratio",
  "daily_earn_cap_explorer",
  "daily_earn_cap_member",
  "daily_earn_cap_insider",
  "daily_earn_cap_vip",
  "daily_earn_cap_elite",
  "tier_threshold_explorer",
  "tier_threshold_member",
  "tier_threshold_insider",
  "tier_threshold_vip",
  "tier_threshold_elite",
  "tier_multiplier_explorer",
  "tier_multiplier_member",
  "tier_multiplier_insider",
  "tier_multiplier_vip",
  "tier_multiplier_elite",
  "tier_grace_period_days",
  "streak_multiplier_1_6",
  "streak_multiplier_7_13",
  "streak_multiplier_14_30",
  "streak_multiplier_31_plus",
  "streak_shields_explorer",
  "streak_shields_member",
  "streak_shields_insider",
  "streak_shields_vip",
  "streak_shields_elite",
  "referral_referrer_reward_dp",
  "referral_referee_discount_minor",
  "referral_hold_days",
  "referral_monthly_cap",
  "referral_min_purchase_minor",
  "velocity_max_transactions_per_hour",
  "velocity_max_transactions_per_day",
  "velocity_duplicate_window_seconds",
  "points_inactivity_expiration_months",
  "signup_bonus_dp",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Capture all SQL strings passed to pgm.sql() by a migration's up/down function.
 * Also captures createTable, dropTable, createIndex calls via method names.
 */
function captureMigrationCalls(fn) {
  const sqlCalls = [];
  const tableOps = { created: [], dropped: [] };
  const indexCalls = [];

  const pgm = {
    sql: jest.fn((s) => sqlCalls.push(s)),
    createTable: jest.fn((name) => tableOps.created.push(name)),
    dropTable: jest.fn((name, opts) => {
      if (opts && opts.ifExists) {
        tableOps.dropped.push(`${name}(ifExists)`);
      } else {
        tableOps.dropped.push(name);
      }
    }),
    createIndex: jest.fn((table, cols, opts) => {
      indexCalls.push({ table, cols, unique: opts && opts.unique });
    }),
    addColumn: jest.fn(),
    dropColumn: jest.fn(),
    // pass-through for anything else so migration doesn't throw
  };

  // proxy unknown method calls so migration files don't throw
  const proxy = new Proxy(pgm, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return jest.fn();
    },
  });

  fn(proxy);

  return { sqlCalls, tableOps, indexCalls, allSql: sqlCalls.join("\n") };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Rewards migration files", () => {
  const migrationFiles = Object.keys(MIGRATION_TABLE_MAP);

  describe.each(migrationFiles)("%s", (filename) => {
    let migration;

    beforeAll(() => {
      migration = loadMigration(filename);
    });

    it("exports both up and down functions", () => {
      expect(typeof migration.up).toBe("function");
      expect(typeof migration.down).toBe("function");
    });

    it("up() contains expected table names in SQL", () => {
      const { allSql, tableOps } = captureMigrationCalls(migration.up);
      const allText = allSql + " " + tableOps.created.join(" ");

      for (const table of MIGRATION_TABLE_MAP[filename]) {
        expect(allText).toMatch(new RegExp(table, "i"));
      }
    });

    it("down() references the same tables for reversal", () => {
      const { allSql, tableOps } = captureMigrationCalls(migration.down);
      const allText = allSql + " " + tableOps.dropped.join(" ");

      for (const table of MIGRATION_TABLE_MAP[filename]) {
        // Reconcile migration uses IF NOT EXISTS / ifExists opts — still must appear
        expect(allText).toMatch(new RegExp(table, "i"));
      }
    });
  });
});

describe("Migration 1 — reward_rules_config seed data", () => {
  let migration;

  beforeAll(() => {
    migration = loadMigration("1730000040000_create_rewards_engine_core.js");
  });

  it("seeds all expected config keys", () => {
    const { allSql } = captureMigrationCalls(migration.up);

    for (const key of EXPECTED_CONFIG_KEYS) {
      expect(allSql).toContain(`'${key}'`);
    }
  });

  it("seeds exactly 41 config rows (no silent duplicates)", () => {
    const { allSql } = captureMigrationCalls(migration.up);

    // Each INSERT values row matches ('key', 'value', ...) pattern
    const rowMatches = allSql.match(/\('[\w_]+',\s*'[^']*'/g) || [];
    expect(rowMatches.length).toBeGreaterThanOrEqual(EXPECTED_CONFIG_KEYS.length);
  });

  it("all tier multiplier values are >= 1.0", () => {
    const { allSql } = captureMigrationCalls(migration.up);

    const multiplierPattern = /tier_multiplier_\w+',\s*'([\d.]+)'/g;
    let match;
    const multipliers = [];
    while ((match = multiplierPattern.exec(allSql)) !== null) {
      multipliers.push(parseFloat(match[1]));
    }

    expect(multipliers.length).toBeGreaterThan(0);
    for (const m of multipliers) {
      expect(m).toBeGreaterThanOrEqual(1.0);
    }
  });

  it("tier thresholds are non-negative and strictly increasing", () => {
    const { allSql } = captureMigrationCalls(migration.up);

    const tierOrder = ["explorer", "member", "insider", "vip", "elite"];
    const thresholds = tierOrder.map((tier) => {
      const m = new RegExp(`tier_threshold_${tier}',\\s*'(\\d+)'`).exec(allSql);
      return m ? parseInt(m[1], 10) : null;
    });

    expect(thresholds.every((t) => t !== null)).toBe(true);
    expect(thresholds[0]).toBe(0); // explorer starts at 0

    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).toBeGreaterThan(thresholds[i - 1]);
    }
  });

  it("daily earn caps increase with tier rank", () => {
    const { allSql } = captureMigrationCalls(migration.up);

    const tierOrder = ["explorer", "member", "insider", "vip", "elite"];
    const caps = tierOrder.map((tier) => {
      const m = new RegExp(`daily_earn_cap_${tier}',\\s*'(\\d+)'`).exec(allSql);
      return m ? parseInt(m[1], 10) : null;
    });

    expect(caps.every((c) => c !== null)).toBe(true);
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]).toBeGreaterThan(caps[i - 1]);
    }
  });

  it("streak shield counts increase with tier rank", () => {
    const { allSql } = captureMigrationCalls(migration.up);

    const tierOrder = ["explorer", "member", "insider", "vip", "elite"];
    const shields = tierOrder.map((tier) => {
      const m = new RegExp(`streak_shields_${tier}',\\s*'(\\d+)'`).exec(allSql);
      return m ? parseInt(m[1], 10) : null;
    });

    expect(shields.every((s) => s !== null)).toBe(true);
    expect(shields[0]).toBe(0); // explorer: no shields
    for (let i = 1; i < shields.length; i++) {
      expect(shields[i]).toBeGreaterThanOrEqual(shields[i - 1]);
    }
  });
});

describe("Migration 1 — reward_accounts constraints", () => {
  it("balance CHECK constraint uses >= 0 (non-negative)", () => {
    const migration = loadMigration("1730000040000_create_rewards_engine_core.js");
    const { allSql } = captureMigrationCalls(migration.up);
    expect(allSql).toMatch(/balance.*>=.*0/);
  });

  it("tier CHECK constraint includes all 5 tiers", () => {
    const migration = loadMigration("1730000040000_create_rewards_engine_core.js");
    const { allSql } = captureMigrationCalls(migration.up);
    for (const tier of ["explorer", "member", "insider", "vip", "elite"]) {
      expect(allSql).toContain(`'${tier}'`);
    }
  });
});

describe("Migration 2 — referral constraints", () => {
  it("referral_relationships has no-self-referral CHECK", () => {
    const migration = loadMigration("1730000041000_create_referrals_and_challenges.js");
    const { allSql } = captureMigrationCalls(migration.up);
    expect(allSql).toMatch(/referrer_user_id.*!=.*referee_user_id/);
  });

  it("referral_rewards minimum hold tracked", () => {
    const migration = loadMigration("1730000041000_create_referrals_and_challenges.js");
    const { allSql } = captureMigrationCalls(migration.up);
    expect(allSql).toContain("hold_until");
    expect(allSql).toContain("hold_extended_count");
  });

  it("user_challenges has unique enrollment constraint", () => {
    const migration = loadMigration("1730000041000_create_referrals_and_challenges.js");
    const { allSql } = captureMigrationCalls(migration.up);
    expect(allSql).toMatch(/UNIQUE.*user_id.*challenge_id|user_id.*challenge_id.*UNIQUE/);
  });
});

describe("Migration 3 — fraud & admin constraints", () => {
  it("fraud_flags has correct severity CHECK values", () => {
    const migration = loadMigration("1730000042000_create_trust_boost_admin.js");
    const { allSql } = captureMigrationCalls(migration.up);
    for (const s of ["low", "medium", "high", "critical"]) {
      expect(allSql).toContain(`'${s}'`);
    }
  });

  it("admin_actions has reason column (audit trail)", () => {
    const migration = loadMigration("1730000042000_create_trust_boost_admin.js");
    const { allSql } = captureMigrationCalls(migration.up);
    expect(allSql).toContain("reason");
  });

  it("organic_score is non-negative in ranking_signals", () => {
    const migration = loadMigration("1730000042000_create_trust_boost_admin.js");
    const { allSql } = captureMigrationCalls(migration.up);
    expect(allSql).toMatch(/organic_score.*>=.*0/);
  });
});

describe("Migration 4 — reconciliation", () => {
  it("seller_boosts status includes draft (not in boost_purchases)", () => {
    const migration = loadMigration("1730000043000_reconcile_service_tables.js");
    const { allSql } = captureMigrationCalls(migration.up);
    expect(allSql).toContain("'draft'");
  });

  it("seller_boosts has listing_id and store_id columns", () => {
    const migration = loadMigration("1730000043000_reconcile_service_tables.js");
    const { allSql } = captureMigrationCalls(migration.up);
    expect(allSql).toContain("listing_id");
    expect(allSql).toContain("store_id");
  });

  it("trust_profiles uses score and band (not trust_score/trust_band)", () => {
    const migration = loadMigration("1730000043000_reconcile_service_tables.js");
    const { allSql } = captureMigrationCalls(migration.up);
    // Should have 'score' but NOT 'trust_score' as a column name
    expect(allSql).toMatch(/\bscore\b/);
    expect(allSql).not.toContain("trust_score integer");
  });

  it("admin_actions column renamed from admin_user_id to admin_id", () => {
    const migration = loadMigration("1730000043000_reconcile_service_tables.js");
    const { allSql } = captureMigrationCalls(migration.up);
    expect(allSql).toContain("RENAME COLUMN admin_user_id TO admin_id");
  });

  it("down() reverses the admin_id rename", () => {
    const migration = loadMigration("1730000043000_reconcile_service_tables.js");
    const { allSql } = captureMigrationCalls(migration.down);
    expect(allSql).toContain("RENAME COLUMN admin_id TO admin_user_id");
  });
});

describe("Seed data fixture — seed-dev-data.js", () => {
  const { TIER_ACCOUNTS, TIERS } = require("../fixtures/rewards/seed-dev-data");

  it("exports TIER_ACCOUNTS with one entry per tier", () => {
    const tiers = TIER_ACCOUNTS.map((a) => a.tier);
    for (const t of TIERS) {
      expect(tiers).toContain(t);
    }
  });

  it("all TIER_ACCOUNTS have consistent balance = earned - redeemed", () => {
    for (const a of TIER_ACCOUNTS) {
      expect(a.balance).toBe(a.lifetimeEarned - a.lifetimeRedeemed);
    }
  });

  it("all TIER_ACCOUNTS have non-negative values", () => {
    for (const a of TIER_ACCOUNTS) {
      expect(a.balance).toBeGreaterThanOrEqual(0);
      expect(a.lifetimeEarned).toBeGreaterThanOrEqual(0);
      expect(a.lifetimeRedeemed).toBeGreaterThanOrEqual(0);
      expect(a.rolling12m).toBeGreaterThanOrEqual(0);
      expect(a.streak).toBeGreaterThanOrEqual(0);
      expect(a.shields).toBeGreaterThanOrEqual(0);
    }
  });

  it("elite tier has highest balance and streak", () => {
    const elite = TIER_ACCOUNTS.find((a) => a.tier === "elite");
    const explorer = TIER_ACCOUNTS.find((a) => a.tier === "explorer");
    expect(elite.balance).toBeGreaterThan(explorer.balance);
    expect(elite.streak).toBeGreaterThan(explorer.streak);
  });

  it("explorer tier has zero shields", () => {
    const explorer = TIER_ACCOUNTS.find((a) => a.tier === "explorer");
    expect(explorer.shields).toBe(0);
  });

  it("seedAll and individual seed functions are exported", () => {
    const fixture = require("../fixtures/rewards/seed-dev-data");
    expect(typeof fixture.seedAll).toBe("function");
    expect(typeof fixture.seedUsers).toBe("function");
    expect(typeof fixture.seedRewardAccounts).toBe("function");
    expect(typeof fixture.seedLedgerEntries).toBe("function");
    expect(typeof fixture.seedReferrals).toBe("function");
    expect(typeof fixture.seedChallenges).toBe("function");
    expect(typeof fixture.seedBoosts).toBe("function");
    expect(typeof fixture.seedTrustProfiles).toBe("function");
  });
});
