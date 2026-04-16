# Deenly Rewards & Growth Engine — File-by-File Implementation Plan

> Version 1.0 — April 2026
> Status: Ready for Development
> Target: Cursor AI-assisted implementation
> Prerequisites: Architecture doc, schema doc, API contracts doc (all in `/docs/`)

---

## How to Use This Document

This plan lists **every file** to create, in dependency order. Each file entry includes its purpose, the exact functions to implement, the service interfaces it depends on, and the test file that covers it.

**Rules for the implementor:**
1. Create files in the order listed — dependencies are satisfied top-to-bottom
2. Backend uses **JavaScript with JSDoc types** (not TypeScript) — the existing codebase is JS
3. Mobile uses **TypeScript** — follow existing `.tsx` conventions
4. Every service is a factory function: `createXxxService({ db, config, ... })` → returns object of methods
5. No direct SQL outside repository/service files — route handlers call service methods only
6. Every business rule number comes from `reward_rules_config` table — never hardcode
7. Run `npm test` after completing each section before moving to the next

**Notation:**
- `→ depends on` means the file imports from or requires that file to exist first
- `analytics:` lists the events that must be emitted inside each function
- All functions are `async` unless noted otherwise

---

## Table of Contents

1. [Shared Constants and Validators](#1-shared-constants-and-validators)
2. [Database Migrations](#2-database-migrations)
3. [Reward Config Service](#3-reward-config-service)
4. [Rewards Ledger Service](#4-rewards-ledger-service)
5. [Rewards Rules Engine](#5-rewards-rules-engine)
6. [Tier Service](#6-tier-service)
7. [Streak Service](#7-streak-service)
8. [Challenge Service](#8-challenge-service)
9. [Referral Service](#9-referral-service)
10. [Trust & Fraud Service](#10-trust--fraud-service)
11. [Boost Service](#11-boost-service)
12. [Ranking Service](#12-ranking-service)
13. [Checkout Integration](#13-checkout-integration)
14. [Notification Hooks](#14-notification-hooks)
15. [Admin Service](#15-admin-service)
16. [Buyer API Routes](#16-buyer-api-routes)
17. [Seller API Routes](#17-seller-api-routes)
18. [Cron Jobs](#18-cron-jobs)
19. [App.js Integration](#19-appjs-integration)
20. [Mobile Types & API Client](#20-mobile-types--api-client)
21. [Config & Environment](#21-config--environment)
22. [Dependency Graph](#22-dependency-graph)

---

## 1. Shared Constants and Validators

These files have zero internal dependencies and are imported by everything else.

---

### File: `backend/src/modules/rewards/constants.js`
**Purpose:** Enum-like constants for reward tiers, ledger sources, referral statuses, and all domain enumerations. Single source of truth for allowed values — matches the CHECK constraints in migration files.
**Depends on:** Nothing
**Key exports:**

```js
/**
 * All constants are frozen arrays for use in validation and CHECK constraints.
 * These MUST match the values in the database CHECK constraints exactly.
 */

const TIERS = ['explorer', 'member', 'insider', 'vip', 'elite'];

const TIER_ORDER = { explorer: 0, member: 1, insider: 2, vip: 3, elite: 4 };

const LEDGER_TYPES = ['credit', 'debit'];

const LEDGER_CREDIT_SOURCES = [
  'purchase', 'referral_earned', 'referral_bonus', 'streak_bonus',
  'challenge_reward', 'tier_bonus', 'manual_credit', 'signup_bonus', 'review'
];

const LEDGER_DEBIT_SOURCES = [
  'redemption', 'expiration', 'manual_debit', 'fraud_void', 'refund_clawback'
];

const LEDGER_SOURCES = [...LEDGER_CREDIT_SOURCES, ...LEDGER_DEBIT_SOURCES];

const REFERRAL_STATUSES = ['pending', 'qualified', 'rewarded', 'rejected', 'expired'];

const REFERRAL_REWARD_TYPES = ['referrer_points', 'referee_discount'];

const REFERRAL_REWARD_STATUSES = ['held', 'released', 'forfeited'];

const REFERRAL_EVENT_TYPES = [
  'code_used', 'signup_completed', 'first_purchase', 'qualified',
  'hold_started', 'hold_extended', 'reward_released', 'reward_forfeited',
  'fraud_flagged', 'fraud_cleared', 'rejected'
];

const CHALLENGE_TYPES = ['daily', 'weekly', 'monthly', 'merchant', 'special'];

const CHALLENGE_CATEGORIES = ['general', 'purchase', 'social', 'streak', 'exploration', 'merchant'];

const CHALLENGE_STATUSES = ['active', 'completed', 'claimed', 'expired', 'abandoned'];

const BOOST_TYPES = ['standard', 'premium', 'featured'];

const BOOST_STATUSES = ['active', 'paused', 'exhausted', 'cancelled', 'expired'];

const TRUST_BANDS = ['critical', 'low', 'new', 'good', 'excellent'];

const FRAUD_FLAG_TYPES = [
  'velocity_breach', 'daily_cap_breach', 'duplicate_transaction',
  'self_referral', 'device_overlap', 'ip_overlap',
  'referral_farming', 'refund_abuse', 'account_sharing',
  'suspicious_pattern', 'manual_flag', 'trust_score_drop'
];

const FRAUD_SEVERITIES = ['low', 'medium', 'high', 'critical'];

const FRAUD_FLAG_STATUSES = [
  'open', 'investigating', 'resolved_legitimate',
  'resolved_fraud', 'auto_resolved', 'expired'
];

const ADMIN_ACTION_TYPES = [
  'manual_credit', 'manual_debit', 'freeze_account', 'unfreeze_account',
  'void_points', 'tier_override', 'streak_reset', 'streak_shield_grant',
  'referral_approve', 'referral_reject', 'referral_hold_extend',
  'challenge_create', 'challenge_cancel', 'challenge_modify',
  'boost_pause', 'boost_cancel', 'boost_refund',
  'fraud_flag_resolve', 'fraud_flag_create', 'trust_score_override',
  'config_update', 'bulk_action', 'account_ban', 'account_unban'
];

const SHARE_CHANNELS = [
  'whatsapp', 'sms', 'email', 'instagram', 'twitter', 'facebook', 'copy_link', 'other'
];

// Boost type → multiplier mapping
const BOOST_MULTIPLIERS = { standard: 1.50, premium: 2.00, featured: 3.00 };
const BOOST_MIN_BUDGETS = { standard: 500, premium: 1500, featured: 5000 };
```

**Tests:** `backend/src/modules/rewards/constants.test.js`
- Verify all arrays are frozen
- Verify TIERS has exactly 5 entries in order
- Verify LEDGER_SOURCES is union of credit + debit sources
- Verify BOOST_MULTIPLIERS keys match BOOST_TYPES

---

### File: `backend/src/modules/rewards/validators.js`
**Purpose:** Domain-specific input validation functions for reward endpoints. Extends the existing `utils/validators.js` pattern with reward-specific checks.
**Depends on:** `→ rewards/constants.js`, `→ utils/http-error.js`
**Key functions:**

```js
/**
 * @param {number} amount
 * @param {string} field
 * @returns {number} validated positive integer
 */
function requirePositiveInt(amount, field)

/**
 * @param {string} value
 * @param {string[]} allowed
 * @param {string} field
 * @returns {string} validated enum value
 */
function requireEnum(value, allowed, field)

/**
 * @param {string|undefined} cursor
 * @returns {{ createdAt: string, id: string } | null} decoded cursor or null
 */
function decodeCursor(cursor)

/**
 * @param {{ createdAt: string, id: string }} obj
 * @returns {string} base64url encoded cursor
 */
function encodeCursor(obj)

/**
 * @param {*} query - req.query object
 * @returns {{ limit: number, cursor: object|null }} validated pagination
 */
function parsePagination(query, maxLimit = 100, defaultLimit = 20)

/**
 * @param {*} query - req.query object
 * @returns {{ limit: number, offset: number }} validated offset pagination
 */
function parseOffsetPagination(query, maxLimit = 200, defaultLimit = 50)

/**
 * @param {string|undefined} dateStr
 * @param {string} field
 * @returns {Date|null} parsed date or null
 */
function optionalDate(dateStr, field)
```

**Tests:** `backend/src/modules/rewards/validators.test.js`
- Test cursor encode/decode roundtrip
- Test invalid cursor throws 400
- Test requirePositiveInt rejects 0, -1, floats, strings
- Test requireEnum rejects values not in allowed list
- Test parsePagination clamps limit to maxLimit

---

## 2. Database Migrations

Already created. Verify they run cleanly.

---

### File: `backend/migrations/1730000040000_create_rewards_engine_core.js`
**Purpose:** Creates `reward_accounts`, `reward_ledger_entries`, `reward_redemptions`, `reward_rules_config` (with 42 seeded config rows)
**Status:** ✅ Already created
**Verification step:** Run `npm run migrate:up` then `npm run migrate:down` then `npm run migrate:up` — confirm clean cycle

---

### File: `backend/migrations/1730000041000_create_referrals_and_challenges.js`
**Purpose:** Creates `referral_codes`, `referral_relationships`, `referral_events`, `referral_rewards`, `challenge_definitions`, `user_challenges`
**Status:** ✅ Already created

---

### File: `backend/migrations/1730000042000_create_trust_boost_admin.js`
**Purpose:** Creates `boost_purchases`, `boost_impressions`, `ranking_signals`, `seller_trust_profiles`, `fraud_flags`, `admin_actions`
**Status:** ✅ Already created

---

## 3. Reward Config Service

The config service is the **foundation of the entire engine** — every other service reads business rules from it. Build and test it first.

---

### File: `backend/src/services/reward-config.js`
**Purpose:** Reads and caches `reward_rules_config` key-value pairs. Provides typed accessor methods for each business rule. Cache TTL of 60 seconds — hot config changes take effect within 1 minute without restart.
**Depends on:** `→ db`
**Key functions:**

```js
/**
 * @param {{ db: object, logger?: object }} deps
 * @returns {RewardConfigService}
 */
function createRewardConfigService({ db, logger })

  /**
   * Get a raw config value by key. Returns parsed JSON value.
   * @param {string} key - e.g. 'points_per_dollar'
   * @returns {Promise<any>} The parsed value, or null if not found
   */
  async function get(key)

  /**
   * Get a numeric config value. Throws if not a number.
   * @param {string} key
   * @returns {Promise<number>}
   */
  async function getNumber(key)

  /**
   * Get the daily earn cap for a specific tier.
   * @param {string} tier - 'explorer' | 'member' | 'insider' | 'vip' | 'elite'
   * @returns {Promise<number>} e.g. 500 for explorer
   */
  async function getDailyEarnCap(tier)

  /**
   * Get the tier multiplier for a specific tier.
   * @param {string} tier
   * @returns {Promise<number>} e.g. 1.25 for member
   */
  async function getTierMultiplier(tier)

  /**
   * Get the tier threshold for a specific tier.
   * @param {string} tier
   * @returns {Promise<number>} e.g. 5000 for insider
   */
  async function getTierThreshold(tier)

  /**
   * Get the streak multiplier for a given streak day count.
   * @param {number} streakDays
   * @returns {Promise<number>} e.g. 2.0 for day 14
   */
  async function getStreakMultiplier(streakDays)

  /**
   * Get shield count for a tier.
   * @param {string} tier
   * @returns {Promise<number>} e.g. 2 for insider
   */
  async function getStreakShields(tier)

  /**
   * Batch-load all config values into cache. Called at startup.
   * @returns {Promise<void>}
   */
  async function preload()

  /**
   * Update a config value. Admin-only. Returns the updated row.
   * @param {string} key
   * @param {any} value
   * @param {number} updatedBy - admin user_id
   * @returns {Promise<object>} updated config row
   */
  async function update(key, value, updatedBy)

  /** Clear the in-memory cache. For testing. */
  function clearCache()
```

**Cache strategy:**
- In-memory `Map<string, { value, fetchedAt }>`
- TTL: 60 seconds (configurable)
- On `get()`: if cache entry exists and is < 60s old, return from cache; else query DB
- `preload()` fills entire cache at startup — called in `index.js`

**Analytics events:** None (config reads are passive)

**Tests:** `backend/src/services/reward-config.test.js`
- Test `getNumber()` returns correct value from seeded data
- Test cache TTL — second call within 60s hits cache, not DB
- Test `clearCache()` forces DB re-read
- Test `getDailyEarnCap('explorer')` returns 500
- Test `getTierMultiplier('elite')` returns 3.0
- Test `getStreakMultiplier(14)` returns 2.0
- Test `getStreakMultiplier(31)` returns 3.0
- Test `update()` changes value and clears cache for that key
- Test `get()` for non-existent key returns null

---

## 4. Rewards Ledger Service

The core of the entire system. All point mutations go through this service. No other file writes to `reward_ledger_entries` or modifies `reward_accounts.balance`.

---

### File: `backend/src/services/reward-ledger.js`
**Purpose:** Immutable append-only ledger for all reward point operations. Handles credit, debit, void, balance queries, and history retrieval. Enforces daily caps, velocity checks, and idempotency. Uses `SELECT ... FOR UPDATE` on `reward_accounts` to prevent race conditions.
**Depends on:** `→ services/reward-config.js`, `→ rewards/constants.js`, `→ db`
**Key functions:**

```js
/**
 * @param {{ db, config, rewardConfig: RewardConfigService, logger }} deps
 * @returns {RewardLedgerService}
 */
function createRewardLedgerService({ db, config, rewardConfig, logger })

  /**
   * Credit points to a user's account. Enforces daily cap, velocity, idempotency.
   *
   * @param {{
   *   userId: number,
   *   amount: number,          // Base points BEFORE multipliers
   *   source: string,          // From LEDGER_CREDIT_SOURCES
   *   sourceRefType?: string,  // 'order', 'referral', 'challenge', etc.
   *   sourceRefId?: string,    // ID of the source entity
   *   description?: string,
   *   tierAtTime?: string,
   *   multiplierApplied?: number,
   *   idempotencyKey?: string,
   *   metadata?: object,
   *   expiresAt?: Date,
   *   skipDailyCap?: boolean   // Only true for manual_credit (admin)
   * }} params
   * @returns {Promise<{
   *   ledgerEntryId: string,
   *   amount: number,         // Actual amount credited (may be capped)
   *   balanceAfter: number,
   *   wasCapped: boolean,
   *   capRemaining: number
   * }>}
   */
  async function creditPoints(params)

  /**
   * Debit points from a user's account. Checks balance sufficiency.
   *
   * @param {{
   *   userId: number,
   *   amount: number,
   *   source: string,          // From LEDGER_DEBIT_SOURCES
   *   sourceRefType?: string,
   *   sourceRefId?: string,
   *   description?: string,
   *   idempotencyKey?: string,
   *   metadata?: object
   * }} params
   * @returns {Promise<{
   *   ledgerEntryId: string,
   *   amount: number,
   *   balanceAfter: number
   * }>}
   * @throws {HttpError} 422 INSUFFICIENT_BALANCE
   */
  async function debitPoints(params)

  /**
   * Void a specific ledger entry (sets voided_at, creates offsetting entry).
   *
   * @param {{
   *   ledgerEntryId: string,
   *   reason: string,
   *   voidedBy?: number   // admin user_id if manual
   * }} params
   * @returns {Promise<{
   *   voidedEntryId: string,
   *   offsetEntryId: string,
   *   amount: number,
   *   balanceAfter: number
   * }>}
   */
  async function voidEntry(params)

  /**
   * Get the current balance and account state for a user.
   * Auto-creates reward_accounts row if none exists.
   *
   * @param {number} userId
   * @returns {Promise<RewardAccountState>}
   */
  async function getAccountState(userId)

  /**
   * Get paginated ledger history for a user.
   *
   * @param {{
   *   userId: number,
   *   limit?: number,
   *   cursor?: { createdAt: string, id: string },
   *   type?: 'credit' | 'debit',
   *   source?: string,
   *   from?: Date,
   *   to?: Date
   * }} params
   * @returns {Promise<{ items: LedgerEntry[], hasMore: boolean, nextCursor: string|null }>}
   */
  async function getHistory(params)

  /**
   * Get today's earn total for a user (for cap enforcement).
   * Handles date rollover.
   *
   * @param {number} userId
   * @returns {Promise<{ earnedToday: number, capToday: number, remaining: number }>}
   */
  async function getDailyEarnStatus(userId)

  /**
   * Check velocity limits: transactions per hour and per day.
   *
   * @param {number} userId
   * @returns {Promise<{ withinLimits: boolean, txnsLastHour: number, txnsToday: number }>}
   */
  async function checkVelocity(userId)

  /**
   * Ensure a reward_accounts row exists for a user. Creates with defaults if missing.
   *
   * @param {number} userId
   * @returns {Promise<object>} The account row
   */
  async function ensureAccount(userId)
```

**Critical implementation details:**
1. `creditPoints()` and `debitPoints()` MUST run inside a transaction:
   ```sql
   BEGIN;
   SELECT * FROM reward_accounts WHERE user_id = $1 FOR UPDATE;
   -- calculate balance_after
   INSERT INTO reward_ledger_entries (...) VALUES (...);
   UPDATE reward_accounts SET balance = $new_balance, ... WHERE user_id = $1;
   COMMIT;
   ```
2. Idempotency: If `idempotencyKey` is provided and already exists, return the existing entry (no error, no duplicate)
3. Daily cap: On credit, check `points_earned_today` + `points_earned_today_date`. If date is stale, reset to 0. Cap the credit amount to `dailyCap - earnedToday`. Set `wasCapped = true` if reduced.
4. The `balance` on `reward_accounts` is updated in the SAME transaction as the ledger INSERT — never separately.

**Analytics events (emitted inside each function):**
- `creditPoints()` → `rewards.points.earned` with `{ user_id, amount, source, reference_id, balance_after, multiplier_applied, tier_at_earn }`
- `debitPoints()` source=redemption → `rewards.points.redeemed` with `{ user_id, amount, source, balance_after }`
- `debitPoints()` source=expiration → `rewards.points.expired` with `{ user_id, amount }`
- `voidEntry()` → `rewards.points.voided` with `{ user_id, voided_entry_id, amount, reason }`

**Tests:** `backend/src/services/reward-ledger.test.js`

| Test case | What it validates |
|-----------|-------------------|
| Credit 100 points to new user | Auto-creates account, balance = 100, ledger entry created |
| Credit respects daily cap | Explorer cap 500 — credit 600 → only 500 credited, `wasCapped = true` |
| Credit with idempotency key | Duplicate key returns original entry, no double credit |
| Debit insufficient balance | Throws 422 INSUFFICIENT_BALANCE |
| Debit exact balance | Balance goes to 0, no error |
| Void a credit entry | Sets voided_at, creates offsetting debit, balance reduced |
| Void already-voided entry | Throws 409 ALREADY_VOIDED |
| Concurrent credits (race condition) | Two simultaneous credits for same user → both succeed, `balance_after` values are sequential, no gap |
| Velocity check: 11th transaction in 1 hour | Returns `withinLimits: false` |
| getHistory with cursor pagination | Returns correct page, nextCursor, hasMore |
| getHistory with type filter | Only returns matching type |
| getDailyEarnStatus date rollover | Returns 0 earned if `points_earned_today_date` is yesterday |
| Frozen account rejects credit | Throws 403 ACCOUNT_FROZEN |

---

## 5. Rewards Rules Engine

Stateless calculation layer. All business math lives here — not in route handlers, not in the ledger service.

---

### File: `backend/src/services/reward-rules-engine.js`
**Purpose:** Pure calculation functions for point earning, redemption eligibility, and multiplier computation. Reads config from `RewardConfigService` but performs no database writes. This is the single place where "how many points does this user earn?" is answered.
**Depends on:** `→ services/reward-config.js`, `→ rewards/constants.js`
**Key functions:**

```js
/**
 * @param {{ rewardConfig: RewardConfigService }} deps
 * @returns {RewardRulesEngine}
 */
function createRewardRulesEngine({ rewardConfig })

  /**
   * Calculate how many points a purchase would earn (before actually crediting).
   *
   * @param {{
   *   orderAmountMinor: number,  // cents
   *   tier: string,
   *   streakMultiplier: number,
   *   earnedToday: number,
   *   dailyCap: number
   * }} params
   * @returns {Promise<{
   *   eligible: boolean,
   *   basePoints: number,
   *   tierMultiplier: number,
   *   streakMultiplier: number,
   *   combinedMultiplier: number,
   *   rawEarn: number,
   *   dailyCapRemaining: number,
   *   finalEarn: number,
   *   ineligibleReason: string|null
   * }>}
   */
  async function calculatePurchaseEarn(params)

  /**
   * Calculate redemption eligibility for a given order.
   *
   * @param {{
   *   balance: number,            // Current DP balance
   *   orderAmountMinor: number    // Order total in cents
   * }} params
   * @returns {Promise<{
   *   eligible: boolean,
   *   maxRedeemablePoints: number,
   *   maxRedeemableReason: string,
   *   maxDollarValueMinor: number,
   *   minRedemptionPoints: number
   * }>}
   */
  async function calculateRedemptionEligibility(params)

  /**
   * Get the streak multiplier for a given streak count.
   * Uses ranges from config: 1-6 = 1.0, 7-13 = 1.5, 14-30 = 2.0, 31+ = 3.0
   *
   * @param {number} streakDays
   * @returns {Promise<number>}
   */
  async function computeStreakMultiplier(streakDays)

  /**
   * Determine which tier a user qualifies for based on rolling 12-month points.
   *
   * @param {number} rolling12mPoints
   * @returns {Promise<{ qualifiedTier: string, nextTier: string|null, nextThreshold: number|null, progress: number }>}
   */
  async function computeQualifiedTier(rolling12mPoints)

  /**
   * Convert points to dollar value in minor units (cents).
   * @param {number} points
   * @returns {Promise<number>} cents
   */
  async function pointsToDollars(points)

  /**
   * Convert dollar amount (cents) to base points (before multipliers).
   * @param {number} amountMinor
   * @returns {Promise<number>} base DP
   */
  async function dollarsToBasePoints(amountMinor)
```

**Calculation formulas (all from Business Rules spec):**
```
Base earn:
  base_points = FLOOR(order_amount_minor / 100) × points_per_dollar

Combined multiplier:
  combined = tier_multiplier × streak_multiplier

Raw earn:
  raw_earn = FLOOR(base_points × combined_multiplier)

Final earn (capped):
  final_earn = MIN(raw_earn, daily_cap - earned_today)
  if final_earn <= 0 → ineligible, reason = 'daily_cap_reached'

Redemption max:
  max_by_pct = FLOOR(order_amount_minor × max_redemption_pct / 100)
  max_by_cap = max_redemption_cap_minor
  max_redeemable = MIN(balance, max_by_pct, max_by_cap)
  eligible = max_redeemable >= min_redemption_points
```

**Analytics events:** None (pure calculation — no side effects)

**Tests:** `backend/src/services/reward-rules-engine.test.js`

| Test case | Input | Expected output |
|-----------|-------|-----------------|
| Basic purchase earn | $75 order, Explorer, streak 1 | base=750, mult=1.0, final=500 (capped) |
| High-multiplier earn | $75 order, Elite, streak 31+ | base=750, mult=9.0, final=2500 (capped at elite cap) |
| Below minimum order | $20 order | eligible=false, reason='order_below_minimum' |
| Daily cap already hit | earned_today = 500, cap = 500 | eligible=false, reason='daily_cap_reached' |
| Partial cap | earned_today=400, cap=500, raw_earn=200 | final=100 |
| Redemption: $100 order, 5000 balance | | max=1500 (15% of 10000), eligible=true |
| Redemption: $200 order, 5000 balance | | max=2000 ($20 cap), eligible=true |
| Redemption: 300 DP balance | | eligible=false (below 500 min) |
| Tier qualification: 4999 points | | qualifiedTier='member', nextTier='insider', nextThreshold=5000 |
| Tier qualification: 50001 points | | qualifiedTier='elite', nextTier=null |
| Streak multiplier day 7 | | 1.5 |
| Streak multiplier day 30 | | 2.0 |
| Streak multiplier day 31 | | 3.0 |
| pointsToDollars(500) | | 500 (cents = $5.00) |
| dollarsToBasePoints(7500) | | 750 (75 × 10) |

---

## 6. Tier Service

---

### File: `backend/src/services/reward-tiers.js`
**Purpose:** Manages the 5-tier progression system. Handles tier qualification checks, upgrades, downgrades, grace periods, and the nightly requalification job.
**Depends on:** `→ services/reward-config.js`, `→ services/reward-ledger.js`, `→ services/reward-rules-engine.js`, `→ rewards/constants.js`, `→ db`
**Key functions:**

```js
/**
 * @param {{ db, rewardConfig, rulesEngine, ledgerService, analytics, logger }} deps
 * @returns {TierService}
 */
function createTierService({ db, rewardConfig, rulesEngine, ledgerService, analytics, logger })

  /**
   * Get a user's current tier info (tier, multiplier, progress to next).
   * @param {number} userId
   * @returns {Promise<TierInfo>}
   */
  async function getTierInfo(userId)

  /**
   * Check and apply tier upgrade/downgrade for a single user.
   * Called after every earn event and by the nightly requalification cron.
   *
   * @param {number} userId
   * @returns {Promise<{ changed: boolean, previousTier: string, newTier: string, direction: 'upgrade'|'downgrade'|null }>}
   */
  async function requalify(userId)

  /**
   * Batch requalification job. Processes all users with stale rolling_12m_points.
   * Called by nightly cron.
   *
   * @param {{ batchSize?: number }} options
   * @returns {Promise<{ processed: number, upgraded: number, downgraded: number, graceStarted: number }>}
   */
  async function batchRequalify(options)

  /**
   * Recalculate rolling 12-month points for a user from the ledger.
   * @param {number} userId
   * @returns {Promise<number>} rolling 12m points
   */
  async function recalcRolling12m(userId)

  /**
   * Get the tier multiplier for a user (convenience shortcut).
   * @param {number} userId
   * @returns {Promise<number>}
   */
  async function getMultiplier(userId)
```

**Tier upgrade logic:**
```
1. Calculate rolling_12m_points = SUM(amount) from reward_ledger_entries
   WHERE user_id = $1 AND type = 'credit' AND created_at > NOW() - '12 months'
   AND voided_at IS NULL
2. Determine qualified tier from thresholds
3. If qualified > current → upgrade immediately
4. If qualified < current:
   a. If grace period not yet started → set tier_grace_until = NOW() + 30 days
   b. If grace period active and not expired → no change
   c. If grace period expired → downgrade
```

**Analytics events:**
- `requalify()` upgrade → `rewards.tier.upgraded` `{ user_id, previous_tier, new_tier }`
- `requalify()` downgrade → `rewards.tier.downgraded` `{ user_id, previous_tier, new_tier }`
- `requalify()` grace start → `rewards.tier.grace_started` `{ user_id, tier, grace_until }`

**Tests:** `backend/src/services/reward-tiers.test.js`
- User with 1200 rolling points → tier = member
- User with 4999 rolling points → tier = member (not insider)
- User with 5000 rolling points → tier = insider
- Upgrade from explorer to member → sets tier_qualified_at, emits event
- Downgrade: grace period starts, tier unchanged
- Downgrade: grace period expired → actual downgrade
- `getMultiplier()` returns correct value per tier
- `batchRequalify()` processes N users and returns summary

---

## 7. Streak Service

---

### File: `backend/src/services/reward-streaks.js`
**Purpose:** Manages daily check-in streaks, multiplier progression (1x→3x), shield management, and streak break detection.
**Depends on:** `→ services/reward-config.js`, `→ services/reward-ledger.js`, `→ services/reward-rules-engine.js`, `→ rewards/constants.js`, `→ db`
**Key functions:**

```js
/**
 * @param {{ db, rewardConfig, rulesEngine, ledgerService, analytics, logger }} deps
 * @returns {StreakService}
 */
function createStreakService({ db, rewardConfig, rulesEngine, ledgerService, analytics, logger })

  /**
   * Process a daily check-in for a user.
   * Increments streak if not already checked in today, awards streak bonus points.
   *
   * @param {number} userId
   * @returns {Promise<{
   *   checkedIn: boolean,       // false if already checked in today
   *   streakCurrent: number,
   *   streakMultiplier: number,
   *   bonusPoints: number,      // DP awarded for this check-in
   *   shieldsRemaining: number,
   *   alreadyCheckedIn: boolean
   * }>}
   */
  async function checkIn(userId)

  /**
   * Get a user's streak state.
   * @param {number} userId
   * @returns {Promise<StreakState>}
   */
  async function getStreakState(userId)

  /**
   * Daily cron: detect users who missed yesterday's check-in.
   * Apply shield if available; break streak if no shields.
   *
   * @param {{ batchSize?: number }} options
   * @returns {Promise<{ processed: number, shieldsUsed: number, streaksBroken: number }>}
   */
  async function batchBreakDetection(options)

  /**
   * Reset shields for a user when tier changes (grant new shield allocation).
   * @param {number} userId
   * @param {string} newTier
   * @returns {Promise<number>} new shield count
   */
  async function resetShields(userId, newTier)
```

**Check-in logic:**
```
1. Get account (FOR UPDATE)
2. If streak_last_checkin_date == today → return { alreadyCheckedIn: true }
3. If streak_last_checkin_date == yesterday → increment streak
4. If streak_last_checkin_date < yesterday → streak break (handle below)
5. Update streak_current, streak_longest = MAX(current, longest)
6. Compute new multiplier from rules engine
7. Credit streak_bonus points (e.g. 5 DP per check-in)
8. Update streak_last_checkin_date = today
```

**Streak break in cron:**
```
1. Find accounts where streak_last_checkin_date < yesterday AND streak_current > 0
2. For each:
   a. If shields_remaining > 0 → decrement shield, keep streak
   b. If shields_remaining == 0 → reset streak to 0, multiplier to 1.0
```

**Analytics events:**
- `checkIn()` → `rewards.streak.continued` `{ user_id, streak_current, multiplier }`
- `checkIn()` first ever → `rewards.streak.started` `{ user_id }`
- `batchBreakDetection()` break → `rewards.streak.broken` `{ user_id, streak_was, shields_used: false }`
- `batchBreakDetection()` shield → `rewards.streak.shield_used` `{ user_id, streak_current, shields_remaining }`

**Tests:** `backend/src/services/reward-streaks.test.js`
- First check-in → streak=1, multiplier=1.0, event emitted
- 7th consecutive check-in → multiplier jumps to 1.5
- 14th check-in → multiplier=2.0
- 31st check-in → multiplier=3.0
- Double check-in same day → `alreadyCheckedIn: true`, no dup credit
- Missed day with shield → shield decremented, streak preserved
- Missed day without shield → streak reset to 0
- `resetShields()` after tier upgrade → new shield count from config

---

## 8. Challenge Service

---

### File: `backend/src/services/reward-challenges.js`
**Purpose:** Manages challenge lifecycle — definitions (CRUD), user enrollment, progress tracking, auto-completion on purchase events, and reward issuance on completion.
**Depends on:** `→ services/reward-ledger.js`, `→ services/reward-config.js`, `→ rewards/constants.js`, `→ db`
**Key functions:**

```js
/**
 * @param {{ db, ledgerService, rewardConfig, analytics, logger }} deps
 * @returns {ChallengeService}
 */
function createChallengeService({ db, ledgerService, rewardConfig, analytics, logger })

  /**
   * List active challenges available for a user to join.
   * Excludes challenges already enrolled in.
   *
   * @param {{ userId: number, type?: string, limit?: number, cursor?: object }} params
   * @returns {Promise<{ items: ChallengeListing[], hasMore, nextCursor }>}
   */
  async function listAvailable(params)

  /**
   * Enroll a user in a challenge.
   * @param {{ userId: number, challengeId: string }} params
   * @returns {Promise<UserChallenge>}
   */
  async function enroll(params)

  /**
   * Get a user's active and recently completed challenges.
   * @param {{ userId: number, status?: string, limit?: number, cursor?: object }} params
   * @returns {Promise<{ items: UserChallenge[], hasMore, nextCursor }>}
   */
  async function getUserChallenges(params)

  /**
   * Increment progress on matching challenges for a user after a purchase.
   * Called from event ingestion, NOT from a route handler.
   *
   * @param {{
   *   userId: number,
   *   eventType: 'purchase' | 'review' | 'streak_checkin',
   *   metadata: { orderAmountMinor?: number, merchantUserId?: number, productId?: number }
   * }} params
   * @returns {Promise<{ progressed: ChallengeProgress[], completed: ChallengeProgress[] }>}
   */
  async function processEvent(params)

  /**
   * Cron: expire active challenges past their end date.
   * @returns {Promise<{ expired: number }>}
   */
  async function batchExpire()

  /**
   * Admin: create a new challenge definition.
   * @param {ChallengeDefinitionInput} input
   * @returns {Promise<ChallengeDefinition>}
   */
  async function createDefinition(input)
```

**Progress tracking logic:**
```
On purchase event:
1. SELECT active user_challenges for this user
   JOIN challenge_definitions WHERE criteria matches event type
2. For each matching challenge:
   a. Increment progress by 1 (or by amount if amount-based)
   b. If progress >= target → set status = 'completed', completed_at = NOW()
   c. If completed → credit reward_points via ledgerService.creditPoints()
3. Return list of progressed and completed challenges
```

**Analytics events:**
- `enroll()` → `rewards.challenge.enrolled` `{ user_id, challenge_id, challenge_type }`
- `processEvent()` progress → `rewards.challenge.progressed` `{ user_id, challenge_id, progress, target }`
- `processEvent()` completed → `rewards.challenge.completed` `{ user_id, challenge_id, reward_points }`
- `batchExpire()` → `rewards.challenge.expired` `{ challenge_id, expired_count }`

**Tests:** `backend/src/services/reward-challenges.test.js`
- Enroll user in challenge → status=active, progress=0
- Duplicate enrollment → 409 (unique constraint)
- processEvent purchase increments matching challenge → progress=1
- processEvent purchase completes challenge → status=completed, points credited
- processEvent no matching challenge → no-op, empty arrays
- batchExpire with past challenges → status=expired
- listAvailable excludes already-enrolled challenges

---

## 9. Referral Service

---

### File: `backend/src/services/reward-referrals.js`
**Purpose:** Complete referral lifecycle — code generation, signup attribution, qualification on first purchase, 14-day hold management, release/forfeit logic, and fraud checks (device/IP overlap, self-referral, monthly cap).
**Depends on:** `→ services/reward-ledger.js`, `→ services/reward-config.js`, `→ services/reward-rules-engine.js`, `→ rewards/constants.js`, `→ db`
**Key functions:**

```js
/**
 * @param {{ db, ledgerService, rewardConfig, analytics, logger }} deps
 * @returns {ReferralService}
 */
function createReferralService({ db, ledgerService, rewardConfig, analytics, logger })

  /**
   * Get or create the user's active referral code.
   * @param {number} userId
   * @returns {Promise<ReferralCodeInfo>}
   */
  async function getOrCreateCode(userId)

  /**
   * Record a referral share event (analytics-only, no DB mutation beyond analytics).
   * @param {{ userId: number, channel: string, referralCode: string }} params
   * @returns {Promise<void>}
   */
  async function recordShare(params)

  /**
   * Attribute a new signup to a referrer. Called from auth.register().
   * Runs fraud checks: self-referral, device/IP overlap, monthly cap.
   *
   * @param {{
   *   refereeUserId: number,
   *   referralCode: string,
   *   deviceFingerprint?: string,
   *   signupIp?: string
   * }} params
   * @returns {Promise<{ attributed: boolean, referralId: string|null, rejectedReason: string|null }>}
   */
  async function attributeSignup(params)

  /**
   * Evaluate a referral after the referee makes a qualifying purchase.
   * Creates reward holds if qualifications are met.
   *
   * @param {{ refereeUserId: number, orderId: number, orderAmountMinor: number }} params
   * @returns {Promise<{ qualified: boolean, referralId: string, rewards: ReferralRewardInfo[] }>}
   */
  async function evaluateQualifyingPurchase(params)

  /**
   * Get referral status dashboard for a user (their referrals as referrer).
   * @param {{ userId: number, limit?: number, cursor?: object, status?: string }} params
   * @returns {Promise<{ summary: ReferralSummary, items: ReferralItem[], hasMore, nextCursor }>}
   */
  async function getStatus(params)

  /**
   * Cron: release held referral rewards past their hold_until date.
   * @returns {Promise<{ released: number, extended: number, forfeited: number }>}
   */
  async function batchReleaseHolds()

  /**
   * Admin: approve a referral and release rewards immediately.
   * @param {{ referralId: string, adminUserId: number, reason: string }} params
   * @returns {Promise<ReferralApprovalResult>}
   */
  async function adminApprove(params)

  /**
   * Admin: reject a referral and forfeit rewards.
   * @param {{ referralId: string, adminUserId: number, reason: string, createFraudFlag?: boolean, fraudSeverity?: string }} params
   * @returns {Promise<ReferralRejectionResult>}
   */
  async function adminReject(params)

  /**
   * Extend hold for a referral (called when qualifying order is disputed/refunded).
   * @param {{ referralId: string, extensionDays: number, reason: string }} params
   * @returns {Promise<{ extended: boolean, newHoldUntil: Date, extensionCount: number }>}
   */
  async function extendHold(params)
```

**Attribution fraud checks (in `attributeSignup`):**
```
1. Resolve referral code → referrer_user_id
2. Check self-referral: referrer_user_id == refereeUserId → BLOCK (also DB constraint)
3. Check device overlap: SELECT count FROM referral_relationships
   WHERE referrer_user_id = $1 AND device_fingerprint = $2 → if > 0, flag
4. Check IP overlap: same logic with signup_ip
5. Check monthly cap: SELECT count WHERE referrer_user_id AND created_at > start of month
   → if >= 20, REJECT
6. If all pass → INSERT referral_relationships, INSERT referral_events(code_used, signup_completed)
```

**Hold release logic (in `batchReleaseHolds`):**
```
1. SELECT referral_rewards WHERE status = 'held' AND hold_until <= NOW()
2. For each:
   a. Re-check: qualifying order not refunded?
   b. Re-check: no active fraud flags on referrer or referee?
   c. If clean → credit via ledgerService, set status='released'
   d. If dirty → extend hold by 14 days (up to 3 extensions), or forfeit
```

**Analytics events:**
- `getOrCreateCode()` → `growth.referral.code_created` (only if new)
- `recordShare()` → `growth.referral.shared` `{ user_id, channel }`
- `attributeSignup()` → `growth.referral.attributed` `{ referrer_user_id, referee_user_id }` or `growth.referral.rejected` if blocked
- `evaluateQualifyingPurchase()` → `growth.referral.qualified` `{ referrer_user_id, referee_user_id, order_id }`
- `batchReleaseHolds()` → `growth.referral.completed` `{ referrer_user_id, referee_user_id, reward_dp }`
- `adminApprove()` → `admin.referral.approved`
- `adminReject()` → `admin.referral.rejected`

**Tests:** `backend/src/services/reward-referrals.test.js`
- Generate code → unique, 4-20 chars, uppercase
- Idempotent code retrieval → same code on repeated calls
- Self-referral → rejected at DB constraint level
- Device overlap → creates fraud flag, rejects attribution
- Monthly cap at 20 → 21st referral rejected
- Qualifying purchase → status = qualified, holds created with 14-day hold_until
- Hold release after 14 days → rewards credited, status = released
- Hold extension on refund → hold_until extended, max 3 extensions
- Forfeit after 3 extensions → status = forfeited
- Admin approve → immediate release, audit log created
- Admin reject → forfeit, optional fraud flag

---

## 10. Trust & Fraud Service

---

### File: `backend/src/services/reward-trust.js`
**Purpose:** Trust score calculation (0–1000, 5 weighted components), fraud signal ingestion, flag creation, auto-action execution, and risk assessment for transactions.
**Depends on:** `→ services/reward-ledger.js`, `→ rewards/constants.js`, `→ db`
**Key functions:**

```js
/**
 * @param {{ db, ledgerService, analytics, logger }} deps
 * @returns {TrustService}
 */
function createTrustService({ db, ledgerService, analytics, logger })

  /**
   * Get or create a trust profile for a user.
   * @param {number} userId
   * @returns {Promise<TrustProfile>}
   */
  async function getProfile(userId)

  /**
   * Recalculate trust score for a user from all components.
   * @param {number} userId
   * @returns {Promise<{ before: number, after: number, bandBefore: string, bandAfter: string }>}
   */
  async function recalculateScore(userId)

  /**
   * Assess fraud risk for a transaction (pre-earn check).
   * @param {{ userId: number, amountMinor: number, sourceRefType: string, sourceRefId: string }} params
   * @returns {Promise<{ risk: 'allow'|'hold'|'block', reasons: string[] }>}
   */
  async function assessRisk(params)

  /**
   * Create a fraud flag and optionally execute auto-actions.
   * @param {{
   *   userId: number,
   *   flagType: string,
   *   severity: string,
   *   source: string,
   *   referenceType?: string,
   *   referenceId?: string,
   *   evidence: object,
   *   autoAction?: string
   * }} params
   * @returns {Promise<FraudFlagResult>}
   */
  async function createFlag(params)

  /**
   * Resolve a fraud flag with corrective actions.
   * @param {{
   *   flagId: string,
   *   action: 'resolve_legitimate'|'resolve_fraud'|'escalate',
   *   correctiveActions?: string[],
   *   reason: string,
   *   adminUserId: number,
   *   overrideTrustScore?: number
   * }} params
   * @returns {Promise<FraudResolutionResult>}
   */
  async function resolveFlag(params)

  /**
   * Get fraud flags with filtering (admin queue).
   * @param {{ limit, offset, status?, severity?, flagType?, userId?, sort? }} params
   * @returns {Promise<{ summary: FraudSummary, items: FraudFlag[], total: number }>}
   */
  async function getFlags(params)

  /**
   * Batch recalculate trust scores for accounts with new signals.
   * Called by 6-hourly cron.
   * @returns {Promise<{ recalculated: number, bandChanges: number }>}
   */
  async function batchRecalculate()

  /**
   * Compute the penalty multiplier for a seller's trust band.
   * Used by ranking service.
   * @param {number} userId
   * @returns {Promise<number>} 0.0 – 1.0
   */
  async function getPenaltyMultiplier(userId)
```

**Trust score calculation:**
```
identity_score:     0–300  (30%) — email verified, phone verified, ID verified, account age
behavioral_score:   0–250  (25%) — login regularity, engagement patterns, no TOS violations
transaction_score:  0–200  (20%) — order history, refund rate, dispute rate
social_score:       0–150  (15%) — followers, reviews written, community engagement
device_score:       0–100  (10%) — consistent device, no VPN/proxy, device age

trust_score = identity + behavioral + transaction + social + device
trust_band = critical (0-199), low (200-399), new (400-599), good (600-799), excellent (800-1000)
penalty_multiplier = band-based (see schema doc)
```

**Auto-action mapping:**
```
low severity    → none (flag only)
medium severity → hold_pending_rewards
high severity   → freeze_earning
critical        → freeze_account
```

**Analytics events:**
- `recalculateScore()` → `trust.score.calculated` `{ user_id, score, band }`
- `recalculateScore()` with change → `trust.score.changed` `{ user_id, before, after, band_before, band_after }`
- `createFlag()` → `trust.fraud.detected` `{ user_id, flag_type, severity, auto_action }`
- `resolveFlag()` → `trust.fraud.resolved` `{ flag_id, action, admin_user_id }`

**Tests:** `backend/src/services/reward-trust.test.js`
- New user gets default score 500, band 'new'
- Score recalculation sums components correctly
- Band boundaries: 199 → critical, 200 → low, 400 → new, 600 → good, 800 → excellent
- createFlag with severity=critical → auto freezes account
- resolveFlag as legitimate → unfreezes if was auto-frozen
- resolveFlag as fraud with void_flagged_points → points voided
- assessRisk with velocity breach → returns 'block'
- getPenaltyMultiplier for 'critical' band → 0.0
- getPenaltyMultiplier for 'excellent' band → 1.0

---

## 11. Boost Service

---

### File: `backend/src/services/reward-boosts.js`
**Purpose:** Seller-funded boost campaign management — purchase, pause, cancel, impression tracking, and budget enforcement.
**Depends on:** `→ services/reward-trust.js`, `→ rewards/constants.js`, `→ db`
**Key functions:**

```js
/**
 * @param {{ db, trustService, monetizationGateway, analytics, logger }} deps
 * @returns {BoostService}
 */
function createBoostService({ db, trustService, monetizationGateway, analytics, logger })

  /**
   * Purchase a new boost campaign.
   * @param {{
   *   sellerUserId: number,
   *   productId: number,
   *   boostType: 'standard'|'premium'|'featured',
   *   budgetMinor: number,
   *   durationDays?: number
   * }} params
   * @returns {Promise<BoostPurchaseResult>}
   */
  async function purchase(params)

  /**
   * Record an impression for a boost.
   * @param {{ boostId: string, viewerUserId: number|null, costMinor: number, positionInFeed: number }} params
   * @returns {Promise<void>}
   */
  async function recordImpression(params)

  /**
   * Get a seller's boost history.
   * @param {{ sellerUserId: number, limit, cursor, status? }} params
   * @returns {Promise<{ items, hasMore, nextCursor }>}
   */
  async function getHistory(params)

  /**
   * Get the active boost multiplier for a product.
   * Returns 1.0 if no active boost.
   * @param {number} productId
   * @returns {Promise<{ multiplier: number, boostId: string|null }>}
   */
  async function getActiveMultiplier(productId)

  /**
   * Pause/cancel/expire boost campaigns (admin or cron).
   * @param {{ boostId: string, newStatus: string, reason?: string }} params
   * @returns {Promise<void>}
   */
  async function updateStatus(params)

  /**
   * Cron: find exhausted or expired boosts and mark them.
   * @returns {Promise<{ exhausted: number, expired: number }>}
   */
  async function batchExpireBoosts()
```

**Purchase validation:**
```
1. Verify product exists, status = 'published', creator = sellerUserId
2. Verify no active boost on this product already
3. Verify trust score >= 200 (not critical band)
4. Verify budget >= min for boost type
5. Create Stripe PaymentIntent for budget amount
6. Insert boost_purchases with status = 'active'
```

**Analytics events:**
- `purchase()` → `rewards.boost.purchased` `{ seller_user_id, product_id, boost_type, budget_minor }`
- `recordImpression()` → no event (too high volume — batch via analytics_events table directly)
- `updateStatus()` → `rewards.boost.status_changed` `{ boost_id, old_status, new_status }`

**Tests:** `backend/src/services/reward-boosts.test.js`
- Purchase standard boost → created with multiplier 1.5
- Purchase with trust_band = critical → rejected 422
- Duplicate boost on same product → 409
- Record impression → spent_minor incremented, impression_count incremented
- Budget exhausted → status auto-changes to 'exhausted'
- getActiveMultiplier with no boost → returns 1.0
- getActiveMultiplier with active boost → returns correct multiplier
- batchExpireBoosts marks past-date boosts as expired

---

## 12. Ranking Service

---

### File: `backend/src/services/reward-ranking.js`
**Purpose:** Computes organic ranking signals for sellers/products and applies the visibility formula. Called by cron for batch computation and by the feed module for real-time ranking.
**Depends on:** `→ services/reward-trust.js`, `→ services/reward-boosts.js`, `→ db`
**Key functions:**

```js
/**
 * @param {{ db, trustService, boostService, analytics, logger }} deps
 * @returns {RankingService}
 */
function createRankingService({ db, trustService, boostService, analytics, logger })

  /**
   * Compute organic ranking signals for a seller (or specific product).
   * @param {{ sellerUserId: number, productId?: number }} params
   * @returns {Promise<RankingSignalResult>}
   */
  async function computeSignals(params)

  /**
   * Get the final visibility score for a product.
   * visibility = organic × boost_multiplier × penalty_multiplier
   *
   * @param {{ sellerUserId: number, productId: number }} params
   * @returns {Promise<VisibilityScore>}
   */
  async function getVisibilityScore(params)

  /**
   * Get seller performance analytics for the seller dashboard.
   * @param {{ sellerUserId: number, period: '7d'|'30d'|'90d' }} params
   * @returns {Promise<SellerPerformance>}
   */
  async function getSellerPerformance(params)

  /**
   * Get seller ranking breakdown for the dashboard.
   * @param {{ sellerUserId: number, productId?: number }} params
   * @returns {Promise<RankingBreakdown>}
   */
  async function getRankingBreakdown(params)

  /**
   * Batch recompute signals for all sellers. Called by cron every 15 min.
   * @returns {Promise<{ computed: number }>}
   */
  async function batchComputeSignals()

  /**
   * Update ranking signals after a purchase (incremental update).
   * @param {{ sellerUserId: number, orderAmountMinor: number }} params
   * @returns {Promise<void>}
   */
  async function onPurchaseSignal(params)
```

**Organic score formula (6 weighted signals):**
```
organic_score = (sales_volume_norm     × 0.30)
              + (conversion_rate_norm  × 0.25)
              + (avg_review_score_norm × 0.20)
              + (return_rate_inv_norm  × 0.10)
              + (content_quality_norm  × 0.10)
              + (recency_norm          × 0.05)

visibility_score = organic_score × boost_multiplier × penalty_multiplier
```

**Analytics events:**
- `computeSignals()` → `ranking.signals.computed` `{ seller_user_id, organic_score }`

**Tests:** `backend/src/services/reward-ranking.test.js`
- Seller with no data → organic score = 0
- Seller with sales → sales_volume contributes 30% of score
- Zero organic × 3.0 boost → visibility = 0 (critical invariant)
- High organic × no boost → visibility = organic
- Penalty multiplier 0.5 → halves visibility score
- getSellerPerformance returns correct period aggregates
- batchComputeSignals processes all sellers

---

## 13. Checkout Integration

---

### File: `backend/src/services/reward-checkout.js`
**Purpose:** Orchestration layer that coordinates reward operations during the checkout flow — eligibility check, point application, post-purchase earn and hooks. This is the glue between monetization and rewards.
**Depends on:** `→ services/reward-ledger.js`, `→ services/reward-rules-engine.js`, `→ services/reward-tiers.js`, `→ services/reward-streaks.js`, `→ services/reward-challenges.js`, `→ services/reward-referrals.js`, `→ services/reward-ranking.js`, `→ services/reward-trust.js`, `→ db`
**Key functions:**

```js
/**
 * @param {{
 *   db, ledgerService, rulesEngine, tierService, streakService,
 *   challengeService, referralService, rankingService, trustService,
 *   analytics, logger
 * }} deps
 * @returns {RewardCheckoutService}
 */
function createRewardCheckoutService(deps)

  /**
   * Check reward eligibility for a checkout (pre-purchase).
   * Returns what the user can earn, what they can redeem, and active challenges.
   *
   * @param {{
   *   userId: number,
   *   orderAmountMinor: number,
   *   productId?: number,
   *   sellerUserId?: number
   * }} params
   * @returns {Promise<CheckoutEligibility>}
   */
  async function checkEligibility(params)

  /**
   * Apply a point redemption to a checkout session.
   * Debits points and marks the redemption as applied.
   *
   * @param {{
   *   userId: number,
   *   checkoutSessionId: number,
   *   pointsAmount: number,
   *   idempotencyKey?: string
   * }} params
   * @returns {Promise<RedemptionApplyResult>}
   */
  async function applyRedemption(params)

  /**
   * Process all reward hooks after a successful purchase.
   * Called by the monetization webhook handler after order creation.
   *
   * This is the PRIMARY entry point for the earn flow.
   *
   * @param {{
   *   orderId: number,
   *   buyerUserId: number,
   *   sellerUserId: number,
   *   amountMinor: number,
   *   productId?: number
   * }} params
   * @returns {Promise<PostPurchaseResult>}
   */
  async function onPurchaseComplete(params)

  /**
   * Process all reward hooks after an order refund.
   * Claws back buyer points, extends referral holds, reverses ranking signals.
   *
   * @param {{
   *   orderId: number,
   *   buyerUserId: number,
   *   sellerUserId: number,
   *   amountMinor: number,
   *   reason?: string
   * }} params
   * @returns {Promise<PostRefundResult>}
   */
  async function onOrderRefund(params)
```

**`onPurchaseComplete()` orchestration sequence (from architecture doc):**
```
1. RISK CHECK: trustService.assessRisk(buyer, order)
   → if BLOCK: skip earn, log, return
   → if HOLD: mark for manual review
   → if ALLOW: proceed

2. EARN: Calculate & credit buyer points
   a. rulesEngine.calculatePurchaseEarn(orderAmount, tier, streak, dailyCap)
   b. ledgerService.creditPoints(buyer, finalEarn, 'purchase', orderId)
   c. tierService.requalify(buyer) — check if earn triggers tier upgrade

3. REFERRAL: Check if this qualifies a referral
   a. referralService.evaluateQualifyingPurchase(buyer, orderId, amount)

4. CHALLENGE: Update challenge progress
   a. challengeService.processEvent({ userId: buyer, eventType: 'purchase', metadata })

5. RANKING: Update seller ranking signals
   a. rankingService.onPurchaseSignal({ seller, amount })

6. REDEMPTION: If points were applied to this order
   a. Confirm redemption status → 'applied', link to order

7. Return composite result with all actions taken
```

**`onOrderRefund()` orchestration:**
```
1. Find ledger entries for this order → void via ledgerService.voidEntry()
2. Check referral: referralService.extendHold() if hold active
3. Ranking: reverse ranking signals
4. Redemption: reverse if points were applied
```

**Analytics events:** Delegates to sub-services. This file does NOT emit its own events — each sub-service emits its own.

**Tests:** `backend/src/services/reward-checkout.test.js`
- checkEligibility for $75 order, member tier, 14-day streak → correct earn estimate and redemption max
- checkEligibility for $20 order → earning.eligible=false
- applyRedemption → points debited, redemption record created
- applyRedemption below 500 DP → 400 error
- applyRedemption exceeds 15% cap → 422 error
- onPurchaseComplete → points credited, challenges progressed, ranking updated
- onPurchaseComplete with referral → referral qualified
- onPurchaseComplete with risk=BLOCK → no earn, flag created
- onOrderRefund → points voided, referral hold extended, ranking reversed

---

## 14. Notification Hooks

---

### File: `backend/src/services/reward-notifications.js`
**Purpose:** Centralized notification dispatcher for all reward events. Translates internal events into user-facing push notifications. Uses the existing `pushNotifications` service.
**Depends on:** `→ services/push-notifications.js` (existing)
**Key functions:**

```js
/**
 * @param {{ pushNotifications, db, logger }} deps
 * @returns {RewardNotificationService}
 */
function createRewardNotificationService({ pushNotifications, db, logger })

  /**
   * Notify user of points earned.
   * @param {{ userId: number, amount: number, source: string, balanceAfter: number }} params
   */
  async function notifyPointsEarned(params)

  /**
   * Notify user of tier change.
   * @param {{ userId: number, previousTier: string, newTier: string, direction: 'upgrade'|'downgrade' }} params
   */
  async function notifyTierChange(params)

  /**
   * Notify user of streak milestone (7, 14, 30 days).
   * @param {{ userId: number, streakDays: number, multiplier: number }} params
   */
  async function notifyStreakMilestone(params)

  /**
   * Notify user their streak is about to break (evening reminder).
   * @param {{ userId: number, streakDays: number }} params
   */
  async function notifyStreakAtRisk(params)

  /**
   * Notify referrer their referral reward has been released.
   * @param {{ userId: number, amount: number, refereeName: string }} params
   */
  async function notifyReferralRewarded(params)

  /**
   * Notify user of challenge completion.
   * @param {{ userId: number, challengeTitle: string, rewardPoints: number }} params
   */
  async function notifyChallengeCompleted(params)

  /**
   * Notify user of account freeze.
   * @param {{ userId: number }} params
   */
  async function notifyAccountFrozen(params)

  /**
   * Notify user of points expiration warning.
   * @param {{ userId: number, daysUntilExpiry: number, balance: number }} params
   */
  async function notifyExpirationWarning(params)
```

**Notification templates:**

| Event | Title | Body |
|-------|-------|------|
| Points earned | "Points Earned!" | "You earned {amount} DP from your purchase. Balance: {balance} DP" |
| Tier upgrade | "Tier Upgrade!" | "Congratulations! You've reached {newTier} tier. Enjoy {multiplier}× earning!" |
| Streak milestone | "Streak Milestone!" | "{days}-day streak! Your multiplier is now {multiplier}×" |
| Referral rewarded | "Referral Bonus!" | "Your referral reward of {amount} DP has been credited!" |
| Challenge completed | "Challenge Complete!" | "You completed '{title}' and earned {amount} DP!" |
| Account frozen | "Account Notice" | "Your reward account is under review. Contact support for details." |

**Analytics events:** None (notifications are themselves triggered by events)

**Tests:** `backend/src/services/reward-notifications.test.js`
- Each notification function calls `pushNotifications.sendToUser()` with correct params
- Graceful failure if push service unavailable (no throw)
- No notification sent if user has no push token (silent no-op)

---

## 15. Admin Service

---

### File: `backend/src/services/reward-admin.js`
**Purpose:** Admin operations on the rewards system — ledger browsing, manual credit/debit, account freeze/unfreeze, tier overrides, and comprehensive audit logging. Every mutation creates an `admin_actions` row in the same transaction.
**Depends on:** `→ services/reward-ledger.js`, `→ services/reward-referrals.js`, `→ services/reward-trust.js`, `→ services/reward-tiers.js`, `→ services/reward-streaks.js`, `→ services/reward-boosts.js`, `→ rewards/constants.js`, `→ db`
**Key functions:**

```js
/**
 * @param {{
 *   db, ledgerService, referralService, trustService,
 *   tierService, streakService, boostService, analytics, logger
 * }} deps
 * @returns {AdminRewardService}
 */
function createAdminRewardService(deps)

  /**
   * Browse the rewards ledger with admin-level filters.
   * @param {{ limit, offset, userId?, type?, source?, from?, to?, minAmount?, maxAmount?, voided? }} params
   * @returns {Promise<{ items: AdminLedgerEntry[], total: number }>}
   */
  async function getLedger(params)

  /**
   * Execute an admin override action.
   * All actions create an admin_actions audit row in the same transaction.
   *
   * @param {{
   *   adminUserId: number,
   *   action: string,          // From ADMIN_ACTION_TYPES
   *   targetUserId: number,
   *   params: object,          // Action-specific params
   *   reason: string,
   *   ipAddress?: string
   * }} input
   * @returns {Promise<AdminOverrideResult>}
   */
  async function executeOverride(input)

  /**
   * Get referral queue for admin review.
   * @param {{ limit, offset, status?, flaggedOnly?, sort? }} params
   * @returns {Promise<{ items: AdminReferralItem[], total: number }>}
   */
  async function getReferralQueue(params)

  /**
   * Log an admin action (called internally by all mutation functions).
   * @param {{ adminUserId, actionType, targetType, targetId, targetUserId?, beforeState?, afterState?, reason, ipAddress? }} params
   * @returns {Promise<string>} admin_action_id
   */
  async function logAction(params)
```

**`executeOverride()` dispatches by action type:**
```
switch (action) {
  case 'manual_credit':  → ledgerService.creditPoints({ ..., source: 'manual_credit', skipDailyCap: true })
  case 'manual_debit':   → ledgerService.debitPoints({ ..., source: 'manual_debit' })
  case 'void_points':    → ledgerService.voidEntry({ ... })
  case 'freeze_account': → UPDATE reward_accounts SET is_frozen=true, frozen_reason, frozen_at
  case 'unfreeze_account': → UPDATE reward_accounts SET is_frozen=false, frozen_reason=null, frozen_at=null
  case 'tier_override':  → UPDATE reward_accounts SET tier=$1, tier_qualified_at=NOW()
  case 'streak_reset':   → streakService reset
  case 'streak_shield_grant': → UPDATE reward_accounts SET streak_shields_remaining += $1
}
Each case captures before_state and after_state and calls logAction().
```

**Analytics events:**
- Every override → `admin.rewards.override` `{ admin_user_id, action, target_user_id, amount? }`

**Tests:** `backend/src/services/reward-admin.test.js`
- manual_credit → points credited, admin_actions row created with before/after
- manual_debit exceeding balance → 422 error, no admin_actions row (rolled back)
- void_points → entry voided, offset entry created, audit logged
- freeze_account → is_frozen=true, reason set, audit logged
- Missing reason → 400 error
- getLedger with user_id filter → returns only that user's entries
- getReferralQueue with flaggedOnly → returns only flagged referrals

---

## 16. Buyer API Routes

These route files are **thin** — they validate input, call service methods, and format responses. No business logic lives here.

---

### File: `backend/src/modules/rewards/routes.js`
**Purpose:** Express router for buyer-facing reward endpoints: balance, history, redeem, and streak check-in. Factory function receives all dependencies.
**Depends on:** `→ services/reward-ledger.js`, `→ services/reward-rules-engine.js`, `→ services/reward-tiers.js`, `→ services/reward-streaks.js`, `→ services/reward-checkout.js`, `→ middleware/auth.js`, `→ rewards/validators.js`
**Key routes:**

```js
/**
 * @param {{ db, config, analytics, ledgerService, rulesEngine, tierService, streakService, checkoutService }} deps
 * @returns {express.Router}
 */
function createRewardsRouter(deps)

  // GET /rewards/balance → ledgerService.getAccountState(req.user.id)
  // GET /rewards/history → ledgerService.getHistory({ userId: req.user.id, ...pagination })
  // POST /rewards/redeem → checkoutService.applyRedemption(...)
  // POST /rewards/checkin → streakService.checkIn(req.user.id)
  // GET /rewards/streaks → streakService.getStreakState(req.user.id)
  // GET /rewards/tiers → tierService.getTierInfo(req.user.id)
  // GET /rewards/challenges → challengeService.getUserChallenges(...)
  // POST /rewards/challenges/:id/enroll → challengeService.enroll(...)
```

**Route handler pattern (all routes follow this):**
```js
router.get('/balance', auth, asyncHandler(async (req, res) => {
  const state = await ledgerService.getAccountState(req.user.id);
  // analytics.trackEvent('rewards.balance.viewed', { ... })  -- fire and forget
  res.status(200).json({ data: state });
}));
```

**Rate limiting:**
- Read endpoints: global 120/min
- Write endpoints (redeem, checkin): 10 per 15 min per user

**Tests:** `backend/src/modules/rewards/routes.test.js` (integration tests using supertest)
- GET /rewards/balance → 200, response matches schema
- GET /rewards/balance without auth → 401
- GET /rewards/history → 200, paginated
- POST /rewards/redeem with valid input → 201
- POST /rewards/redeem below minimum → 400
- POST /rewards/redeem insufficient balance → 422
- POST /rewards/checkin → 200, streak incremented
- POST /rewards/checkin twice → 200, alreadyCheckedIn: true

---

### File: `backend/src/modules/referrals/routes.js`
**Purpose:** Express router for referral endpoints: code retrieval, share tracking, status dashboard.
**Depends on:** `→ services/reward-referrals.js`, `→ middleware/auth.js`, `→ rewards/validators.js`
**Key routes:**

```js
/**
 * @param {{ db, config, analytics, referralService }} deps
 * @returns {express.Router}
 */
function createReferralsRouter(deps)

  // GET /referrals/code → referralService.getOrCreateCode(req.user.id)
  // POST /referrals/share → referralService.recordShare(...)
  // GET /referrals/status → referralService.getStatus({ userId: req.user.id, ... })
```

**Tests:** `backend/src/modules/referrals/routes.test.js`
- GET /referrals/code → 200, code returned
- POST /referrals/share → 200, valid channels accepted
- POST /referrals/share invalid channel → 400
- GET /referrals/status → 200, summary + items

---

## 17. Seller API Routes

---

### File: `backend/src/modules/boosts/routes.js`
**Purpose:** Express router for seller boost operations: purchase, history.
**Depends on:** `→ services/reward-boosts.js`, `→ middleware/auth.js`, `→ rewards/validators.js`
**Key routes:**

```js
/**
 * @param {{ db, config, analytics, boostService }} deps
 * @returns {express.Router}
 */
function createBoostsRouter(deps)

  // POST /boosts/purchase → boostService.purchase(...)
  // GET /boosts/history → boostService.getHistory({ sellerUserId: req.user.id, ... })
```

**Tests:** `backend/src/modules/boosts/routes.test.js`
- POST /boosts/purchase → 201
- POST /boosts/purchase not product owner → 403
- GET /boosts/history → 200, paginated

---

### File: `backend/src/modules/seller-analytics/routes.js`
**Purpose:** Express router for seller analytics: performance metrics and ranking breakdown.
**Depends on:** `→ services/reward-ranking.js`, `→ middleware/auth.js`
**Key routes:**

```js
/**
 * @param {{ db, config, analytics, rankingService }} deps
 * @returns {express.Router}
 */
function createSellerAnalyticsRouter(deps)

  // GET /seller/analytics/performance → rankingService.getSellerPerformance(...)
  // GET /seller/analytics/ranking → rankingService.getRankingBreakdown(...)
```

**Tests:** `backend/src/modules/seller-analytics/routes.test.js`
- GET /seller/analytics/performance?period=30d → 200
- GET /seller/analytics/ranking → 200, includes organic breakdown

---

## 18. Cron Jobs

---

### File: `backend/src/cron/reward-jobs.js`
**Purpose:** Defines all scheduled background jobs for the rewards system. Uses `node-cron` for scheduling. Each job calls the corresponding service's batch method.
**Depends on:** `→ ALL services` (receives them via dependency injection)
**Key functions:**

```js
/**
 * @param {{
 *   streakService, tierService, referralService, challengeService,
 *   ledgerService, trustService, boostService, rankingService,
 *   notificationService, logger
 * }} deps
 * @returns {{ start: () => void, stop: () => void }}
 */
function createRewardCronJobs(deps)
```

**Job schedule:**

| Job | Cron Expression | Service Method | Description |
|-----|----------------|----------------|-------------|
| Streak break scan | `15 0 * * *` (00:15 UTC daily) | `streakService.batchBreakDetection()` | Detect missed check-ins, apply shields or break streaks |
| Tier requalification | `0 2 * * *` (02:00 UTC daily) | `tierService.batchRequalify()` | Recalculate 12m points, upgrade/downgrade tiers |
| Referral hold release | `0 * * * *` (every hour) | `referralService.batchReleaseHolds()` | Release or extend referral reward holds |
| Challenge expiration | `0 3 * * *` (03:00 UTC daily) | `challengeService.batchExpire()` | Expire incomplete challenges |
| Points expiration warning | `0 4 * * *` (04:00 UTC daily) | `ledgerService` + `notificationService` | Warn users approaching 12-month inactivity |
| Points expiration | `30 4 * * *` (04:30 UTC daily) | `ledgerService` | Expire points for inactive accounts |
| Trust score recalc | `0 */6 * * *` (every 6 hours) | `trustService.batchRecalculate()` | Batch recalculate trust scores |
| Ranking signal refresh | `*/15 * * * *` (every 15 min) | `rankingService.batchComputeSignals()` | Refresh organic ranking signals |
| Boost expiration | `*/30 * * * *` (every 30 min) | `boostService.batchExpireBoosts()` | Mark exhausted/expired boosts |

**Error handling:** Each job wraps its execution in try/catch. Failures are logged but never crash the process.

**Tests:** `backend/src/cron/reward-jobs.test.js`
- Verify `start()` registers all 9 cron schedules
- Verify `stop()` cancels all schedules
- Verify each job calls the correct service method
- Verify errors are caught and logged, not thrown

---

## 19. App.js Integration

---

### File: `backend/src/app.js` (MODIFY — do not rewrite)
**Purpose:** Register new reward modules and services in the existing Express app factory.
**Changes to make:**

```js
// 1. Add new service imports at the top:
const { createRewardConfigService } = require('./services/reward-config');
const { createRewardLedgerService } = require('./services/reward-ledger');
const { createRewardRulesEngine } = require('./services/reward-rules-engine');
const { createTierService } = require('./services/reward-tiers');
const { createStreakService } = require('./services/reward-streaks');
const { createChallengeService } = require('./services/reward-challenges');
const { createReferralService } = require('./services/reward-referrals');
const { createTrustService } = require('./services/reward-trust');
const { createBoostService } = require('./services/reward-boosts');
const { createRankingService } = require('./services/reward-ranking');
const { createRewardCheckoutService } = require('./services/reward-checkout');
const { createRewardNotificationService } = require('./services/reward-notifications');
const { createAdminRewardService } = require('./services/reward-admin');

// 2. Add new router imports:
const { createRewardsRouter } = require('./modules/rewards/routes');
const { createReferralsRouter } = require('./modules/referrals/routes');
const { createBoostsRouter } = require('./modules/boosts/routes');
const { createSellerAnalyticsRouter } = require('./modules/seller-analytics/routes');

// 3. Inside createApp(), instantiate services in dependency order:
const rewardConfig = createRewardConfigService({ db, logger });
const ledgerService = createRewardLedgerService({ db, config, rewardConfig, logger });
const rulesEngine = createRewardRulesEngine({ rewardConfig });
const tierService = createTierService({ db, rewardConfig, rulesEngine, ledgerService, analytics, logger });
const streakService = createStreakService({ db, rewardConfig, rulesEngine, ledgerService, analytics, logger });
const challengeService = createChallengeService({ db, ledgerService, rewardConfig, analytics, logger });
const referralService = createReferralService({ db, ledgerService, rewardConfig, analytics, logger });
const trustService = createTrustService({ db, ledgerService, analytics, logger });
const boostService = createBoostService({ db, trustService, monetizationGateway: app.locals.monetizationGateway, analytics, logger });
const rankingService = createRankingService({ db, trustService, boostService, analytics, logger });
const checkoutService = createRewardCheckoutService({
  db, ledgerService, rulesEngine, tierService, streakService,
  challengeService, referralService, rankingService, trustService,
  analytics, logger
});
const rewardNotifications = createRewardNotificationService({
  pushNotifications: app.locals.pushNotifications, db, logger
});
const adminRewardService = createAdminRewardService({
  db, ledgerService, referralService, trustService,
  tierService, streakService, boostService, analytics, logger
});

// 4. Register routes:
apiRouter.use('/rewards', createRewardsRouter({
  db, config, analytics, ledgerService, rulesEngine,
  tierService, streakService, challengeService, checkoutService
}));
apiRouter.use('/referrals', createReferralsRouter({
  db, config, analytics, referralService
}));
apiRouter.use('/boosts', createBoostsRouter({
  db, config, analytics, boostService
}));
apiRouter.use('/seller/analytics', searchReadLimiter, createSellerAnalyticsRouter({
  db, config, analytics, rankingService
}));

// 5. Extend existing admin router registration to pass new services
// (add adminRewardService, trustService to admin router deps)

// 6. Store services on app.locals for monetization webhook hook access:
app.locals.checkoutService = checkoutService;
```

---

### File: `backend/src/index.js` (MODIFY — do not rewrite)
**Purpose:** Add reward config preload at startup and cron job initialization.
**Changes to make:**

```js
// 1. Import cron:
const { createRewardCronJobs } = require('./cron/reward-jobs');

// 2. After app creation, preload config:
// await rewardConfig.preload();  -- called inside createApp or here

// 3. Start cron jobs:
const rewardCron = createRewardCronJobs({
  streakService, tierService, referralService, challengeService,
  ledgerService, trustService, boostService, rankingService,
  notificationService: rewardNotifications, logger
});
rewardCron.start();

// 4. In shutdown(), add:
rewardCron.stop();
```

---

## 20. Mobile Types & API Client

---

### File: `mobile/src/types/rewards.ts`
**Purpose:** TypeScript type definitions for all reward-related API responses and state.
**Depends on:** Nothing (standalone types)
**Key types:**

```typescript
// Tier enum
export type RewardTier = 'explorer' | 'member' | 'insider' | 'vip' | 'elite';

// Account state (from GET /rewards/balance)
export interface RewardAccountState {
  user_id: number;
  balance: number;
  balance_dollar_value_minor: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
  tier: RewardTier;
  tier_multiplier: number;
  tier_next: RewardTier | null;
  tier_next_threshold: number | null;
  tier_progress_points: number;
  rolling_12m_points: number;
  streak: StreakState;
  daily_earn: DailyEarnState;
  is_frozen: boolean;
}

export interface StreakState {
  current: number;
  longest: number;
  multiplier: number;
  shields_remaining: number;
  last_checkin_date: string | null;
  checked_in_today: boolean;
}

export interface DailyEarnState {
  earned_today: number;
  cap_today: number;
  remaining_today: number;
}

// Ledger entry (from GET /rewards/history)
export interface LedgerEntry {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  source: string;
  description: string | null;
  tier_at_time: string | null;
  multiplier_applied: number;
  created_at: string;
  expires_at: string | null;
  voided_at: string | null;
}

// Referral types
export interface ReferralCode {
  code: string;
  share_url: string;
  is_active: boolean;
  total_uses: number;
  monthly_uses: number;
  monthly_cap: number;
  monthly_remaining: number;
}

export interface ReferralSummary {
  total_referrals: number;
  qualified: number;
  rewarded: number;
  pending: number;
  rejected: number;
  expired: number;
  total_earned_dp: number;
  pending_reward_dp: number;
  monthly_uses: number;
  monthly_cap: number;
}

export interface ReferralItem {
  referral_id: string;
  referee_display_name: string;
  status: string;
  created_at: string;
  qualified_at: string | null;
  reward: ReferralRewardInfo | null;
}

export interface ReferralRewardInfo {
  reward_id: string;
  amount: number;
  currency: string;
  status: 'held' | 'released' | 'forfeited';
  hold_until?: string;
  hold_days_remaining?: number;
  released_at?: string;
}

// Checkout eligibility
export interface CheckoutEligibility {
  user_id: number;
  order_amount_minor: number;
  redemption: RedemptionEligibility;
  earning: EarnEligibility;
  referral_discount: ReferralDiscountEligibility;
  challenges_progressed: ChallengeProgress[];
}

export interface RedemptionEligibility {
  eligible: boolean;
  balance_available: number;
  max_redeemable_points: number;
  max_redeemable_reason: string;
  max_dollar_value_minor: number;
  min_redemption_points: number;
}

export interface EarnEligibility {
  eligible: boolean;
  base_points: number;
  tier_multiplier: number;
  streak_multiplier: number;
  combined_multiplier: number;
  estimated_earn: number;
  daily_cap_remaining: number;
  earn_after_cap: number;
  tier: RewardTier;
}

// Boost types
export interface BoostPurchase {
  boost_id: string;
  product_id: number;
  product_title: string;
  boost_type: 'standard' | 'premium' | 'featured';
  boost_multiplier: number;
  budget_minor: number;
  spent_minor: number;
  remaining_minor: number;
  impression_count: number;
  status: string;
  starts_at: string;
  ends_at: string | null;
  days_remaining: number;
}

// Paginated response
export interface PaginatedResponse<T> {
  items: T[];
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}
```

**Tests:** No tests for type-only files.

---

### File: `mobile/src/lib/rewards.ts`
**Purpose:** API client functions for all reward endpoints. Uses the existing `apiRequest` helper.
**Depends on:** `→ mobile/src/lib/api.ts` (existing), `→ mobile/src/types/rewards.ts`
**Key functions:**

```typescript
import { apiRequest } from './api';
import type {
  RewardAccountState, LedgerEntry, ReferralCode, ReferralSummary,
  ReferralItem, CheckoutEligibility, BoostPurchase, PaginatedResponse
} from '../types/rewards';

export async function fetchBalance(): Promise<{ data: RewardAccountState }>;

export async function fetchHistory(params?: {
  limit?: number; cursor?: string; type?: string; source?: string;
}): Promise<PaginatedResponse<LedgerEntry>>;

export async function redeemPoints(params: {
  points_amount: number; order_id: number;
}): Promise<{ ok: boolean; data: any }>;

export async function checkIn(): Promise<{ data: any }>;

export async function fetchReferralCode(): Promise<{ data: ReferralCode }>;

export async function shareReferral(params: {
  channel: string; referral_code: string;
}): Promise<{ ok: boolean }>;

export async function fetchReferralStatus(params?: {
  limit?: number; cursor?: string; status?: string;
}): Promise<{ summary: ReferralSummary; items: ReferralItem[]; hasMore: boolean; nextCursor: string | null }>;

export async function fetchCheckoutEligibility(params: {
  order_amount_minor: number; product_id?: number; seller_user_id?: number;
}): Promise<{ data: CheckoutEligibility }>;

export async function applyCheckoutRewards(params: {
  checkout_session_id: number; points_amount: number;
}): Promise<{ ok: boolean; data: any }>;

export async function purchaseBoost(params: {
  product_id: number; boost_type: string; budget_minor: number; duration_days?: number;
}): Promise<{ ok: boolean; data: any }>;

export async function fetchBoostHistory(params?: {
  limit?: number; cursor?: string; status?: string;
}): Promise<PaginatedResponse<BoostPurchase>>;

export async function fetchSellerPerformance(period?: string): Promise<{ data: any }>;

export async function fetchSellerRanking(productId?: number): Promise<{ data: any }>;
```

**Tests:** `mobile/src/lib/rewards.test.ts`
- Each function calls `apiRequest` with correct path, method, and params
- Error responses are propagated correctly

---

## 21. Config & Environment

---

### File: `backend/src/config/env.js` (MODIFY — do not rewrite)
**Purpose:** Add new environment variables for the rewards system.
**Changes to add:**

```js
// In the loadEnv() function, add:

// Rewards config (all optional — defaults come from reward_rules_config table)
rewardCronEnabled: parseBoolean(env.REWARD_CRON_ENABLED, true),

// Node-cron dependency (for scheduling)
// No new env vars needed — cron schedules are hardcoded in reward-jobs.js
// and business rule values come from the DB config table.
```

**Note:** Most reward config comes from `reward_rules_config` table, NOT from env vars. The only env-level config is the cron on/off toggle for environments where cron should be disabled (e.g., test).

---

### File: `backend/.env.example` (MODIFY)
**Purpose:** Document new env vars.
**Add:**

```
# Rewards Engine
REWARD_CRON_ENABLED=true    # Set to false to disable reward cron jobs (useful in test)
```

---

## 22. Dependency Graph

This visual shows which files depend on which. Build from left to right.

```
PHASE 1: Foundation (no internal deps)
═══════════════════════════════════════════════════════════════════

  rewards/constants.js ──────────┐
  rewards/validators.js ─────────┤
  migrations (already done) ─────┤
                                 │
PHASE 2: Config Layer            │
═══════════════════════════════  │
                                 │
  services/reward-config.js ─────┤
                                 │
PHASE 3: Core Services           │
═══════════════════════════════  │
                                 ▼
  services/reward-ledger.js ────────► depends on: reward-config
  services/reward-rules-engine.js ──► depends on: reward-config
                                 │
PHASE 4: Domain Services         │
═══════════════════════════════  │
                                 ▼
  services/reward-tiers.js ────────► depends on: ledger, rules-engine, config
  services/reward-streaks.js ──────► depends on: ledger, rules-engine, config
  services/reward-challenges.js ───► depends on: ledger, config
  services/reward-referrals.js ────► depends on: ledger, config
  services/reward-trust.js ────────► depends on: ledger
  services/reward-boosts.js ───────► depends on: trust
  services/reward-ranking.js ──────► depends on: trust, boosts
                                 │
PHASE 5: Orchestration           │
═══════════════════════════════  │
                                 ▼
  services/reward-checkout.js ─────► depends on: ALL Phase 3+4 services
  services/reward-notifications.js ► depends on: push-notifications (existing)
  services/reward-admin.js ────────► depends on: ALL Phase 3+4 services
                                 │
PHASE 6: Routes & Integration    │
═══════════════════════════════  │
                                 ▼
  modules/rewards/routes.js ───────► depends on: Phase 5 services
  modules/referrals/routes.js ─────► depends on: referral service
  modules/boosts/routes.js ────────► depends on: boost service
  modules/seller-analytics/routes.js ► depends on: ranking service
  cron/reward-jobs.js ─────────────► depends on: ALL services
  app.js (modifications) ─────────► depends on: ALL above
  index.js (modifications) ───────► depends on: app.js, cron
                                 │
PHASE 7: Mobile                  │
═══════════════════════════════  │
                                 ▼
  mobile/src/types/rewards.ts ─────► standalone
  mobile/src/lib/rewards.ts ───────► depends on: types, existing api client
```

---

## Implementation Order Checklist

Copy this checklist and check off items as you complete them:

```
### Phase 1: Foundation
- [ ] backend/src/modules/rewards/constants.js + tests
- [ ] backend/src/modules/rewards/validators.js + tests
- [ ] Verify migrations: npm run migrate:up && npm run migrate:down && npm run migrate:up

### Phase 2: Config
- [ ] backend/src/services/reward-config.js + tests
- [ ] Verify config service reads all 42 seeded values correctly

### Phase 3: Core
- [ ] backend/src/services/reward-ledger.js + tests
- [ ] backend/src/services/reward-rules-engine.js + tests
- [ ] npm test — all passing

### Phase 4: Domain Services
- [ ] backend/src/services/reward-tiers.js + tests
- [ ] backend/src/services/reward-streaks.js + tests
- [ ] backend/src/services/reward-challenges.js + tests
- [ ] backend/src/services/reward-referrals.js + tests
- [ ] backend/src/services/reward-trust.js + tests
- [ ] backend/src/services/reward-boosts.js + tests
- [ ] backend/src/services/reward-ranking.js + tests
- [ ] npm test — all passing

### Phase 5: Orchestration
- [ ] backend/src/services/reward-checkout.js + tests
- [ ] backend/src/services/reward-notifications.js + tests
- [ ] backend/src/services/reward-admin.js + tests
- [ ] npm test — all passing

### Phase 6: Routes & Integration
- [ ] backend/src/modules/rewards/routes.js + integration tests
- [ ] backend/src/modules/referrals/routes.js + integration tests
- [ ] backend/src/modules/boosts/routes.js + integration tests
- [ ] backend/src/modules/seller-analytics/routes.js + integration tests
- [ ] backend/src/cron/reward-jobs.js + tests
- [ ] backend/src/app.js modifications
- [ ] backend/src/index.js modifications
- [ ] backend/src/config/env.js modifications
- [ ] backend/.env.example update
- [ ] npm test — ALL passing
- [ ] npm run migrate:up — clean on fresh DB

### Phase 7: Mobile
- [ ] mobile/src/types/rewards.ts
- [ ] mobile/src/lib/rewards.ts + tests
- [ ] Mobile screens (separate plan — not in scope here)
```

---

## File Count Summary

| Category | New Files | Modified Files | Test Files |
|----------|-----------|---------------|------------|
| Constants & validators | 2 | 0 | 2 |
| Migrations | 3 (already done) | 0 | 0 |
| Services | 12 | 0 | 12 |
| Routes | 4 | 0 | 4 |
| Cron | 1 | 0 | 1 |
| Integration | 0 | 3 (app.js, index.js, env.js) | 0 |
| Config | 0 | 1 (.env.example) | 0 |
| Mobile | 2 | 0 | 1 |
| **Total** | **24** | **4** | **20** |

**Grand total: 24 new files + 4 modified files + 20 test files = 48 files**

---

*End of Implementation Plan — April 2026*
