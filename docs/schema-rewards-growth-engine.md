# Deenly Rewards & Growth Engine — Database Schema Reference

> Version 1.0 — April 2026
> Status: Ready for Review
> Source of Truth: Business Rules & Economics Specification
> Migrations: `1730000040000`, `1730000041000`, `1730000042000`

---

## Table of Contents

1. [Schema Overview](#1-schema-overview)
2. [Table Definitions](#2-table-definitions)
   - 2.1 [reward_accounts](#21-reward_accounts)
   - 2.2 [reward_ledger_entries](#22-reward_ledger_entries)
   - 2.3 [reward_redemptions](#23-reward_redemptions)
   - 2.4 [reward_rules_config](#24-reward_rules_config)
   - 2.5 [referral_codes](#25-referral_codes)
   - 2.6 [referral_relationships](#26-referral_relationships)
   - 2.7 [referral_events](#27-referral_events)
   - 2.8 [referral_rewards](#28-referral_rewards)
   - 2.9 [challenge_definitions](#29-challenge_definitions)
   - 2.10 [user_challenges](#210-user_challenges)
   - 2.11 [boost_purchases](#211-boost_purchases)
   - 2.12 [boost_impressions](#212-boost_impressions)
   - 2.13 [ranking_signals](#213-ranking_signals)
   - 2.14 [seller_trust_profiles](#214-seller_trust_profiles)
   - 2.15 [fraud_flags](#215-fraud_flags)
   - 2.16 [admin_actions](#216-admin_actions)
3. [Entity Relationship Map](#3-entity-relationship-map)
4. [Schema Rules](#4-schema-rules)
5. [Migration Strategy](#5-migration-strategy)
6. [Indexing Strategy](#6-indexing-strategy)
7. [Integration with Existing Schema](#7-integration-with-existing-schema)

---

## 1. Schema Overview

The Rewards & Growth Engine schema adds **16 tables** across 3 migration files, organized by domain:

| Migration | Domain | Tables | Purpose |
|-----------|--------|--------|---------|
| `1730000040000` | Rewards Core | `reward_accounts`, `reward_ledger_entries`, `reward_redemptions`, `reward_rules_config` | Points economy, balances, earn/redeem, business rules |
| `1730000041000` | Referrals & Challenges | `referral_codes`, `referral_relationships`, `referral_events`, `referral_rewards`, `challenge_definitions`, `user_challenges` | Two-sided referrals, challenge lifecycle |
| `1730000042000` | Trust, Boost & Admin | `boost_purchases`, `boost_impressions`, `ranking_signals`, `seller_trust_profiles`, `fraud_flags`, `admin_actions` | Seller boosts, organic ranking, trust scoring, fraud detection, audit trail |

### ID Strategy

- **Primary keys**: `uuid` via `gen_random_uuid()` — all 16 new tables use UUIDs for their own PKs.
- **Foreign keys to existing tables**: `integer` — matching `users.id` (serial), `orders.id` (serial), `creator_products.id` (serial).
- **Foreign keys within rewards domain**: `uuid` — matching the new tables' UUID PKs.

### Immutability Rules Summary

| Table | Mutable? | Rule |
|-------|----------|------|
| `reward_ledger_entries` | **Immutable** | Never UPDATE or DELETE. Corrections are new entries. Voiding sets `voided_at` only. |
| `referral_events` | **Immutable** | Append-only lifecycle log. |
| `admin_actions` | **Immutable** | Append-only audit trail. No UPDATE or DELETE ever. |
| `boost_impressions` | **Immutable** | Append-only impression log. |
| All other tables | Mutable | Have `updated_at` column, allow status transitions. |

---

## 2. Table Definitions

### 2.1 reward_accounts

**Purpose:** One row per user. Holds the user's current reward state — balance, tier, streak, daily cap tracking. The `balance` column is a denormalized aggregate maintained in sync with `reward_ledger_entries` via application-level transactions (and eventually a DB trigger).

**Cardinality:** 1:1 with `users`.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | integer | NO | — | FK → `users(id)`, UNIQUE, CASCADE |
| `balance` | integer | NO | 0 | Current DP balance. Derived from ledger, trigger-maintained. **Never update directly.** |
| `lifetime_earned` | integer | NO | 0 | Total DP ever earned (credits only) |
| `lifetime_redeemed` | integer | NO | 0 | Total DP ever redeemed (debits for redemption) |
| `tier` | varchar(20) | NO | `'explorer'` | Current tier: explorer, member, insider, vip, elite |
| `tier_qualified_at` | timestamptz | YES | — | When user last qualified for current tier |
| `tier_grace_until` | timestamptz | YES | — | Deadline before downgrade if user fails requalification |
| `rolling_12m_points` | integer | NO | 0 | Points earned in rolling 12-month window (for tier qualification) |
| `streak_current` | integer | NO | 0 | Current consecutive day streak |
| `streak_longest` | integer | NO | 0 | All-time longest streak |
| `streak_last_checkin_date` | date | YES | — | Date of last daily check-in |
| `streak_shields_remaining` | integer | NO | 0 | Shields left to protect streak on missed days |
| `streak_multiplier` | numeric(3,2) | NO | 1.00 | Current streak multiplier (1.00–3.00) |
| `points_earned_today` | integer | NO | 0 | DP earned today (reset daily, used for cap enforcement) |
| `points_earned_today_date` | date | YES | — | Date the `points_earned_today` counter applies to |
| `is_frozen` | boolean | NO | false | Account frozen by fraud/admin action |
| `frozen_reason` | varchar(100) | YES | — | Why the account was frozen |
| `frozen_at` | timestamptz | YES | — | When the freeze was applied |
| `last_activity_at` | timestamptz | NO | `current_timestamp` | Last reward-related activity (for inactivity expiration) |
| `created_at` | timestamptz | NO | `current_timestamp` | Row creation time |
| `updated_at` | timestamptz | NO | `current_timestamp` | Last modification time |

**Constraints:**
- `UNIQUE(user_id)` — one account per user
- `tier IN ('explorer','member','insider','vip','elite')`
- `balance >= 0`
- `lifetime_earned >= 0`
- `lifetime_redeemed >= 0`
- `streak_current >= 0`
- `streak_shields_remaining >= 0`
- `streak_multiplier >= 1.00`
- `rolling_12m_points >= 0`

**Indexes:**
- `user_id` — primary lookup
- `tier` — admin dashboards, tier distribution queries
- `streak_last_checkin_date` — nightly streak-break cron
- `last_activity_at` — inactivity expiration cron

**Soft delete:** No. Accounts are frozen, never deleted. Cascade from `users(id)` handles user deletion.

---

### 2.2 reward_ledger_entries

**Purpose:** Append-only, immutable ledger. **Source of truth for all point balances.** Every earn, redeem, void, and expiration is a row in this table. Balances are derived by summing credits minus debits.

**Cardinality:** Many per user. High-volume table.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | integer | NO | — | FK → `users(id)`, CASCADE |
| `type` | varchar(10) | NO | — | `'credit'` or `'debit'` |
| `amount` | integer | NO | — | Positive integer. Always > 0. Direction is indicated by `type`. |
| `balance_after` | integer | NO | — | User's balance AFTER this entry. Enables point-in-time balance lookup. |
| `source` | varchar(40) | NO | — | What triggered this entry (see source enum below) |
| `source_ref_type` | varchar(30) | YES | — | Type of the source reference: `'order'`, `'referral'`, `'challenge'`, etc. |
| `source_ref_id` | varchar(64) | YES | — | ID of the source reference (order ID, referral ID, etc.) |
| `description` | varchar(255) | YES | — | Human-readable description for admin/user display |
| `tier_at_time` | varchar(20) | YES | — | User's tier when this entry was created |
| `multiplier_applied` | numeric(4,2) | YES | 1.00 | Combined multiplier (tier × streak) applied to this earn |
| `idempotency_key` | varchar(128) | YES | — | Dedup key. Unique where not null. Prevents duplicate earns. |
| `metadata` | jsonb | YES | `'{}'` | Additional context (e.g., original order amount, merchant name) |
| `expires_at` | timestamptz | YES | — | When these points expire (null = never) |
| `voided_at` | timestamptz | YES | — | Set when points are voided (fraud, refund clawback). **Only mutable column.** |
| `voided_reason` | varchar(255) | YES | — | Why points were voided |
| `created_at` | timestamptz | NO | `current_timestamp` | When this entry was created. Immutable. |

**Source enum values (credit sources):**
- `purchase` — Points earned from a purchase (10 DP/$1 × tier multiplier × streak multiplier)
- `referral_earned` — Referrer reward after hold release (250 DP)
- `referral_bonus` — Referee signup bonus
- `streak_bonus` — Bonus points from daily check-in
- `challenge_reward` — Points from completing a challenge
- `tier_bonus` — Bonus points on tier upgrade
- `manual_credit` — Admin-issued credit with audit trail
- `signup_bonus` — One-time signup bonus (50 DP)
- `review` — Points for writing a product review

**Source enum values (debit sources):**
- `redemption` — Points redeemed at checkout
- `expiration` — Points expired due to 12-month inactivity
- `manual_debit` — Admin-issued debit with audit trail
- `fraud_void` — Points voided due to fraud detection
- `refund_clawback` — Points clawed back when originating order is refunded

**Constraints:**
- `type IN ('credit','debit')`
- `amount > 0` — always positive; direction from `type`
- `source IN (...)` — enumerated list of valid sources
- `balance_after >= 0` — balance can never go negative

**Indexes:**
- `(user_id, created_at)` — primary query: "show me user X's point history"
- `(source, created_at)` — admin query: "all purchase earns this week"
- `idempotency_key` (unique, partial where NOT NULL) — dedup enforcement
- `(source_ref_type, source_ref_id)` — "find all entries for order #123"
- `expires_at` (partial where NOT NULL AND voided_at IS NULL) — expiration cron
- `(user_id, source, created_at)` — velocity checks: "how many purchase earns did user X have today?"
- `(user_id, source_ref_type, source_ref_id)` where `source = 'purchase' AND voided_at IS NULL` — purchase dedup safety net

**Immutability rule:** Application code must NEVER issue UPDATE or DELETE on this table. The only exception is setting `voided_at` and `voided_reason` on fraud void or refund clawback — this is a soft-void, not a delete. Corrections are new entries (e.g., a debit entry to reverse an incorrect credit).

---

### 2.3 reward_redemptions

**Purpose:** Tracks user requests to redeem DP for dollar discounts at checkout. Linked to the ledger entry that debited the points and the order where the discount was applied.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | integer | NO | — | FK → `users(id)`, CASCADE |
| `ledger_entry_id` | uuid | YES | — | FK → `reward_ledger_entries(id)`, SET NULL. The debit entry. |
| `order_id` | integer | YES | — | FK → `orders(id)`, SET NULL. The order this discount was applied to. |
| `points_amount` | integer | NO | — | DP redeemed |
| `dollar_value_minor` | integer | NO | — | Dollar value in cents (points_amount ÷ 100) |
| `status` | varchar(20) | NO | `'pending'` | Lifecycle: pending → applied → (reversed if refund) |
| `applied_at` | timestamptz | YES | — | When discount was confirmed applied |
| `reversed_at` | timestamptz | YES | — | When redemption was reversed (order refund) |
| `reverse_reason` | varchar(255) | YES | — | Why the redemption was reversed |
| `created_at` | timestamptz | NO | `current_timestamp` | Row creation |
| `updated_at` | timestamptz | NO | `current_timestamp` | Last update |

**Constraints:**
- `points_amount >= 500` — minimum 500 DP redemption ($5 value, per Business Rules)
- `dollar_value_minor > 0`
- `status IN ('pending','applied','reversed','expired')`
- `dollar_value_minor <= 2000` — max $20 redemption cap per order (per Business Rules: 15% or $20 cap)

**Indexes:**
- `(user_id, created_at)` — user's redemption history
- `order_id` — lookup redemption by order
- `status` — admin queue for pending/reversed

**Soft delete:** No. Reversed redemptions stay with `status = 'reversed'` for audit trail.

---

### 2.4 reward_rules_config

**Purpose:** Runtime-configurable key-value store for all reward business rules. Allows ops to change point rates, caps, thresholds, and multipliers without code deploys. Seeded with defaults from the Business Rules specification.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `rule_key` | varchar(100) | NO | — | Unique key name |
| `rule_value` | jsonb | NO | — | The value (number, string, object — stored as JSONB for flexibility) |
| `description` | varchar(500) | YES | — | Human-readable description of what this rule controls |
| `updated_by` | integer | YES | — | FK → `users(id)`, SET NULL. Admin who last changed this value. |
| `created_at` | timestamptz | NO | `current_timestamp` | Row creation |
| `updated_at` | timestamptz | NO | `current_timestamp` | Last update |

**Seeded values (42 rules):**

| Category | Key | Default | Business Rules Reference |
|----------|-----|---------|--------------------------|
| Earning | `points_per_dollar` | 10 | 10 DP per $1 spent |
| Earning | `min_order_amount_minor` | 2500 | $25 minimum order |
| Redemption | `min_redemption_points` | 500 | 500 DP minimum ($5) |
| Redemption | `max_redemption_pct` | 15 | 15% of order max |
| Redemption | `max_redemption_cap_minor` | 2000 | $20 hard cap |
| Redemption | `points_to_dollar_ratio` | 100 | 100 DP = $1 |
| Daily Caps | `daily_earn_cap_explorer` | 500 | Explorer tier daily max |
| Daily Caps | `daily_earn_cap_member` | 750 | Member tier daily max |
| Daily Caps | `daily_earn_cap_insider` | 1000 | Insider tier daily max |
| Daily Caps | `daily_earn_cap_vip` | 1500 | VIP tier daily max |
| Daily Caps | `daily_earn_cap_elite` | 2500 | Elite tier daily max |
| Tiers | `tier_threshold_explorer` | 0 | 0 DP threshold |
| Tiers | `tier_threshold_member` | 1000 | 1,000 DP in 12 months |
| Tiers | `tier_threshold_insider` | 5000 | 5,000 DP in 12 months |
| Tiers | `tier_threshold_vip` | 15000 | 15,000 DP in 12 months |
| Tiers | `tier_threshold_elite` | 50000 | 50,000 DP in 12 months |
| Tiers | `tier_multiplier_explorer` | 1.00 | 1× earn rate |
| Tiers | `tier_multiplier_member` | 1.25 | 1.25× earn rate |
| Tiers | `tier_multiplier_insider` | 1.50 | 1.5× earn rate |
| Tiers | `tier_multiplier_vip` | 2.00 | 2× earn rate |
| Tiers | `tier_multiplier_elite` | 3.00 | 3× earn rate |
| Tiers | `tier_grace_period_days` | 30 | 30-day grace before downgrade |
| Streaks | `streak_multiplier_1_6` | 1.00 | Days 1–6: 1× |
| Streaks | `streak_multiplier_7_13` | 1.50 | Days 7–13: 1.5× |
| Streaks | `streak_multiplier_14_30` | 2.00 | Days 14–30: 2× |
| Streaks | `streak_multiplier_31_plus` | 3.00 | Days 31+: 3× |
| Streaks | `streak_shields_explorer` | 0 | Explorer: 0 shields |
| Streaks | `streak_shields_member` | 1 | Member: 1 shield |
| Streaks | `streak_shields_insider` | 2 | Insider: 2 shields |
| Streaks | `streak_shields_vip` | 3 | VIP: 3 shields |
| Streaks | `streak_shields_elite` | 5 | Elite: 5 shields |
| Referrals | `referral_referrer_reward_dp` | 250 | 250 DP to referrer |
| Referrals | `referral_referee_discount_minor` | 500 | $5 discount to referee |
| Referrals | `referral_hold_days` | 14 | 14-day hold period |
| Referrals | `referral_monthly_cap` | 20 | Max 20 referrals/month |
| Referrals | `referral_min_purchase_minor` | 2500 | $25 min purchase to qualify |
| Velocity | `velocity_max_transactions_per_hour` | 10 | Anti-gaming: 10/hr |
| Velocity | `velocity_max_transactions_per_day` | 50 | Anti-gaming: 50/day |
| Velocity | `velocity_duplicate_window_seconds` | 300 | 5-min duplicate window |
| Expiration | `points_inactivity_expiration_months` | 12 | 12 months inactivity |
| Bonus | `signup_bonus_dp` | 50 | 50 DP on signup |

**Constraints:**
- `UNIQUE(rule_key)`

**Note:** Application code reads these values via a service function (`getRewardConfig(key)`) and caches in memory with a short TTL. Updates are admin-only and logged in `admin_actions`.

---

### 2.5 referral_codes

**Purpose:** Each user can have one active referral code — a short, shareable string. Codes are unique across the system. A user may deactivate a code and create a new one.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | integer | NO | — | FK → `users(id)`, CASCADE |
| `code` | varchar(20) | NO | — | Unique shareable code (e.g., "AHMED2026") |
| `is_active` | boolean | NO | true | Whether this code can still be used |
| `total_uses` | integer | NO | 0 | How many times this code has been used |
| `created_at` | timestamptz | NO | `current_timestamp` | Row creation |
| `deactivated_at` | timestamptz | YES | — | When the code was deactivated |

**Constraints:**
- `UNIQUE(code)` — globally unique codes
- `total_uses >= 0`
- Partial unique index: one active code per user (`UNIQUE(user_id) WHERE is_active = true`)

**Indexes:**
- `user_id` — lookup user's codes
- `code` (unique) — code lookup at signup

---

### 2.6 referral_relationships

**Purpose:** Links a referrer to a referee. Created at referee signup when they use a referral code. One referrer per referee (enforced by unique constraint on `referee_user_id`).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `referrer_user_id` | integer | NO | — | FK → `users(id)`, CASCADE |
| `referee_user_id` | integer | NO | — | FK → `users(id)`, CASCADE. **UNIQUE** — one referrer per referee. |
| `referral_code_id` | uuid | NO | — | FK → `referral_codes(id)`, CASCADE |
| `status` | varchar(20) | NO | `'pending'` | Lifecycle: pending → qualified → rewarded (or rejected/expired) |
| `device_fingerprint` | varchar(128) | YES | — | Referee's device fingerprint at signup (fraud detection) |
| `signup_ip` | varchar(45) | YES | — | Referee's IP at signup (fraud: IP overlap detection) |
| `qualified_at` | timestamptz | YES | — | When referee met qualification criteria (first purchase ≥ $25) |
| `created_at` | timestamptz | NO | `current_timestamp` | When referral link was established |
| `updated_at` | timestamptz | NO | `current_timestamp` | Last status change |

**Constraints:**
- `UNIQUE(referee_user_id)` — a user can only be referred once
- `referrer_user_id != referee_user_id` — self-referral prevention (DB-level enforcement)
- `status IN ('pending','qualified','rewarded','rejected','expired')`

**Indexes:**
- `(referrer_user_id, created_at)` — "show me all my referrals"
- `referee_user_id` — reverse lookup
- `referral_code_id` — code performance tracking
- `status` — admin queue filters

**Fraud checks (application level):**
- IP overlap: same `signup_ip` across multiple referees of the same referrer
- Device overlap: same `device_fingerprint` across multiple referees
- Monthly cap: count referrals per referrer in current month ≤ 20

---

### 2.7 referral_events

**Purpose:** Append-only lifecycle log for referral state transitions. Provides a complete audit trail of how each referral progressed.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `referral_id` | uuid | NO | — | FK → `referral_relationships(id)`, CASCADE |
| `event_type` | varchar(30) | NO | — | Type of lifecycle event (see enum) |
| `metadata` | jsonb | YES | `'{}'` | Event-specific data (e.g., order_id for first_purchase) |
| `created_at` | timestamptz | NO | `current_timestamp` | When event occurred |

**Event type enum:**
- `code_used` — Referee entered the code
- `signup_completed` — Referee finished registration
- `first_purchase` — Referee made first qualifying purchase
- `qualified` — Referral met all qualification criteria
- `hold_started` — 14-day reward hold period began
- `hold_extended` — Hold period extended (e.g., due to dispute on the qualifying order)
- `reward_released` — Reward credits issued to both parties
- `reward_forfeited` — Reward forfeited (fraud, refund, etc.)
- `fraud_flagged` — Fraud detection triggered
- `fraud_cleared` — Fraud flag resolved as legitimate
- `rejected` — Referral manually rejected by admin

**Immutability:** Append-only. No UPDATE or DELETE.

---

### 2.8 referral_rewards

**Purpose:** Tracks the reward hold for each side of a referral (referrer gets 250 DP, referee gets $5 discount). Rewards are held for 14 days before release. If a dispute or refund occurs during the hold, the hold is extended or the reward is forfeited.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `referral_id` | uuid | NO | — | FK → `referral_relationships(id)`, CASCADE |
| `beneficiary_user_id` | integer | NO | — | FK → `users(id)`, CASCADE. Who receives this reward. |
| `reward_type` | varchar(20) | NO | — | `'referrer_points'` or `'referee_discount'` |
| `amount` | integer | NO | — | Amount (250 DP for referrer, 500 cents for referee) |
| `currency` | varchar(3) | NO | `'dp'` | `'dp'` for points, `'usd'` for dollar discount |
| `status` | varchar(20) | NO | `'held'` | held → released or held → forfeited |
| `hold_until` | timestamptz | NO | — | When the hold expires (created_at + 14 days) |
| `hold_extended_count` | integer | NO | 0 | How many times the hold was extended |
| `ledger_entry_id` | uuid | YES | — | FK → `reward_ledger_entries(id)`, SET NULL. Set when released. |
| `released_at` | timestamptz | YES | — | When reward was released |
| `forfeited_at` | timestamptz | YES | — | When reward was forfeited |
| `forfeit_reason` | varchar(255) | YES | — | Why it was forfeited |
| `created_at` | timestamptz | NO | `current_timestamp` | Row creation |
| `updated_at` | timestamptz | NO | `current_timestamp` | Last update |

**Constraints:**
- `reward_type IN ('referrer_points','referee_discount')`
- `amount > 0`
- `status IN ('held','released','forfeited')`
- `hold_extended_count >= 0`

**Indexes:**
- `referral_id` — lookup rewards for a referral
- `beneficiary_user_id` — user's pending rewards
- `(status, hold_until)` — cron job: find rewards to release (status = 'held' AND hold_until < now())

---

### 2.9 challenge_definitions

**Purpose:** Admin-created challenge templates. A challenge defines what the user must do, the time window, and the reward. Criteria are stored as JSONB for flexibility — the application layer interprets them.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `title` | varchar(120) | NO | — | Challenge display name |
| `description` | varchar(500) | YES | — | Detailed description |
| `challenge_type` | varchar(20) | NO | — | daily, weekly, monthly, merchant, special |
| `category` | varchar(30) | NO | `'general'` | Grouping: general, purchase, social, streak, exploration, merchant |
| `criteria` | jsonb | NO | `'{}'` | Machine-readable completion criteria |
| `reward_points` | integer | NO | — | DP awarded on completion |
| `reward_badge` | varchar(60) | YES | — | Optional badge identifier |
| `max_participants` | integer | YES | — | Optional participant cap |
| `frequency` | varchar(20) | YES | — | Recurrence: daily, weekly, monthly, once |
| `starts_at` | timestamptz | NO | — | When challenge becomes available |
| `ends_at` | timestamptz | NO | — | When challenge closes |
| `is_active` | boolean | NO | true | Whether challenge is currently active |
| `merchant_user_id` | integer | YES | — | FK → `users(id)`, SET NULL. For merchant-sponsored challenges. |
| `created_by` | integer | YES | — | FK → `users(id)`, SET NULL. Admin who created this. |
| `created_at` | timestamptz | NO | `current_timestamp` | Row creation |
| `updated_at` | timestamptz | NO | `current_timestamp` | Last update |

**Criteria JSONB examples:**
```json
// "Make 3 purchases this week"
{ "action": "purchase", "count": 3, "min_amount_minor": 2500 }

// "Check in 7 days in a row"
{ "action": "streak_checkin", "consecutive_days": 7 }

// "Buy from merchant X"
{ "action": "purchase", "merchant_user_id": 42, "count": 1 }
```

**Constraints:**
- `challenge_type IN ('daily','weekly','monthly','merchant','special')`
- `category IN ('general','purchase','social','streak','exploration','merchant')`
- `reward_points > 0`
- `ends_at > starts_at`

**Indexes:**
- `(challenge_type, is_active)` — browse active challenges by type
- `(starts_at, ends_at)` — find current challenges
- `merchant_user_id` (partial where NOT NULL) — merchant's challenges

---

### 2.10 user_challenges

**Purpose:** Tracks an individual user's enrollment and progress on a specific challenge.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | integer | NO | — | FK → `users(id)`, CASCADE |
| `challenge_id` | uuid | NO | — | FK → `challenge_definitions(id)`, CASCADE |
| `progress` | integer | NO | 0 | Current progress toward target |
| `target` | integer | NO | — | Target value (copied from criteria at enrollment) |
| `status` | varchar(20) | NO | `'active'` | active → completed → claimed, or active → expired/abandoned |
| `ledger_entry_id` | uuid | YES | — | FK → `reward_ledger_entries(id)`, SET NULL. Set when reward is claimed. |
| `enrolled_at` | timestamptz | NO | `current_timestamp` | When user joined the challenge |
| `completed_at` | timestamptz | YES | — | When progress reached target |
| `reward_claimed_at` | timestamptz | YES | — | When DP was credited |
| `expires_at` | timestamptz | YES | — | Challenge deadline for this user |
| `created_at` | timestamptz | NO | `current_timestamp` | Row creation |
| `updated_at` | timestamptz | NO | `current_timestamp` | Last update |

**Constraints:**
- `progress >= 0`
- `target > 0`
- `status IN ('active','completed','claimed','expired','abandoned')`
- `UNIQUE(user_id, challenge_id)` — one enrollment per user per challenge

**Indexes:**
- `(user_id, status)` — "my active challenges"
- `(challenge_id, status)` — challenge participation stats
- `expires_at` (partial where status = 'active') — expiration cron

---

### 2.11 boost_purchases

**Purpose:** Seller-funded boost campaigns. Sellers pay to increase their product visibility in the marketplace feed. The `boost_multiplier` is applied to organic rank — it never replaces it. A product with zero organic score boosted is still zero.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `seller_user_id` | integer | NO | — | FK → `users(id)`, CASCADE |
| `product_id` | integer | YES | — | FK → `creator_products(id)`, SET NULL |
| `boost_type` | varchar(20) | NO | `'standard'` | standard, premium, featured |
| `boost_multiplier` | numeric(4,2) | NO | 1.50 | Multiplier on organic score (1.00–5.00) |
| `budget_minor` | integer | NO | — | Total budget in cents |
| `spent_minor` | integer | NO | 0 | Amount spent so far |
| `impression_count` | integer | NO | 0 | Total impressions served |
| `status` | varchar(20) | NO | `'active'` | active, paused, exhausted, cancelled, expired |
| `starts_at` | timestamptz | NO | `current_timestamp` | Campaign start |
| `ends_at` | timestamptz | YES | — | Campaign end (null = until budget exhausted) |
| `paused_at` | timestamptz | YES | — | When paused |
| `stripe_payment_intent_id` | varchar(255) | YES | — | Stripe payment reference |
| `created_at` | timestamptz | NO | `current_timestamp` | Row creation |
| `updated_at` | timestamptz | NO | `current_timestamp` | Last update |

**Constraints:**
- `boost_type IN ('standard','premium','featured')`
- `boost_multiplier BETWEEN 1.00 AND 5.00`
- `budget_minor > 0`
- `spent_minor >= 0`
- `spent_minor <= budget_minor` — cannot overspend
- `impression_count >= 0`
- `status IN ('active','paused','exhausted','cancelled','expired')`

**Indexes:**
- `(seller_user_id, status)` — seller's active boosts
- `product_id` (partial where NOT NULL) — product's boosts
- `(status, ends_at)` — cron: find expired/exhausted boosts

---

### 2.12 boost_impressions

**Purpose:** Per-impression log. Each time a boosted listing appears in a user's feed, an impression is recorded and cost deducted. Used for billing reconciliation and ROI analytics.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `boost_id` | uuid | NO | — | FK → `boost_purchases(id)`, CASCADE |
| `viewer_user_id` | integer | YES | — | FK → `users(id)`, SET NULL. Who saw this impression. |
| `cost_minor` | integer | NO | — | Cost of this impression in cents |
| `position_in_feed` | integer | YES | — | Where in the feed the boosted item appeared |
| `created_at` | timestamptz | NO | `current_timestamp` | When impression was served |

**Constraints:**
- `cost_minor >= 0`

**Immutability:** Append-only. No UPDATE or DELETE.

**Indexes:**
- `(boost_id, created_at)` — boost performance over time
- `(viewer_user_id, created_at)` — what boosts a user has seen

**Note:** This table will grow fast. Consider partitioning by month once volume exceeds ~10M rows (Phase 3 optimization).

---

### 2.13 ranking_signals

**Purpose:** Precomputed organic ranking signals per seller and/or product. The feed module reads these to compute: `visibility_score = organic_score × boost_multiplier × penalty_multiplier`. Refreshed by a periodic cron job (every 15 minutes initially, scaling as needed).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `seller_user_id` | integer | NO | — | FK → `users(id)`, CASCADE |
| `product_id` | integer | YES | — | FK → `creator_products(id)`, CASCADE. Null for seller-level signals. |
| `signal_type` | varchar(30) | NO | — | Type of ranking signal (see enum) |
| `organic_score` | numeric(10,4) | NO | 0 | Computed organic score for this signal |
| `component_scores` | jsonb | NO | `'{}'` | Breakdown of sub-scores |
| `period_start` | timestamptz | NO | — | Period this signal covers |
| `period_end` | timestamptz | NO | — | End of period |
| `computed_at` | timestamptz | NO | `current_timestamp` | When this signal was last computed |

**Signal type enum:**
- `seller_overall` — Aggregate seller quality score
- `product_listing` — Individual product quality score
- `sales_velocity` — Recent sales volume and trend
- `review_quality` — Average review score and volume
- `fulfillment_rate` — Order fulfillment success rate
- `response_time` — Seller response time to messages

**Constraints:**
- `signal_type IN ('seller_overall','product_listing','sales_velocity','review_quality','fulfillment_rate','response_time')`
- `organic_score >= 0`

**Indexes:**
- `(seller_user_id, signal_type)` — lookup seller's signals
- `(product_id, signal_type)` where NOT NULL — lookup product's signals
- `computed_at` — find stale signals
- Unique: `(seller_user_id, COALESCE(product_id, 0), signal_type, period_start)` — one signal per seller+product+type+period

---

### 2.14 seller_trust_profiles

**Purpose:** Composite trust score per seller. Score range 0–1000, decomposed into 5 weighted components. Used to compute `penalty_multiplier` in ranking formula and to gate eligibility for boosts and premium features.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | integer | NO | — | FK → `users(id)`, CASCADE. **UNIQUE** — one profile per user. |
| `trust_score` | integer | NO | 500 | Composite score (0–1000) |
| `trust_band` | varchar(20) | NO | `'new'` | Band: critical (0–199), low (200–399), new (400–599), good (600–799), excellent (800–1000) |
| `identity_score` | integer | NO | 0 | Identity verification component (0–300, weight: 30%) |
| `behavioral_score` | integer | NO | 0 | Behavioral signals (0–250, weight: 25%) |
| `transaction_score` | integer | NO | 0 | Transaction history (0–200, weight: 20%) |
| `social_score` | integer | NO | 0 | Social engagement (0–150, weight: 15%) |
| `device_score` | integer | NO | 0 | Device trust (0–100, weight: 10%) |
| `penalty_multiplier` | numeric(4,2) | NO | 1.00 | Ranking penalty (0.00 = fully penalized, 1.00 = no penalty) |
| `flags_active` | integer | NO | 0 | Count of unresolved fraud flags |
| `last_calculated_at` | timestamptz | NO | `current_timestamp` | When score was last recalculated |
| `previous_score` | integer | YES | — | Score before last recalculation (for change tracking) |
| `previous_band` | varchar(20) | YES | — | Band before last recalculation |
| `score_change_reason` | varchar(255) | YES | — | What triggered the last score change |
| `created_at` | timestamptz | NO | `current_timestamp` | Row creation |
| `updated_at` | timestamptz | NO | `current_timestamp` | Last update |

**Component max values** enforce that the sum of components at their maxima equals 1000:
- `identity_score`: 0–300 (30% weight)
- `behavioral_score`: 0–250 (25% weight)
- `transaction_score`: 0–200 (20% weight)
- `social_score`: 0–150 (15% weight)
- `device_score`: 0–100 (10% weight)
- Sum: 300 + 250 + 200 + 150 + 100 = **1000**

**Trust band mapping:**
| Band | Score Range | Penalty Multiplier | Effect |
|------|-------------|-------------------|--------|
| Critical | 0–199 | 0.00–0.20 | Near-invisible in feed, boost ineligible |
| Low | 200–399 | 0.20–0.50 | Significantly reduced visibility |
| New | 400–599 | 0.50–0.80 | Default for new sellers |
| Good | 600–799 | 0.80–1.00 | Normal visibility |
| Excellent | 800–1000 | 1.00 | Full visibility, premium feature eligible |

**Constraints:**
- `UNIQUE(user_id)`
- `trust_score BETWEEN 0 AND 1000`
- `trust_band IN ('critical','low','new','good','excellent')`
- Component ranges enforced by check constraint
- `penalty_multiplier BETWEEN 0.00 AND 1.00`

**Indexes:**
- `trust_band` — dashboard: distribution by band
- `trust_score` — sorted lists, threshold queries
- `last_calculated_at` — find stale profiles for recalculation

---

### 2.15 fraud_flags

**Purpose:** Individual fraud detection events. Each flag represents a specific suspicious pattern detected on a user's account. Flags can be auto-detected (velocity check, trust engine) or manually created by admin. They are resolved through investigation.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | integer | NO | — | FK → `users(id)`, CASCADE. The flagged user. |
| `flag_type` | varchar(40) | NO | — | What kind of fraud was detected (see enum) |
| `severity` | varchar(10) | NO | `'medium'` | low, medium, high, critical |
| `source` | varchar(30) | NO | — | What detected this: system_auto, admin_manual, trust_engine, velocity_check, referral_check |
| `reference_type` | varchar(30) | YES | — | What entity is flagged: ledger_entry, referral, order, boost, etc. |
| `reference_id` | varchar(64) | YES | — | ID of the flagged entity |
| `evidence` | jsonb | NO | `'{}'` | Machine-readable evidence (e.g., transaction IDs, IP addresses, timestamps) |
| `status` | varchar(20) | NO | `'open'` | Lifecycle: open → investigating → resolved_* or auto_resolved |
| `auto_action_taken` | varchar(40) | YES | — | What the system did automatically (e.g., 'account_frozen', 'points_held') |
| `resolved_by` | integer | YES | — | FK → `users(id)`, SET NULL. Admin who resolved. |
| `resolved_at` | timestamptz | YES | — | When resolved |
| `resolution_note` | varchar(500) | YES | — | Admin's resolution notes |
| `expires_at` | timestamptz | YES | — | Auto-resolve date for low-severity flags |
| `created_at` | timestamptz | NO | `current_timestamp` | When flag was created |
| `updated_at` | timestamptz | NO | `current_timestamp` | Last update |

**Flag type enum:**
- `velocity_breach` — Too many transactions in short window
- `daily_cap_breach` — Attempted to exceed daily earn cap
- `duplicate_transaction` — Same merchant + amount within 5 min
- `self_referral` — Attempted self-referral (same device/IP)
- `device_overlap` — Same device across multiple referral accounts
- `ip_overlap` — Same IP across multiple referral accounts
- `referral_farming` — Pattern consistent with referral abuse
- `refund_abuse` — Repeated purchase-then-refund pattern
- `account_sharing` — Multiple users on same device
- `suspicious_pattern` — ML/rule-based anomaly detection
- `manual_flag` — Admin-created flag
- `trust_score_drop` — Significant trust score decrease

**Constraints:**
- `flag_type IN (...)` — 12 enumerated types
- `severity IN ('low','medium','high','critical')`
- `source IN ('system_auto','admin_manual','trust_engine','velocity_check','referral_check')`
- `status IN ('open','investigating','resolved_legitimate','resolved_fraud','auto_resolved','expired')`

**Indexes:**
- `(user_id, status)` — user's active flags
- `(flag_type, created_at)` — analytics: flag type trends
- `(status, severity)` — admin review queue (open flags, sorted by severity)
- `(reference_type, reference_id)` — lookup flags for a specific entity
- `created_at` — chronological admin review

---

### 2.16 admin_actions

**Purpose:** Complete, immutable audit trail for every admin operation that modifies the rewards system. Every manual credit, debit, freeze, config change, fraud resolution, etc. is logged here. This table is **never updated or deleted**.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `admin_user_id` | integer | NO | — | FK → `users(id)`, CASCADE. The admin who performed the action. |
| `action_type` | varchar(40) | NO | — | What action was taken (see enum) |
| `target_type` | varchar(30) | NO | — | What type of entity was acted on |
| `target_id` | varchar(64) | NO | — | ID of the target entity |
| `target_user_id` | integer | YES | — | FK → `users(id)`, SET NULL. If the action targeted a specific user. |
| `before_state` | jsonb | YES | — | State before the action (for reversibility) |
| `after_state` | jsonb | YES | — | State after the action |
| `reason` | varchar(500) | NO | — | Why this action was taken (required for all admin actions) |
| `ip_address` | varchar(45) | YES | — | Admin's IP address |
| `created_at` | timestamptz | NO | `current_timestamp` | When action was performed |

**Action type enum (24 actions):**
- Points: `manual_credit`, `manual_debit`, `void_points`
- Account: `freeze_account`, `unfreeze_account`, `account_ban`, `account_unban`
- Tier/Streak: `tier_override`, `streak_reset`, `streak_shield_grant`
- Referrals: `referral_approve`, `referral_reject`, `referral_hold_extend`
- Challenges: `challenge_create`, `challenge_cancel`, `challenge_modify`
- Boosts: `boost_pause`, `boost_cancel`, `boost_refund`
- Fraud: `fraud_flag_resolve`, `fraud_flag_create`, `trust_score_override`
- Config: `config_update`
- Bulk: `bulk_action`

**Target type enum:**
- `reward_account`, `ledger_entry`, `referral`, `challenge`, `boost`, `trust_profile`, `fraud_flag`, `config`, `user`

**Constraints:**
- `reason NOT NULL` — admin must always provide a reason
- `action_type IN (...)` — enumerated
- `target_type IN (...)` — enumerated

**Immutability:** Append-only. Application code must **never** issue UPDATE or DELETE on this table.

**Indexes:**
- `(admin_user_id, created_at)` — "show me admin X's actions"
- `(target_user_id, created_at)` — "show me all admin actions on user Y"
- `(action_type, created_at)` — "all manual credits this month"
- `(target_type, target_id)` — "all actions on this specific entity"

---

## 3. Entity Relationship Map

```
┌─────────────────────────────────────────────────────────────────┐
│                         users (existing)                         │
│  id (serial PK) ─────────────────────────────────────────────┐  │
└──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┘  │
       │      │      │      │      │      │      │      │         │
       │      │      │      │      │      │      │      │         │
       ▼      │      │      │      │      │      │      │         │
 ┌───────────┐│      │      │      │      │      │      │         │
 │  reward   ││      │      │      │      │      │      │         │
 │ accounts  ││      │      │      │      │      │      │         │
 │ (1:1)     ││      │      │      │      │      │      │         │
 └─────┬─────┘│      │      │      │      │      │      │         │
       │      │      │      │      │      │      │      │         │
       │      ▼      │      │      │      │      │      │         │
       │ ┌──────────┐│      │      │      │      │      │         │
       │ │ reward   ││      │      │      │      │      │         │
       │ │ ledger   ││      │      │      │      │      │         │
       │ │ entries  ││      │      │      │      │      │         │
       │ │ (1:many) ││      │      │      │      │      │         │
       │ └────┬─────┘│      │      │      │      │      │         │
       │      │      │      │      │      │      │      │         │
       │      │      ▼      │      │      │      │      │         │
       │      │ ┌──────────┐│      │      │      │      │         │
       │      │ │ reward   ││      │      │      │      │         │
       │      │ │ redemp-  ││      │      │      │      │         │
       │      │ │ tions    ││      │      │      │      │         │
       │      │ └──────────┘│      │      │      │      │         │
       │      │             │      │      │      │      │         │
       │      │             ▼      │      │      │      │         │
       │      │      ┌───────────┐ │      │      │      │         │
       │      │      │ referral  │ │      │      │      │         │
       │      │      │  codes    │ │      │      │      │         │
       │      │      └─────┬─────┘ │      │      │      │         │
       │      │            │       │      │      │      │         │
       │      │            ▼       │      │      │      │         │
       │      │      ┌───────────┐ │      │      │      │         │
       │      │      │ referral  │ │      │      │      │         │
       │      │      │ relation- │ │      │      │      │         │
       │      │      │  ships    │ │      │      │      │         │
       │      │      └──┬────┬───┘ │      │      │      │         │
       │      │         │    │     │      │      │      │         │
       │      │         ▼    ▼     │      │      │      │         │
       │      │  ┌────────┐ ┌────────┐    │      │      │         │
       │      │  │referral│ │referral│    │      │      │         │
       │      │  │ events │ │rewards │    │      │      │         │
       │      │  └────────┘ └────────┘    │      │      │         │
       │      │                           │      │      │         │
       │      │                           ▼      │      │         │
       │      │                    ┌───────────┐  │      │         │
       │      │                    │ challenge  │  │      │         │
       │      │                    │definitions │  │      │         │
       │      │                    └──────┬─────┘  │      │         │
       │      │                           │        │      │         │
       │      │                           ▼        │      │         │
       │      │                    ┌───────────┐   │      │         │
       │      │                    │   user     │   │      │         │
       │      │                    │ challenges │   │      │         │
       │      │                    └───────────┘   │      │         │
       │      │                                    │      │         │
       │      │         ┌──────────────────────────┘      │         │
       │      │         ▼                                 │         │
       │      │  ┌──────────────┐    ┌──────────────┐     │         │
       │      │  │    boost     │───►│    boost     │     │         │
       │      │  │  purchases   │    │ impressions  │     │         │
       │      │  └──────────────┘    └──────────────┘     │         │
       │      │                                           ▼         │
       │      │  ┌──────────────┐    ┌──────────────┐ ┌─────────┐  │
       │      │  │   ranking    │    │seller_trust  │ │  fraud  │  │
       │      │  │   signals    │    │  profiles    │ │  flags  │  │
       │      │  └──────────────┘    └──────────────┘ └─────────┘  │
       │      │                                                     │
       │      │                          ┌──────────────┐           │
       │      │                          │    admin     │           │
       │      │                          │   actions    │           │
       │      │                          └──────────────┘           │
       │      │                                                     │
       │      │         orders (existing) ◄─── reward_redemptions   │
       │      │         creator_products (existing) ◄── boost_purchases
       │      │                                    ◄── ranking_signals
```

### Cross-Domain References

| From Table | To Table | FK Column | Relationship | On Delete |
|------------|----------|-----------|-------------|-----------|
| `reward_accounts` | `users` | `user_id` | 1:1 | CASCADE |
| `reward_ledger_entries` | `users` | `user_id` | Many:1 | CASCADE |
| `reward_redemptions` | `users` | `user_id` | Many:1 | CASCADE |
| `reward_redemptions` | `reward_ledger_entries` | `ledger_entry_id` | 1:1 | SET NULL |
| `reward_redemptions` | `orders` | `order_id` | 1:1 | SET NULL |
| `referral_codes` | `users` | `user_id` | Many:1 | CASCADE |
| `referral_relationships` | `users` | `referrer_user_id` | Many:1 | CASCADE |
| `referral_relationships` | `users` | `referee_user_id` | 1:1 | CASCADE |
| `referral_relationships` | `referral_codes` | `referral_code_id` | Many:1 | CASCADE |
| `referral_events` | `referral_relationships` | `referral_id` | Many:1 | CASCADE |
| `referral_rewards` | `referral_relationships` | `referral_id` | Many:1 | CASCADE |
| `referral_rewards` | `users` | `beneficiary_user_id` | Many:1 | CASCADE |
| `referral_rewards` | `reward_ledger_entries` | `ledger_entry_id` | 1:1 | SET NULL |
| `challenge_definitions` | `users` | `merchant_user_id` | Many:1 | SET NULL |
| `challenge_definitions` | `users` | `created_by` | Many:1 | SET NULL |
| `user_challenges` | `users` | `user_id` | Many:1 | CASCADE |
| `user_challenges` | `challenge_definitions` | `challenge_id` | Many:1 | CASCADE |
| `user_challenges` | `reward_ledger_entries` | `ledger_entry_id` | 1:1 | SET NULL |
| `boost_purchases` | `users` | `seller_user_id` | Many:1 | CASCADE |
| `boost_purchases` | `creator_products` | `product_id` | Many:1 | SET NULL |
| `boost_impressions` | `boost_purchases` | `boost_id` | Many:1 | CASCADE |
| `boost_impressions` | `users` | `viewer_user_id` | Many:1 | SET NULL |
| `ranking_signals` | `users` | `seller_user_id` | Many:1 | CASCADE |
| `ranking_signals` | `creator_products` | `product_id` | Many:1 | CASCADE |
| `seller_trust_profiles` | `users` | `user_id` | 1:1 | CASCADE |
| `fraud_flags` | `users` | `user_id` | Many:1 | CASCADE |
| `fraud_flags` | `users` | `resolved_by` | Many:1 | SET NULL |
| `admin_actions` | `users` | `admin_user_id` | Many:1 | CASCADE |
| `admin_actions` | `users` | `target_user_id` | Many:1 | SET NULL |

---

## 4. Schema Rules

These rules govern how application code interacts with the rewards schema. Violations of these rules should be caught in code review.

### 4.1 Ledger Integrity

1. **Never UPDATE or DELETE from `reward_ledger_entries`.** Corrections are always new entries. A mistaken credit is corrected with a debit entry, not by modifying the original.
2. **Never UPDATE `reward_accounts.balance` directly.** Balance changes happen exclusively through ledger entries. The application-level earn/redeem functions handle both the ledger INSERT and the account balance UPDATE in a single transaction.
3. **Every ledger entry must record `balance_after`.** This enables point-in-time balance reconstruction without scanning the entire ledger.
4. **Use `SELECT ... FOR UPDATE` on `reward_accounts`** when writing a new ledger entry, to prevent concurrent writes from creating inconsistent `balance_after` values.
5. **All amounts are positive integers.** The `type` column ('credit'/'debit') indicates direction. Amount represents the absolute value.
6. **Use idempotency keys** for all programmatic ledger writes (purchase earns, referral credits, challenge rewards). This prevents double-crediting on retries.

### 4.2 Referral Safety

7. **Never release referral rewards before `hold_until`.** The 14-day hold is non-negotiable and exists to protect against refund fraud.
8. **Self-referral is blocked at the DB level** via `CHECK (referrer_user_id != referee_user_id)`.
9. **One referrer per referee** via `UNIQUE(referee_user_id)` — prevents attribution conflicts.
10. **Monthly referral cap is enforced at application level** using a count query against `referral_relationships` for the current month.

### 4.3 Configuration

11. **All business rule numbers come from `reward_rules_config`**, never from hardcoded constants. Application code reads config at startup and caches with short TTL (60 seconds).
12. **Every config change is logged** in `admin_actions` with `action_type = 'config_update'`, `before_state`, and `after_state`.
13. **Config values are JSONB** so they can be numbers, strings, objects, or arrays as needed. Application code is responsible for type coercion.

### 4.4 Audit Trail

14. **Every admin mutation must produce an `admin_actions` row.** The row is created in the same transaction as the mutation. If the mutation fails, the audit row is also rolled back.
15. **`admin_actions` is immutable.** No UPDATE, no DELETE, ever.
16. **`reason` is required** on all admin actions. The application rejects empty reasons.

### 4.5 Fraud & Trust

17. **Fraud flags do not auto-punish.** A flag is informational. Auto-actions (freeze, hold) are logged in `auto_action_taken` but the actual freeze/hold is a separate operation.
18. **Trust score changes must record before/after** in `seller_trust_profiles.previous_score` and `score_change_reason`.
19. **Component scores sum to trust_score.** The check constraint ensures each component stays within its weighted max. Application code should also validate this invariant.

### 4.6 Deletion Policy

| Table | Policy |
|-------|--------|
| `reward_accounts` | CASCADE from users. Never soft-delete. Freeze instead. |
| `reward_ledger_entries` | Never delete. Void via `voided_at`. |
| `reward_redemptions` | Never delete. Reverse via `status = 'reversed'`. |
| `reward_rules_config` | Never delete. Deactivate by setting value to indicate disabled. |
| `referral_codes` | Soft-deactivate via `is_active = false`. |
| `referral_relationships` | CASCADE from users. Status transitions only. |
| `referral_events` | Never delete. Append-only. |
| `referral_rewards` | Never delete. Status transitions only. |
| `challenge_definitions` | Soft-deactivate via `is_active = false`. |
| `user_challenges` | CASCADE from users and challenges. |
| `boost_purchases` | Never delete. Status transitions only. |
| `boost_impressions` | Never delete. Append-only. Archive after 90 days (Phase 3). |
| `ranking_signals` | Overwrite with new computation. Old signals expire naturally. |
| `seller_trust_profiles` | CASCADE from users. |
| `fraud_flags` | Never delete. Resolution updates only. |
| `admin_actions` | **Never delete.** Immutable audit trail. |

---

## 5. Migration Strategy

### 5.1 Migration File Organization

The schema is split into **3 migration files** for clean separation:

| Migration | File | Tables | Dependencies |
|-----------|------|--------|-------------|
| 1 | `1730000040000_create_rewards_engine_core.js` | `reward_accounts`, `reward_ledger_entries`, `reward_redemptions`, `reward_rules_config` | `users`, `orders` |
| 2 | `1730000041000_create_referrals_and_challenges.js` | `referral_codes`, `referral_relationships`, `referral_events`, `referral_rewards`, `challenge_definitions`, `user_challenges` | `users`, `reward_ledger_entries` |
| 3 | `1730000042000_create_trust_boost_admin.js` | `boost_purchases`, `boost_impressions`, `ranking_signals`, `seller_trust_profiles`, `fraud_flags`, `admin_actions` | `users`, `creator_products` |

### 5.2 Ordering and Dependencies

Migrations must run in order. Migration 2 depends on Migration 1 (FK to `reward_ledger_entries`). Migration 3 is independent of Migration 2 but depends on existing tables (`creator_products`).

### 5.3 Rollback Strategy

Every migration has a complete `exports.down` that drops tables in reverse dependency order. Rollback is safe because:
- Tables are dropped, not altered
- No data dependencies exist at migration time (fresh tables)
- FKs with CASCADE ensure clean drops

**In production**, rollback should only be performed if the migration was applied within the current deploy window and no data has been written. Once data exists, create a new forward migration instead.

### 5.4 Future Migrations

Additional migrations will follow this sequence for subsequent features:

| Number | Purpose |
|--------|---------|
| `1730000043000` | Add triggers for `balance` sync on ledger insert |
| `1730000044000` | Add partitioning to `boost_impressions` (Phase 3) |
| `1730000045000` | Add materialized view for tier requalification |
| `1730000046000` | Add `reward_accounts.streak_*` history table for analytics |

### 5.5 Data Seeding

Migration `1730000040000` seeds `reward_rules_config` with 42 default business rule values. These are the authoritative defaults from the Business Rules & Economics Specification. They can be changed at runtime via the admin API.

No other tables are seeded — they are populated by application logic as users interact with the rewards system.

### 5.6 Environment Considerations

- **Local dev:** `npm run migrate:up` applies all migrations. `npm run migrate:down` reverses them.
- **CI/CD:** Migrations run as a pre-deploy step. The deploy fails if any migration fails.
- **Production:** Migrations are applied by the deployment pipeline. Manual migration is never permitted.
- **Testing:** Each test run starts with a fresh database. Migrations are applied in the test setup fixture.

---

## 6. Indexing Strategy

### 6.1 Index Categories

Every index in the schema falls into one of these categories:

| Category | Purpose | Examples |
|----------|---------|---------|
| **FK indexes** | Speed up JOIN operations and CASCADE deletes | `reward_ledger_entries(user_id)`, `referral_events(referral_id)` |
| **Query-path indexes** | Support the most common application queries | `reward_ledger_entries(user_id, created_at)`, `fraud_flags(status, severity)` |
| **Uniqueness indexes** | Enforce business rules at DB level | `referral_codes(code)`, `referral_relationships(referee_user_id)` |
| **Partial indexes** | Optimize queries that filter on a condition | `reward_ledger_entries(expires_at) WHERE expires_at IS NOT NULL AND voided_at IS NULL` |
| **Cron indexes** | Support periodic batch jobs | `referral_rewards(status, hold_until)`, `user_challenges(expires_at) WHERE status = 'active'` |
| **Admin indexes** | Support admin dashboard queries | `fraud_flags(status, severity)`, `admin_actions(action_type, created_at)` |

### 6.2 Index Count Per Table

| Table | Indexes | Notes |
|-------|---------|-------|
| `reward_accounts` | 4 | Low write volume, high read |
| `reward_ledger_entries` | 7 | High write volume, but indexes are critical for balance queries and fraud detection |
| `reward_redemptions` | 3 | Moderate volume |
| `reward_rules_config` | 1 (PK + unique) | Tiny table, frequently read |
| `referral_codes` | 3 | Low volume |
| `referral_relationships` | 4 | Low-moderate volume |
| `referral_events` | 2 | Append-only, moderate volume |
| `referral_rewards` | 3 | Low volume |
| `challenge_definitions` | 3 | Very low volume (admin-created) |
| `user_challenges` | 3 | Moderate volume |
| `boost_purchases` | 3 | Low volume |
| `boost_impressions` | 2 | **High volume** — monitor size |
| `ranking_signals` | 4 | Low volume (cron-generated) |
| `seller_trust_profiles` | 3 | Low volume (1 per seller) |
| `fraud_flags` | 5 | Moderate volume |
| `admin_actions` | 4 | Low volume |

**Total: 54 indexes across 16 tables.**

### 6.3 High-Volume Table Monitoring

Two tables will grow significantly faster than the rest:

1. **`reward_ledger_entries`** — Every purchase earn, every challenge reward, every streak bonus creates a row. At 1,000 active users doing 3 transactions/day = ~3,000 rows/day = ~1M rows/year. Index maintenance cost is manageable at this scale.

2. **`boost_impressions`** — Every feed load for every user who sees a boosted item creates a row. Could reach 100K rows/day with moderate traffic. **Phase 3 action:** Partition by month using PostgreSQL native partitioning. Archive partitions older than 90 days to cold storage.

### 6.4 Index Maintenance

- **No index rebuilding needed** at current scale. PostgreSQL handles B-tree maintenance automatically.
- **Monitor bloat** with `pg_stat_user_indexes` if write volume increases 10×.
- **Consider BRIN indexes** for `created_at` columns on high-volume append-only tables (`reward_ledger_entries`, `boost_impressions`) if sequential scan on time ranges becomes a bottleneck.

### 6.5 Missing Indexes (Intentional)

These columns do NOT have indexes because the query patterns don't justify them:

- `reward_accounts.is_frozen` — Only a handful of accounts will be frozen at any time. Full scan is faster than index.
- `reward_accounts.tier_qualified_at` — Rarely queried directly.
- `reward_ledger_entries.metadata` — JSONB, not indexed per CLAUDE.md rules (no JSONB queries on hot paths).
- `challenge_definitions.frequency` — Tiny table, sequential scan is fine.
- `boost_purchases.stripe_payment_intent_id` — Looked up via Stripe webhook, low frequency.

---

## 7. Integration with Existing Schema

### 7.1 Tables Referenced by Rewards Schema

| Existing Table | Referenced By | FK Column | Purpose |
|---------------|--------------|-----------|---------|
| `users` | All 16 new tables | `user_id` (and variants) | User identity |
| `orders` | `reward_redemptions` | `order_id` | Link redemption to the order it discounted |
| `creator_products` | `boost_purchases`, `ranking_signals` | `product_id` | Boost and rank products |

### 7.2 How Existing Modules Trigger Rewards

| Existing Flow | Trigger Point | Rewards Action |
|--------------|---------------|---------------|
| Purchase completed | `orders` row inserted with `status = 'completed'` | Create `reward_ledger_entries` credit (purchase earn) |
| Order refunded | `orders.status` updated to `'refunded'` | Create `reward_ledger_entries` debit (refund_clawback). Check if referral hold should extend or forfeit. |
| User signup | `users` row created | Create `reward_accounts` row. If referral code provided, create `referral_relationships`. Credit signup bonus. |
| Checkout with points | Checkout flow | Create `reward_redemptions` + `reward_ledger_entries` debit |

### 7.3 Data Type Compatibility

| Existing Column | Type | New FK Column | Type | Match? |
|-----------------|------|--------------|------|--------|
| `users.id` | serial (integer) | `*.user_id` | integer | ✅ |
| `orders.id` | serial (integer) | `reward_redemptions.order_id` | integer | ✅ |
| `creator_products.id` | serial (integer) | `boost_purchases.product_id` | integer | ✅ |

### 7.4 No Breaking Changes

The rewards schema is purely additive. It:
- Creates 16 new tables
- Does not alter any existing table
- Does not add columns to existing tables
- Does not modify existing indexes or constraints
- Does not change any existing migration

Existing modules continue to function identically. The rewards modules read from existing tables (via JOINs) but never write to them.

---

*End of Schema Reference — April 2026*
