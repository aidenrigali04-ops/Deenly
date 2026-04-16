# Deenly Rewards & Growth Engine — System Architecture

> Version 1.0 — April 2026
> Status: Approved for Implementation
> Author: Engineering / Architecture

---

## Table of Contents

1. [Architecture Decision: Monolith](#1-architecture-decision-monolith)
2. [Service Map](#2-service-map)
3. [Data Flow Diagrams](#3-data-flow-diagrams)
4. [External Dependencies](#4-external-dependencies)
5. [Database Design](#5-database-design)
6. [Caching Strategy](#6-caching-strategy)
7. [Event Bus & Async Processing](#7-event-bus--async-processing)
8. [API Gateway & Routing](#8-api-gateway--routing)
9. [Risk Areas](#9-risk-areas)
10. [Decision Log](#10-decision-log)

---

## 1. Architecture Decision: Monolith

**Decision: Stay monolith. Do not introduce microservices.**

The existing Deenly backend is a well-structured modular monolith — 27 domain modules behind a single Express process, one PostgreSQL database, factory-pattern dependency injection. The Rewards & Growth Engine adds 5 new modules into this same process.

**Why monolith is correct for this stage:**

| Factor | Monolith | Microservices |
|--------|----------|---------------|
| Team size (2-3 backend engineers) | One deploy, one repo, one debugger | N deploys, distributed tracing, service mesh |
| Transaction integrity (ledger writes) | Single-database ACID transactions | Sagas, eventual consistency, compensation logic |
| Time-to-ship (90-day roadmap) | Add modules, ship features | Build infra first, ship features second |
| Operational cost | One Railway/Render service | Kubernetes, service discovery, per-service monitoring |
| Points + Ranking + Fraud all need the same data | One query, one connection | Cross-service joins or data duplication |

**When to revisit:** If the backend sustains >500 req/s and a single domain (e.g., ranking recalculation) is bottlenecking the request path, extract that domain into an async worker process. Not before.

**What we do adopt from microservices:** Clear module boundaries with factory-function interfaces. No module reaches into another module's database tables. Communication between modules goes through exported service functions — never direct SQL across domain boundaries. This makes future extraction possible without a rewrite.

---

## 2. Service Map

The engine is implemented as **5 new backend modules** and **2 new internal services**, all running inside the existing Express monolith.

### 2.1 New Backend Modules

```
backend/src/modules/
├── rewards/           # Points ledger, balance queries, earn/redeem
├── tiers/             # Tier engine, qualification, upgrade/downgrade
├── streaks/           # Daily check-in, multipliers, shields
├── challenges/        # Challenge lifecycle, progress, auto-completion
└── referrals/         # Referral codes, tracking, hold/release
```

Plus modifications to existing modules:
```
├── trust/             # NEW: Trust score calculation, fraud signals
├── admin/             # EXTEND: Reward management, fraud review queue
├── monetization/      # EXTEND: Seller boost integration with ranking
├── feed/              # EXTEND: Ranking signal integration
└── notifications/     # EXTEND: Reward/streak/tier push notifications
```

### 2.2 Module Responsibility Matrix

| Module | Responsibility | Sync/Async | Calls | Called By |
|--------|---------------|------------|-------|-----------|
| **rewards** | Points ledger (credit/debit), balance queries, earn rules, redeem at checkout, expiration, daily caps, velocity checks | **Sync** (ledger writes in request path) | `tiers` (get multiplier), `trust` (get fraud hold status) | `monetization` (purchase earn), `streaks` (bonus credit), `challenges` (reward credit), `referrals` (referral credit), `admin` (manual adjust) |
| **tiers** | 5-tier qualification (Explorer→Elite), rolling 12-month point aggregation, upgrade/downgrade logic, grace period tracking | **Sync** (reads in request path), **Async** (nightly requalification job) | `rewards` (read 12-month points) | `rewards` (get multiplier), `streaks` (get shield count), mobile (tier display) |
| **streaks** | Daily check-in, streak count, multiplier calculation (1x→3x), shield management, streak break detection | **Sync** (check-in endpoint) | `rewards` (credit streak bonus), `tiers` (get shield allowance) | Mobile (check-in), cron (daily streak-break scan) |
| **challenges** | Challenge definitions (CRUD), user enrollment, progress tracking (0-100%), auto-completion via transaction matching, reward issuance | **Sync** (enrollment/progress query), **Async** (completion detection on purchase events) | `rewards` (credit challenge reward) | Mobile (browse/join), `monetization` (purchase triggers progress), cron (expiration) |
| **referrals** | Referral code generation, link tracking, referee attribution, 14-day hold management, hold extension triggers, release/forfeit logic, fraud checks (device/IP overlap, self-referral, cap enforcement) | **Sync** (code generation, link click), **Async** (hold release via cron) | `rewards` (credit on release), `trust` (fraud signal check) | Mobile (share/track), `auth` (signup attribution), cron (hold release scan) |
| **trust** | Trust score calculation (0-1000), 5-component weighted scoring, fraud signal ingestion, risk assessment on transactions, account flagging | **Sync** (risk check on earn/redeem), **Async** (score recalculation) | `rewards` (freeze/void points) | `rewards` (pre-earn check), `referrals` (fraud check), `admin` (review queue), `monetization` (boost eligibility) |
| **admin** (extended) | Reward ledger viewer, bulk hold/void, referral chain visualizer, fraud review queue with SLA timers, manual adjustments with audit trail | **Sync** | All modules (read-only queries + admin mutations) | Admin UI |
| **feed** (extended) | Ranking formula: organic score (6 signals) x boost multiplier, seller penalty application, ranking freeze during fraud review | **Sync** | `monetization` (boost multiplier), `trust` (penalty status) | Mobile (marketplace feed) |

### 2.3 Inter-Module Communication

All module communication is **direct function calls** within the monolith. No HTTP. No queues between modules.

```
┌─────────────────────────────────────────────────────────────┐
│                     Express Process                         │
│                                                             │
│  ┌──────────┐    function call    ┌──────────┐              │
│  │ rewards  │◄───────────────────►│  tiers   │              │
│  │  module  │                     │  module  │              │
│  └────┬─────┘                     └──────────┘              │
│       │                                                     │
│       │ function call                                       │
│       ▼                                                     │
│  ┌──────────┐    function call    ┌──────────┐              │
│  │  trust   │◄───────────────────►│ referrals│              │
│  │  module  │                     │  module  │              │
│  └──────────┘                     └──────────┘              │
│                                                             │
│  ┌──────────┐    function call    ┌──────────┐              │
│  │ streaks  │────────────────────►│ rewards  │              │
│  │  module  │                     │  (earn)  │              │
│  └──────────┘                     └──────────┘              │
│                                                             │
│  ┌──────────┐    function call    ┌──────────┐              │
│  │challenges│────────────────────►│ rewards  │              │
│  │  module  │                     │  (earn)  │              │
│  └──────────┘                     └──────────┘              │
│                                                             │
│  ┌──────────┐    SQL read         ┌──────────┐              │
│  │   feed   │◄───────────────────►│  trust   │              │
│  │ (ranking)│                     │(penalties)│              │
│  └──────────┘                     └──────────┘              │
└─────────────────────────────────────────────────────────────┘

         │ HTTP                              │ Webhook
         ▼                                   ▼
    ┌─────────┐                        ┌──────────┐
    │  Mobile  │                        │  Stripe  │
    │   App    │                        │ Webhooks │
    └─────────┘                        └──────────┘
```

**Rule: Modules export service factory functions. No module imports another module's route file or queries another module's tables directly.** Instead, each module exposes a service object (e.g., `createRewardsService({ db, config })`) that other modules receive via dependency injection in `app.js`.

### 2.4 Background Jobs (Cron)

These are **not** separate processes. They are functions triggered by `setInterval` or a lightweight cron library (e.g., `node-cron`) inside the same Express process. Extract to a worker dyno only when the job duration exceeds 30 seconds.

| Job | Schedule | Module | What It Does |
|-----|----------|--------|-------------|
| Streak break scan | Daily 00:15 UTC | `streaks` | Find users who didn't check in yesterday, apply shield or break streak |
| Tier requalification | Daily 02:00 UTC | `tiers` | Recalculate 12-month qualifying points, upgrade/downgrade, apply grace period |
| Referral hold release | Hourly | `referrals` | Find referrals past 14-day hold with no extension triggers, release credits |
| Challenge expiration | Daily 03:00 UTC | `challenges` | Expire incomplete challenges past end_date, emit events |
| Points expiration warning | Daily 04:00 UTC | `rewards` | Find accounts with 12+ months inactivity, send warnings at 30/14/7/1 day marks |
| Points expiration | Daily 04:30 UTC | `rewards` | Expire points for accounts inactive >12 months |
| Trust score recalc | Every 6 hours | `trust` | Batch recalculate trust scores for accounts with new signals |
| Velocity alert | Every 15 minutes | `trust` | Flag sellers with >200% WoW order increase from base <20 |

---

## 3. Data Flow Diagrams

### 3.1 Buyer Earns Points (Purchase)

This is the most common flow. Triggered when Stripe confirms a successful payment.

```
Mobile App                    Backend                                    Database
    │                            │                                          │
    │  POST /checkout            │                                          │
    │───────────────────────────►│                                          │
    │                            │                                          │
    │                            │  1. Stripe payment_intent.succeeded      │
    │                            │◄─────────────── (webhook) ──────────────│
    │                            │                                          │
    │                            │  2. monetization: validate payment       │
    │                            │     - order exists, not already rewarded │
    │                            │     - amount >= $1 minimum               │
    │                            │─────────────────────────────────────────►│
    │                            │                                          │
    │                            │  3. trust.assessRisk(user, transaction)  │
    │                            │     - velocity check (txns/hour, /day)   │
    │                            │     - duplicate detection (5-min window) │
    │                            │     - daily earn cap check               │
    │                            │─────────────────────────────────────────►│
    │                            │                                          │
    │                            │     IF risk = BLOCK → skip earn, log     │
    │                            │     IF risk = HOLD  → earn with hold     │
    │                            │     IF risk = ALLOW → proceed            │
    │                            │                                          │
    │                            │  4. tiers.getMultiplier(userId)          │
    │                            │     → returns tier multiplier (1x–3x)   │
    │                            │─────────────────────────────────────────►│
    │                            │                                          │
    │                            │  5. rewards.creditPoints(userId, {       │
    │                            │       amount: floor($spent × 10 × mult),│
    │                            │       source: 'purchase',               │
    │                            │       reference_id: orderId             │
    │                            │     })                                   │
    │                            │                                          │
    │                            │     BEGIN TRANSACTION                    │
    │                            │     a. SELECT balance FROM points_ledger │
    │                            │        WHERE user_id=$1                  │
    │                            │        ORDER BY created_at DESC LIMIT 1 │
    │                            │        FOR UPDATE                       │
    │                            │     b. INSERT INTO points_ledger (       │
    │                            │          user_id, amount, type, source,  │
    │                            │          reference_id, balance_after,    │
    │                            │          status)                        │
    │                            │     c. Check daily cap — if exceeded,    │
    │                            │        cap amount, log excess            │
    │                            │     COMMIT                               │
    │                            │─────────────────────────────────────────►│
    │                            │                                          │
    │                            │  6. challenges.checkProgress(userId,     │
    │                            │       { type: 'purchase', amount, cat }) │
    │                            │     → async, non-blocking                │
    │                            │                                          │
    │                            │  7. analytics.trackEvent(                │
    │                            │       'rewards.points.earned', {         │
    │                            │         user_id, amount, source,         │
    │                            │         reference_id, balance_after,     │
    │                            │         multiplier_applied,              │
    │                            │         tier_at_earn                     │
    │                            │     })                                   │
    │                            │     → async, fire-and-forget             │
    │                            │                                          │
    │  push: "You earned X pts!" │                                          │
    │◄───────────────────────────│                                          │
```

**Key invariant:** Steps 5a-5c run inside a single PostgreSQL transaction with `FOR UPDATE` on the user's latest ledger row to prevent concurrent double-credits. The `balance_after` column is calculated server-side from the previous row's `balance_after + amount`, never from a cached value.

### 3.2 Referral Reward Issued

This is a multi-day flow. The reward is never instant.

```
Day 0: Referrer shares link
═══════════════════════════════════════════════════════════════

Referrer (User A)             Backend                         Database
    │                            │                                │
    │  GET /referrals/my-code    │                                │
    │───────────────────────────►│  Return existing or generate   │
    │  { code: "USERA123",      │  unique code + deep link       │
    │    link: "deenly.app/..." }│                                │
    │◄───────────────────────────│                                │


Day 0: Referee signs up
═══════════════════════════════════════════════════════════════

Referee (User B)              Backend                         Database
    │                            │                                │
    │  POST /auth/register       │                                │
    │  { ..., referral_code:     │                                │
    │    "USERA123" }            │                                │
    │───────────────────────────►│                                │
    │                            │  1. auth: create account       │
    │                            │─────────────────────────────►  │
    │                            │                                │
    │                            │  2. referrals.trackSignup({    │
    │                            │       referrer_id: A,          │
    │                            │       referee_id: B,           │
    │                            │       code: "USERA123" })      │
    │                            │                                │
    │                            │  3. FRAUD CHECKS:              │
    │                            │     a. Same device fingerprint │
    │                            │        as referrer? → BLOCK    │
    │                            │     b. Same IP at signup       │
    │                            │        as referrer? → BLOCK    │
    │                            │     c. Referrer at monthly     │
    │                            │        cap (10)? → BLOCK       │
    │                            │     d. Self-referral (same     │
    │                            │        email domain pattern,   │
    │                            │        same phone)? → BLOCK    │
    │                            │                                │
    │                            │  4. IF passes: INSERT INTO     │
    │                            │     referrals (referrer_id,    │
    │                            │     referee_id, code,          │
    │                            │     status='pending_purchase') │
    │                            │─────────────────────────────►  │
    │                            │                                │
    │                            │  5. analytics.trackEvent(      │
    │                            │       'growth.referral.sent')  │


Day 0-N: Referee makes qualifying purchase (>= 50-75% of AOV)
═══════════════════════════════════════════════════════════════

                              Backend                         Database
                                 │                                │
    Stripe webhook ─────────────►│                                │
                                 │  1. Validate purchase amount   │
                                 │     >= minimum threshold       │
                                 │                                │
                                 │  2. referrals.activateHold({   │
                                 │       referral_id,             │
                                 │       qualifying_order_id,     │
                                 │       hold_until: now + 14d }) │
                                 │                                │
                                 │  3. UPDATE referrals SET       │
                                 │     status = 'pending_hold',   │
                                 │     qualifying_order_id = $1,  │
                                 │     hold_until = $2            │
                                 │─────────────────────────────►  │
                                 │                                │
                                 │  4. DO NOT credit yet.         │
                                 │     Points are NOT issued.     │
                                 │                                │
                                 │  5. analytics.trackEvent(      │
                                 │       'growth.referral.        │
                                 │        qualified')             │


Day 0-14: Hold extension checks (continuous)
═══════════════════════════════════════════════════════════════

    IF qualifying purchase refunded → hold_until = dispute_resolved + 3 days
    IF referrer account flagged     → hold_until = review_complete
    IF referee flagged high-risk    → hold_until += 14 days
    IF referee has no second login  → hold_until += 7 days


Day 14+: Cron releases credit
═══════════════════════════════════════════════════════════════

                              Backend (hourly cron)           Database
                                 │                                │
                                 │  1. SELECT * FROM referrals    │
                                 │     WHERE status='pending_hold'│
                                 │     AND hold_until <= NOW()    │
                                 │─────────────────────────────►  │
                                 │                                │
                                 │  2. For each eligible referral:│
                                 │     a. Final fraud re-check    │
                                 │     b. rewards.creditPoints(   │
                                 │          referrer, 250 DP,     │
                                 │          source='referral')    │
                                 │     c. UPDATE referrals SET    │
                                 │          status='completed',   │
                                 │          completed_at=NOW()    │
                                 │     (all in one transaction)   │
                                 │─────────────────────────────►  │
                                 │                                │
                                 │  3. Push to referrer:          │
                                 │     "Your referral bonus       │
                                 │      has arrived!"             │
                                 │                                │
                                 │  4. analytics.trackEvent(      │
                                 │       'growth.referral.        │
                                 │        completed')             │


Forfeit scenarios (credit is NEVER issued):
═══════════════════════════════════════════════════════════════

    - Referee account confirmed fraudulent within 90 days
    - Qualifying purchase reversed via chargeback
    - Referee is a duplicate of referrer's account
    - Referee dormant 60+ days after purchase AND coordinated abuse signals exist
```

### 3.3 Seller Boost Affects Ranking

Boosts are **multipliers on organic score, never replacements**. A seller with zero organic score boosted 3x still ranks at zero.

```
Seller                        Backend                         Database
    │                            │                                │
    │  POST /monetization/       │                                │
    │    boosts/activate         │                                │
    │  { product_id, tier,       │                                │
    │    duration_days }         │                                │
    │───────────────────────────►│                                │
    │                            │  1. ELIGIBILITY GATE:          │
    │                            │     a. Seller avg rating       │
    │                            │        >= 4.0 stars? ✓         │
    │                            │     b. Dispute rate < 3%? ✓    │
    │                            │     c. Active listing? ✓       │
    │                            │     d. trust.getPenaltyStatus  │
    │                            │        No Hard/Suppression? ✓  │
    │                            │     e. Max 3 concurrent        │
    │                            │        boosts? ✓               │
    │                            │     f. No open fraud review? ✓ │
    │                            │                                │
    │                            │  2. Stripe: charge boost fee   │
    │                            │     Tier 1: $X/day             │
    │                            │     Tier 2: $Y/day             │
    │                            │     Tier 3: $Z/day             │
    │                            │                                │
    │                            │  3. INSERT INTO seller_boosts  │
    │                            │     (seller_id, product_id,    │
    │                            │      tier, multiplier,         │
    │                            │      start_at, end_at,         │
    │                            │      payment_id)               │
    │                            │─────────────────────────────►  │
    │                            │                                │
    │  { boost_id, active_until }│                                │
    │◄───────────────────────────│                                │


When a buyer loads marketplace feed:
═══════════════════════════════════════════════════════════════

Buyer                         Backend (feed module)           Database
    │                            │                                │
    │  GET /feed/marketplace     │                                │
    │───────────────────────────►│                                │
    │                            │  1. Fetch candidate products   │
    │                            │     with organic ranking       │
    │                            │     signals:                   │
    │                            │                                │
    │                            │     organic_score =            │
    │                            │       (sales_volume     × 0.30)│
    │                            │     + (conversion_rate  × 0.25)│
    │                            │     + (avg_review_score × 0.20)│
    │                            │     + (return_rate_inv  × 0.10)│
    │                            │     + (content_quality  × 0.10)│
    │                            │     + (recency         × 0.05) │
    │                            │─────────────────────────────►  │
    │                            │                                │
    │                            │  2. Apply boost multipliers:   │
    │                            │                                │
    │                            │     visibility_score =         │
    │                            │       organic_score             │
    │                            │       × boost_multiplier       │
    │                            │       × penalty_multiplier     │
    │                            │                                │
    │                            │     boost_multiplier:          │
    │                            │       No boost  = 1.0          │
    │                            │       Tier 1    = 1.5          │
    │                            │       Tier 2    = 2.0          │
    │                            │       Tier 3    = 3.0          │
    │                            │                                │
    │                            │     penalty_multiplier:        │
    │                            │       None        = 1.0        │
    │                            │       Soft (-20%) = 0.8        │
    │                            │       Hard        = excluded   │
    │                            │       Suppressed  = excluded   │
    │                            │                                │
    │                            │  3. Sort by visibility_score   │
    │                            │     Return paginated results   │
    │                            │                                │
    │  { items: [...], cursor }  │                                │
    │◄───────────────────────────│                                │
```

**Critical invariant:** `visibility_score = organic_score × boost_multiplier × penalty_multiplier`. When `organic_score = 0`, the product ranks at 0 regardless of boost tier. This prevents pay-to-win and ensures boosts only amplify genuine quality.

### 3.4 Sales-Based Ranking Signal Processed

Ranking signals update asynchronously after purchase confirmation — they do NOT block the checkout flow.

```
Stripe webhook                Backend                         Database
    │                            │                                │
    │  payment_intent.succeeded  │                                │
    │───────────────────────────►│                                │
    │                            │  1. monetization: confirm      │
    │                            │     order, fulfill purchase    │
    │                            │                                │
    │                            │  2. FRAUD FILTER on the order: │
    │                            │     a. Buyer account created   │
    │                            │        same day? → exclude     │
    │                            │        from ranking signal     │
    │                            │     b. Buyer shares device     │
    │                            │        with seller? → exclude  │
    │                            │     c. Buyer has no browse     │
    │                            │        history for seller?     │
    │                            │        → flag for review       │
    │                            │─────────────────────────────►  │
    │                            │                                │
    │                            │  3. IF clean order:            │
    │                            │     UPDATE seller_ranking_     │
    │                            │       signals SET              │
    │                            │       sales_count_30d += 1,    │
    │                            │       sales_volume_30d += amt, │
    │                            │       updated_at = NOW()       │
    │                            │     WHERE seller_id = $1       │
    │                            │─────────────────────────────►  │
    │                            │                                │
    │                            │  4. Recalculate conversion     │
    │                            │     rate for seller:           │
    │                            │     conversion_rate =          │
    │                            │       orders / product_views   │
    │                            │     (rolling 30-day window)    │
    │                            │─────────────────────────────►  │
    │                            │                                │
    │                            │  5. Velocity check:            │
    │                            │     IF order_count WoW         │
    │                            │     increase > 200% from       │
    │                            │     base < 20 orders:          │
    │                            │       → Flag seller            │
    │                            │       → Freeze ranking         │
    │                            │       → Alert ops              │
    │                            │                                │
    │                            │  6. analytics.trackEvent(      │
    │                            │       'merchant.transaction.   │
    │                            │        processed')             │


On refund/chargeback (days later):
═══════════════════════════════════════════════════════════════

Stripe webhook                Backend                         Database
    │                            │                                │
    │  charge.refunded /         │                                │
    │  charge.dispute.created    │                                │
    │───────────────────────────►│                                │
    │                            │  1. Reverse ranking signal:    │
    │                            │     sales_count_30d -= 1       │
    │                            │     sales_volume_30d -= amount │
    │                            │─────────────────────────────►  │
    │                            │                                │
    │                            │  2. rewards: freeze/void       │
    │                            │     buyer points from order    │
    │                            │─────────────────────────────►  │
    │                            │                                │
    │                            │  3. IF refund rate for seller  │
    │                            │     > 2x platform average:     │
    │                            │     → flag signals for         │
    │                            │       exclusion from ranking   │
    │                            │                                │
    │                            │  4. IF chargeback:             │
    │                            │     → auto-void all rewards    │
    │                            │       tied to this order       │
    │                            │     → flag account for review  │
```

---

## 4. External Dependencies

### 4.1 Already Integrated (no new work)

| Service | Used For | Current Module |
|---------|----------|----------------|
| **Stripe** (v20) | Payment processing, seller payouts, boost billing | `monetization` |
| **Plaid** (v38) | Seller bank account linking for payouts | `monetization` |
| **Expo Push SDK** (v6.1) | Push notifications | `notifications` |
| **AWS S3** (@aws-sdk v3) | Media storage | `media` |
| **Sentry** | Error monitoring | Global |
| **Pino** | Structured logging | Global |

### 4.2 New Dependencies Required

| Service | Used For | Module | Phase | Cost |
|---------|----------|--------|-------|------|
| **node-cron** (or similar) | Background job scheduling (streak break, tier requalification, hold release) | All async jobs | Phase 1 | Free (npm package) |
| **Disposable email blocklist** (npm package or open-source list) | Block fake account signup for referral farming | `auth` | Phase 1 Day 1 | Free |
| **FingerprintJS** (open source) | Client-side device fingerprinting for referral fraud detection | Mobile SDK + `trust` | Phase 1 | Free (OSS), $0 at beta scale |
| **IPQualityScore** or **MaxMind** (free tier) | IP reputation check at signup and referral | `trust` | Phase 1 | Free tier sufficient for beta |

### 4.3 Deferred Dependencies (V2+, post-beta)

| Service | Used For | When to Add |
|---------|----------|-------------|
| **Fingerprint Pro** or **Sardine** | Commercial device fingerprinting with proximity detection | When free tier insufficient or fraud rings detected |
| **Sift** or **Kount** | ML-based fraud scoring | When rule-based fraud detection hits false-positive ceiling |
| **Redis** | Cache hot balances, rate limit counters, streak state | When PostgreSQL p95 latency for balance queries exceeds 50ms |
| **Kafka** or **BullMQ** | Job queue for async processing | When cron jobs exceed 30-second execution or need retry semantics |
| **Hive Moderation** or **Perspective API** | AI content quality scoring for listings | When manual + keyword filter insufficient |

### 4.4 Analytics Pipeline

The current analytics system is a simple PostgreSQL insert (`analytics_events` table, fire-and-forget). This is **correct for beta scale**.

```
Current (keep for Phase 1-2):
  Service layer → analytics.trackEvent(name, payload) → INSERT INTO analytics_events

Future (Phase 3, when table grows past ~10M rows):
  Service layer → analytics.trackEvent(name, payload) → BullMQ job
    → Worker: batch INSERT to analytics_events
    → Nightly: ETL to data warehouse (BigQuery/Redshift)
```

**Decision: Do not build a Kafka pipeline now.** The current single-table approach handles beta volume. Add a job queue when analytics writes start impacting request latency.

---

## 5. Database Design

### 5.1 Database Choice

**Single PostgreSQL database.** All rewards, trust, and ranking data lives in the same database as existing users, posts, and orders.

**Why:**
- ACID transactions across points + referrals + trust in a single `BEGIN/COMMIT`
- Foreign keys to existing `users` table
- No distributed transaction complexity
- PostgreSQL handles this volume easily (target: 10K concurrent users, ~100 writes/sec peak)

**When to split:** If the `points_ledger` table exceeds ~100M rows and analytical queries (monthly reports, tier requalification) start impacting transactional latency, partition the table by `created_at` (monthly range partitions). Still one database — just partitioned.

### 5.2 New Tables

```
┌─────────────────────────────────────────────────────────────┐
│                    REWARDS DOMAIN                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  points_ledger          (append-only, source of truth)      │
│  ├── id (uuid PK)                                           │
│  ├── user_id (FK → users)                                   │
│  ├── amount (integer, can be negative for debits)           │
│  ├── type ('credit' | 'debit')                              │
│  ├── source ('purchase'|'streak'|'challenge'|'referral'|    │
│  │          'bonus'|'redemption'|'reversal'|'expiration'|   │
│  │          'admin_adjustment')                              │
│  ├── reference_id (uuid, nullable — order/challenge/etc.)   │
│  ├── balance_after (integer, running balance)               │
│  ├── status ('active'|'held'|'voided')                      │
│  ├── held_reason (varchar, nullable)                        │
│  ├── metadata (jsonb, nullable — multiplier, tier, etc.)    │
│  └── created_at (timestamptz)                               │
│  INDEXES: user_id, created_at, reference_id, source         │
│                                                             │
│  reward_config          (admin-editable settings)           │
│  ├── id (serial PK)                                         │
│  ├── key (varchar, unique)                                  │
│  ├── value (jsonb)                                          │
│  ├── updated_by (FK → users, nullable)                      │
│  └── updated_at (timestamptz)                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     TIERS DOMAIN                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  tiers                  (reference table, 5 rows)           │
│  ├── id (serial PK)                                         │
│  ├── name ('explorer'|'member'|'insider'|'vip'|'elite')     │
│  ├── min_points (integer)                                   │
│  ├── multiplier (numeric(3,2))                              │
│  ├── streak_shields (integer)                               │
│  ├── daily_earn_cap (integer)                               │
│  └── benefits (jsonb)                                       │
│                                                             │
│  user_tiers             (one row per user)                  │
│  ├── id (uuid PK)                                           │
│  ├── user_id (FK → users, unique)                           │
│  ├── tier_id (FK → tiers)                                   │
│  ├── qualifying_points (integer, rolling 12-month)          │
│  ├── qualified_at (timestamptz)                             │
│  ├── grace_period_end (timestamptz, nullable)               │
│  ├── created_at (timestamptz)                               │
│  └── updated_at (timestamptz)                               │
│  INDEX: user_id (unique)                                    │
│                                                             │
│  tier_history           (audit trail)                       │
│  ├── id (uuid PK)                                           │
│  ├── user_id (FK → users)                                   │
│  ├── previous_tier_id (FK → tiers)                          │
│  ├── new_tier_id (FK → tiers)                               │
│  ├── reason ('qualified'|'downgraded'|'grace_expired'|      │
│  │          'admin')                                         │
│  ├── qualifying_points (integer)                            │
│  └── created_at (timestamptz)                               │
│  INDEX: user_id, created_at                                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    STREAKS DOMAIN                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  user_streaks           (one row per user)                  │
│  ├── id (uuid PK)                                           │
│  ├── user_id (FK → users, unique)                           │
│  ├── current_count (integer, default 0)                     │
│  ├── longest_count (integer, default 0)                     │
│  ├── last_checkin_date (date, nullable)                     │
│  ├── shields_remaining (integer, default 0)                 │
│  ├── started_at (timestamptz, nullable)                     │
│  ├── created_at (timestamptz)                               │
│  └── updated_at (timestamptz)                               │
│  INDEX: user_id (unique), last_checkin_date                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                  CHALLENGES DOMAIN                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  challenges             (admin-created)                     │
│  ├── id (uuid PK)                                           │
│  ├── title (varchar)                                        │
│  ├── description (text)                                     │
│  ├── type ('spending'|'visit'|'social'|'category'|          │
│  │        'merchant')                                        │
│  ├── criteria (jsonb — target amount, category, etc.)       │
│  ├── reward_points (integer)                                │
│  ├── frequency ('daily'|'weekly'|'monthly'|'one_time')      │
│  ├── start_date (timestamptz)                               │
│  ├── end_date (timestamptz)                                 │
│  ├── is_active (boolean)                                    │
│  ├── max_participants (integer, nullable)                   │
│  ├── created_at (timestamptz)                               │
│  └── updated_at (timestamptz)                               │
│  INDEX: is_active, start_date, end_date, type               │
│                                                             │
│  user_challenges        (enrollment + progress)             │
│  ├── id (uuid PK)                                           │
│  ├── user_id (FK → users)                                   │
│  ├── challenge_id (FK → challenges)                         │
│  ├── progress (integer, 0-10000 = 0.00-100.00%)            │
│  ├── status ('active'|'completed'|'failed'|'expired')       │
│  ├── joined_at (timestamptz)                                │
│  ├── completed_at (timestamptz, nullable)                   │
│  └── updated_at (timestamptz)                               │
│  INDEX: (user_id, challenge_id) unique, status              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                  REFERRALS DOMAIN                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  referrals                                                  │
│  ├── id (uuid PK)                                           │
│  ├── referrer_id (FK → users)                               │
│  ├── referee_id (FK → users, nullable until signup)         │
│  ├── code (varchar, unique)                                 │
│  ├── status ('pending_signup'|'pending_purchase'|           │
│  │          'pending_hold'|'completed'|'expired'|           │
│  │          'forfeited'|'blocked')                           │
│  ├── qualifying_order_id (uuid, nullable)                   │
│  ├── hold_until (timestamptz, nullable)                     │
│  ├── hold_extended_reason (varchar, nullable)               │
│  ├── referrer_reward (integer, default 250)                 │
│  ├── referee_discount (integer, default 500 — $5.00)        │
│  ├── fraud_signals (jsonb, nullable)                        │
│  ├── device_fingerprint_match (boolean, default false)      │
│  ├── ip_match (boolean, default false)                      │
│  ├── created_at (timestamptz)                               │
│  ├── completed_at (timestamptz, nullable)                   │
│  └── updated_at (timestamptz)                               │
│  INDEX: referrer_id, referee_id, code (unique), status,     │
│         hold_until                                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    TRUST DOMAIN                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  trust_scores           (one row per user)                  │
│  ├── id (uuid PK)                                           │
│  ├── user_id (FK → users, unique)                           │
│  ├── score (integer, 0-1000)                                │
│  ├── band ('untrusted'|'low'|'medium'|'high'|'verified')    │
│  ├── identity_score (integer, 0-300)                        │
│  ├── behavioral_score (integer, 0-250)                      │
│  ├── transaction_score (integer, 0-200)                     │
│  ├── social_score (integer, 0-150)                          │
│  ├── device_score (integer, 0-100)                          │
│  ├── created_at (timestamptz)                               │
│  └── updated_at (timestamptz)                               │
│  INDEX: user_id (unique), score, band                       │
│                                                             │
│  trust_score_history    (audit trail)                       │
│  ├── id (uuid PK)                                           │
│  ├── user_id (FK → users)                                   │
│  ├── previous_score (integer)                               │
│  ├── new_score (integer)                                    │
│  ├── previous_band (varchar)                                │
│  ├── new_band (varchar)                                     │
│  ├── trigger (varchar — what caused the change)             │
│  ├── component_deltas (jsonb)                               │
│  └── created_at (timestamptz)                               │
│  INDEX: user_id, created_at                                 │
│                                                             │
│  fraud_signals          (append-only log)                   │
│  ├── id (uuid PK)                                           │
│  ├── user_id (FK → users)                                   │
│  ├── signal_type (varchar — e.g., 'velocity_spike',         │
│  │               'device_overlap', 'self_referral')          │
│  ├── severity ('low'|'medium'|'high'|'critical')            │
│  ├── details (jsonb)                                        │
│  ├── action_taken ('none'|'flag'|'hold'|'block'|'suspend')  │
│  ├── reviewed (boolean, default false)                      │
│  ├── reviewed_by (FK → users, nullable)                     │
│  ├── reviewed_at (timestamptz, nullable)                    │
│  ├── review_notes (text, nullable)                          │
│  └── created_at (timestamptz)                               │
│  INDEX: user_id, signal_type, severity, reviewed,           │
│         created_at                                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│              RANKING / BOOST DOMAIN                          │
│           (extends existing monetization tables)             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  seller_ranking_signals (one row per seller)                │
│  ├── id (uuid PK)                                           │
│  ├── seller_id (FK → users, unique)                         │
│  ├── sales_count_30d (integer)                              │
│  ├── sales_volume_30d (integer — cents)                     │
│  ├── conversion_rate_30d (numeric(5,4))                     │
│  ├── avg_review_score (numeric(3,2))                        │
│  ├── review_count (integer)                                 │
│  ├── return_rate_30d (numeric(5,4))                         │
│  ├── content_quality_score (numeric(3,2))                   │
│  ├── organic_score (numeric(10,4), computed)                │
│  ├── penalty_status ('none'|'watch'|'soft'|'hard'|          │
│  │                  'suppressed')                            │
│  ├── penalty_until (timestamptz, nullable)                  │
│  ├── penalty_reason (varchar, nullable)                     │
│  ├── created_at (timestamptz)                               │
│  └── updated_at (timestamptz)                               │
│  INDEX: seller_id (unique), organic_score, penalty_status   │
│                                                             │
│  seller_boosts          (active boost instances)            │
│  ├── id (uuid PK)                                           │
│  ├── seller_id (FK → users)                                 │
│  ├── product_id (FK → posts, nullable for seller-wide)      │
│  ├── tier (integer, 1-3)                                    │
│  ├── multiplier (numeric(3,2))                              │
│  ├── start_at (timestamptz)                                 │
│  ├── end_at (timestamptz)                                   │
│  ├── payment_id (varchar — Stripe payment reference)        │
│  ├── status ('active'|'paused'|'expired'|'cancelled')       │
│  ├── created_at (timestamptz)                               │
│  └── updated_at (timestamptz)                               │
│  INDEX: seller_id, product_id, status, end_at               │
│                                                             │
│  admin_audit_log        (all admin actions on rewards)      │
│  ├── id (uuid PK)                                           │
│  ├── admin_user_id (FK → users)                             │
│  ├── action (varchar — 'void_points', 'release_hold',       │
│  │          'freeze_account', 'adjust_balance', etc.)        │
│  ├── target_user_id (FK → users)                            │
│  ├── details (jsonb)                                        │
│  └── created_at (timestamptz)                               │
│  INDEX: admin_user_id, target_user_id, created_at           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Migration Sequence

Migrations must be created in this order. Each is independently deployable.

| # | Migration | Tables | Phase |
|---|-----------|--------|-------|
| 1 | `create_reward_config` | `reward_config` | 1 |
| 2 | `create_points_ledger` | `points_ledger` | 1 |
| 3 | `create_tiers_and_user_tiers` | `tiers`, `user_tiers`, `tier_history` | 1 |
| 4 | `create_user_streaks` | `user_streaks` | 1 |
| 5 | `create_challenges` | `challenges`, `user_challenges` | 2 |
| 6 | `create_referrals` | `referrals` | 2 |
| 7 | `create_trust_tables` | `trust_scores`, `trust_score_history`, `fraud_signals` | 2 |
| 8 | `create_ranking_and_boosts` | `seller_ranking_signals`, `seller_boosts` | 2 |
| 9 | `create_admin_audit_log` | `admin_audit_log` | 1 |

---

## 6. Caching Strategy

### Phase 1: No Cache (PostgreSQL Only)

At beta scale (<10K users), PostgreSQL handles all reads without caching. The balance query is a single indexed aggregation:

```sql
SELECT COALESCE(SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END), 0) AS balance
FROM points_ledger WHERE user_id = $1;
```

With an index on `(user_id, status)`, this runs in <5ms for any user with <10K ledger rows.

### Phase 2: Materialized Balance (When Ledger Grows)

When a user's ledger exceeds ~10K rows, add a `balance_cache` column to `user_tiers` maintained by a database trigger:

```sql
-- Trigger on points_ledger INSERT
-- Updates user_tiers.cached_balance = balance_after from the new row
```

The ledger remains the source of truth. The cache is a read optimization only, always reconcilable by re-summing the ledger.

### Phase 3: Redis (When p95 > 50ms)

Add Redis for:
- Hot balance reads (cache-aside, 60s TTL, invalidate on write)
- Rate limit counters (sliding window for velocity checks)
- Streak state (today's check-in status — avoids DB round-trip on repeated taps)

**Decision: Do not add Redis in Phase 1.** It adds operational complexity (another service to monitor, connection pooling, failure modes). PostgreSQL is sufficient.

---

## 7. Event Bus & Async Processing

### Phase 1: In-Process Cron + Fire-and-Forget

```
┌──────────────────────────────────────────┐
│            Express Process               │
│                                          │
│  Request handlers (sync)                 │
│       │                                  │
│       ├── analytics.trackEvent()         │
│       │   → INSERT, no await in handler  │
│       │                                  │
│       └── challenges.checkProgress()     │
│           → async, non-blocking          │
│                                          │
│  node-cron (in-process)                  │
│       ├── 00:15 streak break scan        │
│       ├── 02:00 tier requalification     │
│       ├── hourly referral hold release   │
│       └── 03:00 challenge expiration     │
└──────────────────────────────────────────┘
```

### Phase 2: BullMQ Worker (When Jobs Need Retries)

If any background job needs retry semantics, dead-letter queues, or takes >30 seconds:

```
┌──────────────────┐         ┌──────────────┐         ┌──────────────┐
│  Express Process │ enqueue │    Redis      │ dequeue │   Worker     │
│                  │────────►│   (BullMQ)    │────────►│  Process     │
│  Request handler │         │              │         │              │
└──────────────────┘         └──────────────┘         └──────────────┘
```

**Decision: Start with in-process cron. Migrate to BullMQ only when a specific job proves unreliable or slow.**

---

## 8. API Gateway & Routing

### No Separate API Gateway

The existing Express app with `helmet`, `cors`, `express-rate-limit`, and `authenticate` middleware serves as the API gateway. No nginx, Kong, or AWS API Gateway needed at this scale.

### New Route Registration (in `app.js`)

```javascript
// Rewards & Growth Engine routes — added to apiRouter
apiRouter.use('/rewards',    createRewardsRouter({ db, config, analytics, rewardsService, tiersService, trustService }));
apiRouter.use('/tiers',      createTiersRouter({ db, config, analytics }));
apiRouter.use('/streaks',    createStreaksRouter({ db, config, analytics, rewardsService, tiersService }));
apiRouter.use('/challenges', createChallengesRouter({ db, config, analytics, rewardsService }));
apiRouter.use('/referrals',  createReferralsRouter({ db, config, analytics, rewardsService, trustService }));
apiRouter.use('/trust',      createTrustRouter({ db, config, analytics }));
```

### New API Endpoints

| Method | Path | Module | Auth | Rate Limit |
|--------|------|--------|------|------------|
| GET | `/rewards/:userId/balance` | rewards | Yes | 90/min |
| GET | `/rewards/:userId/history` | rewards | Yes | 60/min |
| POST | `/rewards/redeem` | rewards | Yes | 10/min |
| GET | `/tiers` | tiers | No | 60/min |
| GET | `/tiers/:userId` | tiers | Yes | 60/min |
| POST | `/streaks/checkin` | streaks | Yes | 5/min |
| GET | `/streaks/:userId` | streaks | Yes | 60/min |
| GET | `/challenges` | challenges | Yes | 60/min |
| POST | `/challenges/:id/join` | challenges | Yes | 10/min |
| GET | `/challenges/:id/progress` | challenges | Yes | 60/min |
| GET | `/referrals/my-code` | referrals | Yes | 30/min |
| GET | `/referrals/stats` | referrals | Yes | 30/min |
| POST | `/referrals/track` | referrals | Yes | 20/min |
| GET | `/trust/:userId/score` | trust | Yes | 30/min |
| POST | `/admin/rewards/adjust` | admin | Admin | 10/min |
| POST | `/admin/rewards/void` | admin | Admin | 10/min |
| GET | `/admin/fraud/queue` | admin | Admin | 30/min |
| POST | `/admin/fraud/review` | admin | Admin | 20/min |

---

## 9. Risk Areas

### 9.1 Race Conditions

| Where | What Can Go Wrong | Mitigation | Must Be Right Day 1? |
|-------|-------------------|------------|----------------------|
| **Points ledger concurrent writes** | Two simultaneous purchases for the same user could both read the same `balance_after`, resulting in a wrong running balance | `SELECT ... FOR UPDATE` on the user's latest ledger row inside a transaction. Serializes writes per user. | **YES** — ledger integrity is non-negotiable |
| **Streak double check-in** | User taps check-in button twice rapidly, gets double streak credit | Unique constraint on `(user_id, last_checkin_date)` at DB level. Application-level idempotency check before credit. | **YES** — easy to exploit |
| **Referral double-credit** | Webhook retry or race between signup and purchase processing credits the referrer twice | Unique constraint on `(referrer_id, referee_id)` in referrals table. Idempotency key on the credit operation. | **YES** — direct financial loss |
| **Daily earn cap bypass** | Concurrent purchases process simultaneously, each individually under the cap but sum exceeds it | Cap check inside the same transaction as the ledger write. Use `SUM(amount) ... FOR UPDATE` within the day window. | **YES** — fraud vector |
| **Tier requalification during earn** | Nightly tier job and a simultaneous purchase read different point totals | Acceptable eventual consistency. Tier changes are batched nightly. If a user earns enough points to upgrade mid-day, they get the new multiplier on the next earn. | No — latency is acceptable |
| **Challenge completion race** | Purchase triggers challenge progress check; two purchases arrive simultaneously and both "complete" the challenge | Use `UPDATE ... SET status = 'completed' WHERE status = 'active' RETURNING *` — only one UPDATE succeeds. | **YES** — double reward |

### 9.2 Data Consistency Critical Paths

| Path | Why It's Critical | Consistency Requirement |
|------|-------------------|------------------------|
| **Ledger balance_after chain** | Every row's `balance_after` must equal the previous row's `balance_after + amount`. A break in this chain means the balance is wrong, which is a financial liability. | **Strong consistency.** Single-writer per user (FOR UPDATE lock). Periodic reconciliation job that re-sums and compares to latest `balance_after`. |
| **Referral hold → release** | Releasing a referral credit before the hold period creates a fraud window (refund-after-reward). | **Strong consistency.** `hold_until` checked in the same transaction that issues the credit. Clock must be server-side (DB `NOW()`), never client-side. |
| **Points ↔ Tier sync** | If a user's tier multiplier is stale, they earn at the wrong rate. Over-earning is a liability; under-earning is a UX bug. | **Eventual consistency (acceptable).** Tier recalculation is nightly. Multiplier reads from `user_tiers` table which updates at most once/day. |
| **Ranking signals ↔ Refunds** | If a refunded order's ranking signal isn't reversed, the seller keeps inflated ranking. | **Strong consistency.** Refund webhook handler must reverse the ranking signal in the same transaction as the points void. |
| **Trust score ↔ Reward eligibility** | If a flagged user earns points before the flag is processed, those points may need to be clawed back (expensive, UX-damaging). | **Best-effort real-time.** Trust checks run synchronously in the earn path. If the trust service is slow/down, default to ALLOW with logging (don't block legitimate users because of infra issues). |

### 9.3 Fraud Attack Surface (Technical)

Ranked by exploitability and financial impact:

| # | Attack | Technical Vector | Financial Impact | V1 Defense | Residual Risk |
|---|--------|-----------------|-----------------|------------|---------------|
| 1 | **Self-referral farming** | Create fake account, use own referral code, make minimum purchase, claim 250 DP ($2.50) per cycle | **High** — scalable, automated | Device fingerprint match, IP match, disposable email blocklist, 14-day hold, 10/month cap | Sophisticated users with multiple devices and real emails. Mitigated by requiring second purchase + activity from referee. |
| 2 | **Refund-after-earn** | Make purchase, earn 10 DP/$1, immediately refund | **Medium** — limited by refund friction | Points freeze on refund, auto-void within 30 days, chargeback → full void + flag | Partial refunds where the earned amount exceeds the refund amount. Mitigated by voiding proportionally. |
| 3 | **Daily cap bypass via concurrency** | Fire many small purchases simultaneously, each individually under the daily cap | **Medium** — requires technical sophistication | FOR UPDATE lock on daily aggregation, transaction-level cap enforcement | Distributed attack across many accounts (farm). Mitigated by velocity alerts. |
| 4 | **Seller-buyer collusion** | Seller and buyer coordinate fake transactions to inflate ranking | **High** — degrades marketplace integrity | Same-day account exclusion, device overlap check, velocity spike alerts, refund-rate monitoring | Sophisticated rings using separate devices and delayed patterns. Requires graph-based detection (V2). |
| 5 | **Streak automation** | Bot checks in daily to maintain streak multiplier (3x at 31+ days) without genuine engagement | **Low** — limited by daily cap | Rate limiting on check-in endpoint (5/min), device fingerprint logging | Bot with realistic timing. Low financial impact due to daily cap. |
| 6 | **Boost-then-refund** | Seller activates boost, coordinates purchases that are later refunded | **Medium** — seller pays for boost but inflates signals | Refund reverses ranking signal, boost paused if seller enters Hard Penalty | Coordinated refunds after boost period ends. Mitigated by rolling 30-day signal window. |

---

## 10. Decision Log

Decisions that affect architecture, marked as **locked** (must be right now) or **deferred** (can change later with low cost).

| # | Decision | Status | Rationale | Revisit Trigger |
|---|----------|--------|-----------|-----------------|
| D1 | **Modular monolith, not microservices** | Locked (Phase 1-2) | Team size, transaction integrity, speed-to-ship. See Section 1. | Sustained >500 req/s with identifiable bottleneck in one domain |
| D2 | **Single PostgreSQL database** | Locked (Phase 1-3) | ACID across all domains, no distributed transactions, FK integrity | `points_ledger` >100M rows with analytical query impact |
| D3 | **No Redis at launch** | Deferred | PostgreSQL handles beta volume. Adding Redis adds ops burden. | Balance query p95 >50ms, or rate-limit counters need sub-millisecond checks |
| D4 | **No message queue at launch** | Deferred | In-process cron is simpler and debuggable. Jobs are short (<10s). | Any job exceeds 30s, needs retry/dead-letter, or multiple consumers |
| D5 | **Analytics via PostgreSQL INSERT** | Deferred | Current `analytics_events` table is sufficient at beta. No Kafka needed. | Table exceeds 10M rows, write latency impacts request path |
| D6 | **Ledger-derived balances, no cached balance column** | Locked | Source of truth must be the ledger. Cached balances desync. | User ledger exceeds 10K rows (add trigger-maintained cache column) |
| D7 | **14-day referral hold** | Locked | Aligned with return policy. Core fraud defense for referrals. | Never — this is policy, not architecture |
| D8 | **Boost = multiplier on organic score** | Locked | Prevents pay-to-win. Core marketplace integrity principle. | Never — this is product philosophy |
| D9 | **FingerprintJS (open source) for device ID** | Deferred | Free, sufficient for V1 fraud detection | Fraud rings with >5 accounts, false positive rate >5% |
| D10 | **In-process cron via node-cron** | Deferred | Simple, no infra. All jobs complete in <10s at beta scale. | Multiple backend instances (cron runs on all — need leader election or external scheduler) |
| D11 | **Integer-only points (1 DP = $0.01)** | Locked | No floating-point errors. All math is integer arithmetic. | Never |
| D12 | **Trust checks synchronous in earn path** | Locked | Must block fraudulent earns in real-time, not after the fact | Trust service latency >200ms (add circuit breaker with fail-open + async re-check) |
| D13 | **Nightly tier requalification (not real-time)** | Deferred | Simpler, avoids mid-transaction tier changes. Acceptable 24h delay. | Users complain about delayed tier upgrades (switch to event-driven upgrade-only, keep nightly downgrades) |
| D14 | **No separate API gateway** | Deferred | Express middleware (helmet, rate-limit, auth) covers all needs | Multi-service architecture, or need for request-level observability beyond Pino |
| D15 | **Rule-based fraud detection (no ML)** | Deferred | Buildable by small team, no training data yet, clear rules from policy doc | False positive rate >10% on referral blocks, or fraud patterns evade static rules |

---

## Appendix A: Spec Discrepancies

During architecture design, the following discrepancies were noted between the PRD and the Business Rules & Economics Specification. **The Business Rules doc is treated as authoritative** where conflicts exist, as it contains more detailed and recent numbers.

| Topic | PRD Says | Business Rules Says | Resolution |
|-------|----------|--------------------|----|
| Referrer reward | 200 DP | 250 DP | **Use 250 DP** (Business Rules) |
| Referee reward | 50 DP bonus | $5 welcome discount on first order | **Use $5 discount** (Business Rules) — different mechanic than points |
| Max redemption | 50% of order subtotal | 15% or $20, whichever is lower | **Use 15%/$20 cap** (Business Rules) — more conservative |
| Min order to redeem | 500 DP minimum | $25 minimum order | **Use both**: 500 DP minimum AND $25 minimum order |
| Monthly referral cap | 50/month | 20/month | **Use 20/month** (Business Rules) — fraud-safer |
| Min qualifying purchase (referral) | $10 | $30 (50-75% of AOV) | **Use configurable** via `reward_config` table, default $30 |

All these values are stored in the `reward_config` table — never hardcoded — so they can be adjusted without a deploy.
