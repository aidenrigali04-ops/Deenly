/**
 * Seed Data Factories for Rewards & Growth Engine
 *
 * Usage:
 *   const { seedAll, seedUsers, seedRewardAccounts, ... } = require('./seed-dev-data');
 *   await seedAll(db);              // seeds everything
 *   await seedRewardAccounts(db);   // seeds just accounts (requires users)
 *
 * IMPORTANT: These functions require that a `users` table already exists
 * with at least 10 rows (ids 1..10). The existing Deenly dev seed handles
 * that. If running in isolation, call seedUsers() first.
 *
 * All point amounts are integers. Balances are consistent with ledger sums.
 */

const { randomUUID } = require("node:crypto");

// ─── Constants ──────────────────────────────────────────────────────────

const TIERS = ["explorer", "member", "insider", "vip", "elite"];

const TIER_ACCOUNTS = [
  { userId: 1, tier: "explorer", balance: 120,   lifetimeEarned: 150,   lifetimeRedeemed: 30,  rolling12m: 150,   streak: 0,  shields: 0, multiplier: 1.00 },
  { userId: 2, tier: "member",   balance: 1800,  lifetimeEarned: 2200,  lifetimeRedeemed: 400, rolling12m: 1200,  streak: 3,  shields: 1, multiplier: 1.00 },
  { userId: 3, tier: "insider",  balance: 5200,  lifetimeEarned: 7500,  lifetimeRedeemed: 2300,rolling12m: 5500,  streak: 14, shields: 2, multiplier: 2.00 },
  { userId: 4, tier: "vip",      balance: 12000, lifetimeEarned: 18000, lifetimeRedeemed: 6000,rolling12m: 16000, streak: 30, shields: 3, multiplier: 2.00 },
  { userId: 5, tier: "elite",    balance: 45000, lifetimeEarned: 80000, lifetimeRedeemed: 35000,rolling12m: 52000,streak: 60, shields: 5, multiplier: 3.00 },
];

// ─── Helpers ────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── Seed Functions ─────────────────────────────────────────────────────

/**
 * Seed minimal users if the table is empty.
 * Uses ON CONFLICT to be idempotent.
 */
async function seedUsers(db) {
  const names = [
    "fatima", "omar", "aisha", "yusuf", "khadija",
    "ibrahim", "maryam", "adam", "hana", "zayd",
  ];
  for (let i = 0; i < names.length; i++) {
    await db.query(
      `INSERT INTO users (id, username, email, password_hash, created_at)
       VALUES ($1, $2, $3, '$argon2id$v=19$m=65536,t=3,p=4$seedhash', current_timestamp)
       ON CONFLICT (id) DO NOTHING`,
      [i + 1, names[i], `${names[i]}@test.deenly.com`]
    );
  }
  // Reset sequence so next insert gets id > 10
  await db.query("SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT MAX(id) FROM users), 10))");
}

/**
 * Seed reward_accounts for 5 users across all tiers.
 */
async function seedRewardAccounts(db) {
  for (const a of TIER_ACCOUNTS) {
    const checkinDate = a.streak > 0 ? yesterday() : null;
    await db.query(
      `INSERT INTO reward_accounts
         (user_id, balance, lifetime_earned, lifetime_redeemed,
          tier, rolling_12m_points, streak_current, streak_longest,
          streak_shields_remaining, streak_multiplier, streak_last_checkin_date,
          last_activity_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, current_timestamp)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        a.userId, a.balance, a.lifetimeEarned, a.lifetimeRedeemed,
        a.tier, a.rolling12m, a.streak, a.shields, a.multiplier, checkinDate,
      ]
    );
  }
}

/**
 * Seed ledger entries — 10 per account user, balanced with account.balance.
 * Creates credits and debits so that SUM(credits) - SUM(debits) = account.balance.
 */
async function seedLedgerEntries(db) {
  const creditSources = ["purchase", "streak_bonus", "challenge_reward", "referral_earned", "signup_bonus"];
  const debitSources = ["redemption", "expiration"];

  for (const a of TIER_ACCOUNTS) {
    // Distribute: 8 credits summing to lifetimeEarned, 2 debits summing to lifetimeRedeemed
    const creditTotal = a.lifetimeEarned;
    const debitTotal = a.lifetimeRedeemed;

    let balance = 0;
    const numCredits = 8;
    const numDebits = 2;

    // Credits
    for (let i = 0; i < numCredits; i++) {
      const isLast = i === numCredits - 1;
      const allocated = isLast
        ? creditTotal - Math.floor(creditTotal / numCredits) * (numCredits - 1)
        : Math.floor(creditTotal / numCredits);
      balance += allocated;

      await db.query(
        `INSERT INTO reward_ledger_entries
           (user_id, type, amount, balance_after, source, tier_at_time,
            multiplier_applied, description, created_at)
         VALUES ($1, 'credit', $2, $3, $4, $5, 1.00, $6, $7)`,
        [
          a.userId,
          allocated,
          balance,
          creditSources[i % creditSources.length],
          a.tier,
          `Seed credit ${i + 1}`,
          daysAgo(numCredits + numDebits - i),
        ]
      );
    }

    // Debits
    for (let i = 0; i < numDebits; i++) {
      const isLast = i === numDebits - 1;
      const allocated = isLast
        ? debitTotal - Math.floor(debitTotal / numDebits) * (numDebits - 1)
        : Math.floor(debitTotal / numDebits);
      balance -= allocated;

      await db.query(
        `INSERT INTO reward_ledger_entries
           (user_id, type, amount, balance_after, source, tier_at_time,
            description, created_at)
         VALUES ($1, 'debit', $2, $3, $4, $5, $6, $7)`,
        [
          a.userId,
          allocated,
          balance,
          debitSources[i % debitSources.length],
          a.tier,
          `Seed debit ${i + 1}`,
          daysAgo(numDebits - i),
        ]
      );
    }
  }
}

/**
 * Seed referral codes + relationships.
 * User 5 (elite) referred User 2 (member) — qualified, rewards held.
 * User 3 (insider) referred User 6 — pending (signup, no purchase yet).
 */
async function seedReferrals(db) {
  // Referral codes
  const code1Id = randomUUID();
  const code2Id = randomUUID();

  await db.query(
    `INSERT INTO referral_codes (id, user_id, code, is_active, total_uses)
     VALUES ($1, 5, 'ELITE5A', true, 1),
            ($2, 3, 'INSDR3B', true, 1)`,
    [code1Id, code2Id]
  );

  // Relationship 1: qualified (user 5 → user 2)
  const ref1Id = randomUUID();
  const holdUntil = new Date();
  holdUntil.setDate(holdUntil.getDate() + 14);

  await db.query(
    `INSERT INTO referral_relationships
       (id, referrer_user_id, referee_user_id, referral_code_id, status, qualified_at)
     VALUES ($1, 5, 2, $2, 'qualified', current_timestamp - interval '2 days')`,
    [ref1Id, code1Id]
  );

  await db.query(
    `INSERT INTO referral_rewards
       (referral_id, beneficiary_user_id, reward_type, amount, currency, hold_until, status)
     VALUES ($1, 5, 'referrer_points', 250, 'dp', $2, 'held'),
            ($1, 2, 'referee_discount', 500, 'usd', $2, 'held')`,
    [ref1Id, holdUntil]
  );

  await db.query(
    `INSERT INTO referral_events (referral_id, event_type) VALUES
       ($1, 'code_used'), ($1, 'signup_completed'), ($1, 'first_purchase'),
       ($1, 'qualified'), ($1, 'hold_started')`,
    [ref1Id]
  );

  // Relationship 2: pending (user 3 → user 6)
  const ref2Id = randomUUID();
  await db.query(
    `INSERT INTO referral_relationships
       (id, referrer_user_id, referee_user_id, referral_code_id, status)
     VALUES ($1, 3, 6, $2, 'pending')`,
    [ref2Id, code2Id]
  );

  await db.query(
    `INSERT INTO referral_events (referral_id, event_type) VALUES
       ($1, 'code_used'), ($1, 'signup_completed')`,
    [ref2Id]
  );
}

/**
 * Seed challenge definitions and enrollments.
 * 3 challenges: daily, weekly, merchant
 */
async function seedChallenges(db) {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const monthFromNow = new Date(now.getTime() + 30 * 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  // Daily challenge (active)
  const ch1Id = randomUUID();
  await db.query(
    `INSERT INTO challenge_definitions
       (id, title, description, challenge_type, category, criteria,
        reward_points, starts_at, ends_at, is_active)
     VALUES ($1, 'Daily Check-in', 'Check in every day this week', 'daily', 'streak',
             '{"action": "streak_checkin", "count": 7}'::jsonb,
             100, $2, $3, true)`,
    [ch1Id, weekAgo, weekFromNow]
  );

  // Weekly challenge (active)
  const ch2Id = randomUUID();
  await db.query(
    `INSERT INTO challenge_definitions
       (id, title, description, challenge_type, category, criteria,
        reward_points, starts_at, ends_at, is_active)
     VALUES ($1, 'Buy 3 Items', 'Purchase 3 items this week', 'weekly', 'purchase',
             '{"action": "purchase", "count": 3}'::jsonb,
             200, $2, $3, true)`,
    [ch2Id, weekAgo, weekFromNow]
  );

  // Merchant challenge (active)
  const ch3Id = randomUUID();
  await db.query(
    `INSERT INTO challenge_definitions
       (id, title, description, challenge_type, category, criteria,
        reward_points, starts_at, ends_at, is_active, merchant_user_id)
     VALUES ($1, 'Shop at Khadija Store', 'Buy from Khadija 2 times', 'merchant', 'merchant',
             '{"action": "purchase", "count": 2, "merchant_user_id": 5}'::jsonb,
             300, $2, $3, true, 5)`,
    [ch3Id, weekAgo, monthFromNow]
  );

  // Enroll user 2 in ch1 (progress 3/7) and ch2 (progress 1/3)
  await db.query(
    `INSERT INTO user_challenges (user_id, challenge_id, progress, target, status, expires_at)
     VALUES (2, $1, 3, 7, 'active', $3),
            (2, $2, 1, 3, 'active', $3)`,
    [ch1Id, ch2Id, weekFromNow]
  );

  // Enroll user 3 in ch2 (completed)
  await db.query(
    `INSERT INTO user_challenges
       (user_id, challenge_id, progress, target, status, completed_at, expires_at)
     VALUES (3, $1, 3, 3, 'completed', current_timestamp - interval '1 day', $2)`,
    [ch2Id, weekFromNow]
  );
}

/**
 * Seed seller boosts: 1 active standard, 1 draft premium.
 */
async function seedBoosts(db) {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600000);

  // Active standard boost for user 4 (seller)
  await db.query(
    `INSERT INTO seller_boosts
       (seller_id, listing_id, type, status, budget_minor, spent_minor,
        multiplier, duration_hours, starts_at, ends_at)
     VALUES (4, 'listing-001', 'standard', 'active', 1000, 350,
             1.50, 24, $1, $2)`,
    [now, in24h]
  );

  // Draft premium boost for user 5 (seller)
  await db.query(
    `INSERT INTO seller_boosts
       (seller_id, listing_id, type, status, budget_minor, spent_minor,
        multiplier, duration_hours)
     VALUES (5, 'listing-002', 'premium', 'draft', 3000, 0, 2.00, 48)`
  );
}

/**
 * Seed trust profiles for users 1-5.
 */
async function seedTrustProfiles(db) {
  const profiles = [
    { userId: 1, score: 500, band: "good", identity: 150, behavioral: 125, transaction: 100, social: 75, device: 50, penalty: 1.00 },
    { userId: 2, score: 650, band: "good", identity: 200, behavioral: 160, transaction: 130, social: 100, device: 60, penalty: 1.00 },
    { userId: 3, score: 800, band: "excellent", identity: 250, behavioral: 200, transaction: 170, social: 120, device: 60, penalty: 1.00 },
    { userId: 4, score: 350, band: "poor", identity: 100, behavioral: 80, transaction: 70, social: 60, device: 40, penalty: 0.70 },
    { userId: 5, score: 900, band: "excellent", identity: 280, behavioral: 230, transaction: 190, social: 130, device: 70, penalty: 1.00 },
  ];
  for (const p of profiles) {
    await db.query(
      `INSERT INTO trust_profiles
         (user_id, score, band, identity_score, behavioral_score,
          transaction_score, social_score, device_score, penalty_multiplier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO NOTHING`,
      [p.userId, p.score, p.band, p.identity, p.behavioral, p.transaction, p.social, p.device, p.penalty]
    );
  }
}

/**
 * Seed everything in dependency order.
 */
async function seedAll(db) {
  await seedUsers(db);
  await seedRewardAccounts(db);
  await seedLedgerEntries(db);
  await seedReferrals(db);
  await seedChallenges(db);
  await seedBoosts(db);
  await seedTrustProfiles(db);
}

module.exports = {
  seedAll,
  seedUsers,
  seedRewardAccounts,
  seedLedgerEntries,
  seedReferrals,
  seedChallenges,
  seedBoosts,
  seedTrustProfiles,
  // Exported for test assertions
  TIER_ACCOUNTS,
  TIERS,
};
