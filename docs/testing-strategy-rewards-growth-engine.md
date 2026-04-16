# Deenly Rewards & Growth Engine — Testing Strategy & Test Plan

> Source of truth: Rewards Business Rules & Economics Spec, Fraud & Trust
> Policy, PRD, Analytics Event Taxonomy. Paired with:
> `docs/api-contracts-rewards-growth-engine.md`,
> `docs/schema-rewards-growth-engine.md`,
> `docs/implementation-plan-rewards-growth-engine-v2.md`.

---

## 1. Testing Philosophy

The reward system is a **money-equivalent liability surface**. A bug that
credits 1,000 extra points per user across 100k users is a $10,000 loss
that will not roll back cleanly. Our testing philosophy is therefore:

1. **Push rules into pure code.** Every business rule — earn math, tier
   thresholds, redemption caps, streak multipliers, trust band mapping —
   lives in `reward-rules-engine.js` or a pure helper. These have the
   highest test density and run with no DB.
2. **The ledger is sacred.** Any code path that touches
   `reward_ledger_entries` requires both a unit test with a stubbed DB
   and a Postgres-backed integration test. Append-only + idempotency +
   balance-invariant properties are tested explicitly.
3. **Fraud rules are tested adversarially.** For every "Never Do" in the
   Fraud & Trust Policy, at least one test that attempts the abuse
   confirms it is blocked.
4. **Rollback is a first-class path.** Refund clawback, referral forfeit,
   and void-entry are tested with the same depth as the happy path.
5. **Analytics are contract tests.** Every event emission in the taxonomy
   is asserted by at least one test (name + required payload fields).
   Missing instrumentation is a test failure, not a reviewer's job.

### What must have unit tests

- All functions in `reward-rules-engine.js` (pure, no DB).
- Pure helpers: `scoreToBand`, cursor encode/decode, validators, streak
  multiplier curve, tier-qualification walk.
- Every service's business-logic method with a stubbed `db`/`config`:
  daily-cap enforcement, velocity checks, referral fraud pre-checks,
  boost trust gate, idempotency short-circuit, frozen-account gate.
- Notification content builders (title/body strings).
- Auto-action selection in trust service (severity → action mapping).

### What must have integration tests

Anything that touches Postgres in anger. These run against a real test
database (`DEENLY_TEST_DATABASE_URL`), migrated fresh per run, wrapped
per-test in a transaction that rolls back on `afterEach`.

- `reward-ledger.creditPoints` / `debitPoints` / `voidEntry` — idempotency
  under concurrent calls, `FOR UPDATE` row locking, balance invariant,
  daily-cap persistence across calls.
- `reward-tiers.requalify` — 30-day grace period, history row writes.
- `reward-streaks` — day rollover, shield consumption.
- `reward-challenges.processEvent` — auto-completion + reward credit
  atomicity.
- `reward-referrals` — attribution fraud gate with real device/IP rows,
  hold window release cron.
- `reward-boosts` — spend races, auto-complete on budget exhaust.
- `reward-trust.recalculateScore` — history audit row correctness.
- `reward-admin.*` — audit log always written, budget aggregation
  against seeded ledger.
- HTTP layer via Supertest: auth, authz, rate limits, validator rejection,
  response shapes match `docs/api-contracts-rewards-growth-engine.md`.
- Cron jobs executed against seeded state, outcomes verified.

### What must have end-to-end tests

Playwright (web admin console) + Detox/Expo smoke (mobile) for the
critical revenue paths only. These are expensive and flaky; keep them
tight.

- **Buyer checkout with redemption.** Login → add to cart → apply points
  → pay → verify earn + redemption entries + updated balance on wallet
  screen.
- **Referral full lifecycle.** User A generates code → User B signs up
  with code → B completes first qualifying purchase → hold elapses in
  cron fast-forward → both users credited → wallet shows release.
- **Seller boost creation.** Login as seller → create boost on listing →
  activate → verify listing ranks higher in marketplace feed.
- **Refund reversal.** Admin refunds order → verify both earn and
  redemption ledger entries are voided and balance restored.
- **Admin freeze.** Admin freezes a flagged account → user tries to
  redeem → redemption blocked with the correct error code.

---

## 2. Unit Test Plan

Each row lists the **business rule** (from Economics Spec) and the test
cases that must exist. Unless otherwise noted, tests live next to the
source (`.test.js` siblings) and run with `jest --testPathIgnorePatterns=integration`.

### 2.1 Earn calculation — `reward-rules-engine.calculatePurchaseEarn`

| # | Scenario | Expected |
|---|---|---|
| 1 | Order below `min_order_amount_minor` ($1) | `eligible=false`, `ineligibleReason='order_below_minimum'`, `finalEarn=0` |
| 2 | Explorer tier, $50 order, no streak | 500 DP (50 × 10 × 1.0 × 1.0) |
| 3 | Member tier (1.25×), $50 order, no streak | 625 DP |
| 4 | Insider tier (1.5×), $50 order, no streak | 750 DP |
| 5 | VIP tier (2×), $50 order, no streak | 1000 DP |
| 6 | Elite tier (3×), $50 order, no streak | 1500 DP |
| 7 | VIP + 7-day streak (1.5×) | `combinedMultiplier=3`, 1500 DP on $50 |
| 8 | Elite + 31-day streak (3×) | `combinedMultiplier=9`, 4500 DP on $50 |
| 9 | Daily cap reached (`earnedToday == dailyCap`) | `eligible=false`, `ineligibleReason='daily_cap_reached'`, `finalEarn=0` |
| 10 | Raw earn exceeds remaining cap | `finalEarn = dailyCapRemaining`, `rawEarn > finalEarn` |
| 11 | Fractional-cent order ($12.99 = 1299 cents) | `basePoints = 120` (floor of `12 × 10`) — confirm floor, not round |
| 12 | Zero-cent order | rejected as below minimum |
| 13 | Config overridden `points_per_dollar=20` | earn doubles end-to-end |
| 14 | Abuse: negative `orderAmountMinor` | throws or rejects — must never credit |
| 15 | Abuse: `streakMultiplier < 1.0` | accepted (engine is pure); upstream enforces floor |

### 2.2 Redemption eligibility — `reward-rules-engine.calculateRedemptionEligibility`

| # | Scenario | Expected |
|---|---|---|
| 1 | Balance below `min_redemption_points` (500) | `eligible=false`, `maxRedeemablePoints=balance` |
| 2 | Balance 5000, $100 order | `maxRedeemablePoints=1500` (15% cap), reason = "15% of order total" |
| 3 | Balance 5000, $1000 order | `maxRedeemablePoints=2000` (absolute $20 cap), reason = "$20.00 redemption cap" |
| 4 | Balance 700, $1000 order | `maxRedeemablePoints=700` (balance cap), reason = "current balance" |
| 5 | Balance 500, $100 order | exactly at min — `eligible=true`, max=1500 but floor=500 |
| 6 | Tie: pct equals cap exactly | reason falls on pct branch |
| 7 | Abuse: balance negative | engine returns 0; upstream rejects |
| 8 | Order 0 cents | `maxRedeemablePoints=0`, `eligible=false` |

### 2.3 Tier qualification — `computeQualifiedTier` + `reward-tiers.requalify`

| # | Scenario | Expected |
|---|---|---|
| 1 | 0 points | explorer, next=member |
| 2 | 2499 points | explorer (just below threshold) |
| 3 | 2500 points (exact) | member |
| 4 | 10000 points | insider |
| 5 | 25000 points | vip |
| 6 | 50000+ points | elite, next=null |
| 7 | 6250 points | member, progress=50% |
| 8 | Upgrade path (explorer → member) | writes `reward_tier_history` row, emits `rewards.tier.upgraded` |
| 9 | Downgrade path (vip rolling drops below threshold) | grace window opens; tier unchanged for 30 days |
| 10 | Grace expires | downgrade applied, history row with `trigger='grace_expired'` |
| 11 | User re-qualifies during grace | grace cancelled, no downgrade |
| 12 | Voided ledger entries excluded from rolling-12m | confirm sum excludes `voided_at IS NOT NULL` |

### 2.4 Streak engine — `reward-streaks`

| # | Scenario | Expected |
|---|---|---|
| 1 | First-ever check-in | streak=1, multiplier=1.0, bonus credited |
| 2 | Same-day check-in twice | second call returns `already_checked_in=true`, no double credit |
| 3 | Consecutive day (yesterday + today) | streak=2, continues |
| 4 | Skipped 1 day with 1 shield | shield consumed, streak continues |
| 5 | Skipped 1 day, 0 shields | streak resets to 1, `rewards.streak.broken` emitted |
| 6 | Streak hits milestone at 7 days | multiplier = 1.5, `milestone_reached` emitted |
| 7 | Streak hits 14 days | multiplier = 2 |
| 8 | Streak hits 31 days | multiplier = 3, cap |
| 9 | Tier change triggers shield reset | new shield count from `rewardConfig.getStreakShields(newTier)` |
| 10 | Time-zone boundary (user's local midnight) | check-in counted on their local calendar day |

### 2.5 Referral qualification — `reward-referrals`

| # | Scenario | Expected |
|---|---|---|
| 1 | Valid code, new user signup, distinct device/IP | attribution created `status='pending'` |
| 2 | Self-referral (referrer.id == referred.id) | `fraud_blocked`, no attribution |
| 3 | Same device fingerprint as referrer | `fraud_blocked` reason=`device_overlap` |
| 4 | Same IP as referrer | `fraud_blocked` reason=`ip_overlap` |
| 5 | Referrer already has N referrals this month (monthly cap) | blocked reason=`monthly_cap_exceeded` |
| 6 | Referred user already attributed | blocked reason=`already_attributed` |
| 7 | Code not found or inactive | 404/422 |
| 8 | First qualifying purchase | held reward created, `held_until = now + 14 days`, status=`held` |
| 9 | Hold window elapses | `batchReleaseHolds` credits both users, status=`released` |
| 10 | Refund during hold | hold forfeited, no credit |
| 11 | Hold extension requested | `hold_extensions_count += 1`, capped at `MAX_REFERRAL_HOLD_EXTENSIONS` |
| 12 | Extension past cap | rejected |
| 13 | Admin approve overrides hold | immediate release, audit row written |
| 14 | Admin reject | status=`rejected`, no credit |
| 15 | Referral code uniqueness collision on generate | retry succeeds |

### 2.6 Trust score — `reward-trust`

| # | Scenario | Expected |
|---|---|---|
| 1 | New user default | score=500, band=`fair` |
| 2 | Email + phone + KYC verified | identity score = 1000 |
| 3 | Account age 30 days, no flags | behavioral ≥ 300 |
| 4 | 1 confirmed fraud flag | behavioral docked by 150 |
| 5 | 10 orders, 0 chargebacks | transaction ≈ 500 |
| 6 | 1 chargeback out of 10 | transaction penalty applied |
| 7 | Band thresholds: 0, 249 → `high_risk`; 250–449 → `poor`; 450–649 → `fair`; 650–799 → `good`; 800+ → `excellent` | `scoreToBand` pure test |
| 8 | Critical flag auto-freezes account | `reward_accounts.frozen=true` |
| 9 | High flag auto-suspends earnings | `earnings_suspended=true`, redemption still allowed |
| 10 | Resolve-dismissed lifts the auto-freeze caused by that flag only | other freezes remain |
| 11 | Every `recalculateScore` writes `trust_score_history` row | before/after/delta/components snapshot asserted |
| 12 | Band change emits `trust.band.changed` | payload has `previous_band`, `new_band` |
| 13 | Penalty multiplier mapping | excellent/good=1.0, fair=0.9, poor=0.7, high_risk=0.3 |

### 2.7 Boost rules — `reward-boosts`

| # | Scenario | Expected |
|---|---|---|
| 1 | Create with budget below `BOOST_MIN_BUDGETS[type]` | 400 |
| 2 | Create with multiplier not in `BOOST_MULTIPLIERS[type]` | 400 |
| 3 | Create with both listing_id and store_id | 400 |
| 4 | Create with neither | 400 |
| 5 | Activate with trust band `poor` | 403, `trust_gate_rejected` emitted |
| 6 | Activate with trust band `high_risk` | 403 |
| 7 | Activate with trust band `excellent`/`good`/`fair` | succeeds |
| 8 | Pause → resume extends `ends_at` by pause duration | `ends_at_new = ends_at_old + pause_ms` |
| 9 | `recordSpend` reaching budget auto-completes | status=`completed`, `completed_at` set |
| 10 | Concurrent `recordSpend` calls | only total spend up to budget charged (FOR UPDATE) |
| 11 | Duration expires via cron | status=`completed` |
| 12 | Cancel on active boost | status=`cancelled`, no further charges |
| 13 | Non-owner tries to mutate | 404 (owner scope enforced in service) |

### 2.8 Ranking — `reward-ranking`

| # | Scenario | Expected |
|---|---|---|
| 1 | Zero organic + 5× boost + 1.0 trust | visibility=0 (never overrides) |
| 2 | Positive organic + 2× boost + 1.0 trust | visibility = 2 × organic |
| 3 | Positive organic + 1× boost + 0.3 trust | visibility = 0.3 × organic |
| 4 | Batch of mixed items | sorted descending by visibility, originals preserved |
| 5 | Two boosts on same listing | uses highest multiplier only |
| 6 | Boost expired but still in cache | cache miss forces fresh lookup — multiplier=1.0 |

### 2.9 Cap enforcement — ledger unit tests

| # | Scenario | Expected |
|---|---|---|
| 1 | Credit with `earnedToday + amount > dailyCap` | `amount` truncated to `dailyCap - earnedToday` |
| 2 | Credit with `earnedToday == dailyCap` | rejected, no row written |
| 3 | Admin credit with `bypassDailyCap=true` | full amount credited even past cap |
| 4 | Debit with `amount > balance` | rejected, no row |
| 5 | Debit on `frozen` account without `allowFrozen` | 403-style rejection |
| 6 | Debit on `frozen` with `allowFrozen=true` (refund clawback) | succeeds |
| 7 | Velocity: 11th earn within 1h when limit=10 | `velocity_exceeded` emitted, earn blocked |

### 2.10 Reversal logic — ledger `voidEntry`

| # | Scenario | Expected |
|---|---|---|
| 1 | Void a credit entry | `voided_at` set, offsetting debit row created with `source='fraud_void'` or `'refund_clawback'`, balance reduced |
| 2 | Void a debit entry (redemption refund) | `voided_at` set, offsetting credit row created, balance restored |
| 3 | Void already-voided entry | rejected, idempotent no-op |
| 4 | Void with amount that would push balance negative | allowed; balance can go negative only via void (policy: pursue with admin or write off) |

---

## 3. Integration Test Plan

Each test uses Supertest against `createApp(...)`. DB is migrated on
setup; each test is wrapped in `BEGIN; …; ROLLBACK;` so state does not
leak. Seeds are loaded via `test/fixtures/` helpers.

### 3.1 Checkout reward redemption lifecycle

File: `test/integration/checkout-rewards.test.js`

1. Seed user with 2000 DP balance, tier=member, streak=3, daily_earn=0.
2. `POST /api/rewards/checkout/preview-redemption {cart_total_minor: 5000}` → assert `max_points=750` (15% of $50), `eligible=true`.
3. `POST /api/rewards/checkout/preview-earn {cart_total_minor: 5000}` → assert `earn_points = 50×10×1.25×1.25 = 781` (floor).
4. Simulate order create (existing `/api/monetization/orders`) to get `order_id`.
5. Call checkout service `applyRedemption({userId, orderId, pointsToRedeem:750, cartTotalMinor:5000})` → assert ledger debit row, idempotency key `redeem:{orderId}`.
6. Call again with same args → idempotent, same `ledger_entry_id` returned, no second row.
7. Simulate payment success; call `confirmEarn({userId, orderId, paidAmountMinor:4250})` — note paid amount is net of redemption; assert credit row with `idempotency_key=earn:{orderId}`.
8. Call again → idempotent no-op.
9. `GET /api/rewards/balance` → assert new balance = 2000 − 750 + earn_on_net.
10. `GET /api/rewards/history?type=credit&limit=5` → includes the earn; cursor pagination round-trip works.

Analytics assertions: `rewards.checkout.redemption_previewed`,
`rewards.checkout.earn_previewed`, `rewards.points.redeemed`,
`rewards.points.earned` all emitted with required fields.

### 3.2 Referral lifecycle from share to reward

File: `test/integration/referrals-lifecycle.test.js`

1. Seed User A; `GET /api/referrals/code` → code returned.
2. `POST /api/referrals/share {channel:'whatsapp'}` → 201.
3. Create User B with different device fingerprint + IP.
4. As B, `POST /api/referrals/attribute {code, device_fingerprint:'dev-B'}` → 201, status=`pending`.
5. Simulate B's first qualifying order ≥ `min_qualifying_order_minor`. Call `referralService.evaluateQualifyingPurchase(...)`.
6. Assert attribution row status=`held`, `held_until = now + 14 days`.
7. Fast-forward DB clock (`UPDATE referral_attributions SET held_until = now() - interval '1 minute'`).
8. Run `referralService.batchReleaseHolds()`.
9. Assert two ledger credit rows (one per user) with `source='referral_reward'`.
10. Assert status=`released`, `released_at` populated.
11. `GET /api/referrals/status` as A → summary reflects released count and points.

Analytics: `growth.referral.shared`, `growth.referral.signup_attributed`,
`growth.referral.qualifying_purchase`, `growth.referral.held`,
`growth.referral.released` emitted with correct `referrer_id`/`referred_user_id`.

### 3.3 Boost purchase to ranking lift

File: `test/integration/boost-ranking.test.js`

1. Seed seller + listing with `organic_score=100`.
2. Seed trust profile for seller at band=`good`.
3. Seed competitor listing with `organic_score=150`.
4. `POST /api/boosts` as seller → draft boost, multiplier=2, budget 2000 cents.
5. `POST /api/boosts/:id/activate` → 200, status=`active`.
6. Call `rankingService.applyRanking([sellerListing, competitor])`.
7. Assert seller listing comes first (`100 × 2.0 × 1.0 = 200 > 150`).
8. Simulate 1 impression: `boostService.recordSpend({boostId, amountMinor:1000, reason:'impression'})`.
9. Assert `spent_minor=1000`, status still `active`.
10. Second spend of 1000 → status=`completed`, `completed_at` set, subsequent `getListingMultiplier` returns 1.0.
11. Re-rank → competitor back on top.

Analytics: `boost.activated`, `boost.spend_recorded`, `boost.completed`.

### 3.4 Order refund to reward reversal

File: `test/integration/refund-reversal.test.js`

1. Seed user balance 1000; complete checkout that credits 500 earn and debits 200 redemption. Balance = 1300.
2. Call `checkoutService.refundOrder({userId, orderId, reason:'customer_refund'})`.
3. Assert ledger shows: original earn row with `voided_at` set; offsetting debit with `source='refund_clawback'`, amount=500.
4. Assert original redemption row with `voided_at` set; offsetting credit with `source='refund_clawback'`, amount=200.
5. Balance after = 1000 (original).
6. Idempotent retry: calling `refundOrder` again is a no-op (both voided rows skipped).
7. Partial refund variant: refund only redemption (future API) — earn stays, redemption voided.

Analytics: `rewards.points.voided` (two rows), `rewards.order.refunded`.

### 3.5 Admin freeze → redemption blocked

File: `test/integration/admin-freeze.test.js`

1. Seed user with balance 1000.
2. Admin `POST /api/rewards/admin/freeze {user_id, frozen:true, reason:'manual review'}`.
3. As user, `POST /api/rewards/checkout/preview-redemption` → `eligible=false`, `reason='account_frozen'`.
4. Attempt `applyRedemption` → 409.
5. `GET /api/rewards/admin/audit-log?action_type=freeze_account` → entry present.
6. Unfreeze → redemption now allowed.

---

## 4. Fraud Test Cases

These tests encode the Fraud & Trust Policy. Each is a named scenario
with a setup, attack, and expected block. Location:
`test/integration/fraud-scenarios.test.js`.

### 4.1 Self-referral detection

- Setup: User A.
- Attack: A creates code, signs out, signs up as B using A's email variant or same device, attributes.
- Expected: 422 `fraud_blocked`, `growth.referral.fraud_blocked` emitted with `reason='self_referral'`, no attribution row, trust flag optional.

### 4.2 Watch farming (artificial engagement to boost rewards)

- Setup: User A + 5 bot accounts on same device fingerprint.
- Attack: bots follow A, like all posts, complete empty challenges.
- Expected: challenge engine detects same-device actors via trust components → device score drops → trust band → `poor` → earnings auto-suspended at severity=`high`; challenge completion events from same-device cluster get `suspicious_cluster` flag; no rewards credited to A from the bot cluster's actions.
- Test: seed 5 users with same `device_fingerprint`; trigger challenge events from each; assert `fraud_flags` rows created with type=`watch_farming`, `reward_accounts.earnings_suspended=true`.

### 4.3 Duplicate account detection

- Setup: User A.
- Attack: create User A2 with identical `device_fingerprint` AND overlapping `ip_address` within the last 24h.
- Expected: signup succeeds (we don't block signup), but attribution/challenges/referrals from A2 are treated as `device_overlap`. Trust service recalculates both accounts, docking device score. If overlap persists, `fraud_flags` row created automatically.
- Test: create two accounts via register endpoint sharing fingerprint; seed overlap; call `trustService.assessRisk(userId)` for both; assert `device_score` penalized on both.

### 4.4 Refund abuse after reward issuance

- Setup: User completes order → receives 500 earn; redeems 300 DP.
- Attack: refund the order after ledger credit and redemption debit.
- Expected: `checkoutService.refundOrder` voids both entries; balance returns to pre-order state exactly; if user's refund rate exceeds `fraud.refund_rate_threshold` (e.g., >30% of orders), `fraud_flags` row created with type=`refund_abuse`, severity=`high`, auto-action `earnings_suspended`.
- Test: seed 10 orders, refund 4 → rate=40% → fraud flag auto-created on next refund; assert earnings suspended.

### 4.5 Seller–buyer collusion signal

- Setup: Seller S, Buyer B.
- Attack: B repeatedly orders from S, redeems points to near-zero cost, S refunds after earn clears hold, cycle repeats.
- Expected: Pattern detector (service-layer check in `checkoutService.confirmEarn`) flags same `(buyer, seller)` pair with >N completed-then-refunded orders in a rolling window (`fraud.collusion_window_days`, `fraud.collusion_min_pairs`). Both accounts get `fraud_flags` type=`collusion`; B's earnings suspended; S's boosts rejected at activation (trust gate catches downgraded band).
- Test: seed 5 completed→refunded orders between (B, S) within 14 days; trigger refund on the 6th; assert collusion flag created for both; assert S's next boost activation fails with 403.

### 4.6 Additional fraud cases

| Case | Setup | Expected |
|---|---|---|
| Velocity attack | One user earns 11 transactions in 1 hour (limit 10) | 11th blocked, `velocity_exceeded` emitted, no ledger row |
| Referral code stuffing | Script attempts 20 attributions from different devices but same IP /24 | IP-subnet heuristic blocks after threshold |
| Boost on zero-score listing | Seller boosts a newly-created listing with organic=0 | ranking still shows 0 visibility (test asserts this invariant) |
| Chargeback flood | Buyer files 3 chargebacks in 30 days | trust band drops to `poor`, earnings suspended |
| Admin adjustment abuse | Non-admin posts to `/api/rewards/admin/adjust` | 403 |
| Idempotency replay | Same `idempotency_key` replayed with different amount | original amount honored (policy: first write wins), mismatched replays rejected with 409 |

---

## 5. Load Testing Plan

All load tests live under `loadtests/` and run with **k6**. They target
a dedicated staging environment with representative data volume (≥1M
users, ≥10M ledger rows). Thresholds below are per the PRD's
performance budget (p95 < 300ms on read APIs, p95 < 800ms on write APIs).

### 5.1 High-volume reward earn events

File: `loadtests/rewards-earn.js`

- Scenario: 500 VU for 5 minutes, each VU posts `confirmEarn`-equivalent calls at 2 rps.
- Target: 1 million earns / hour sustained.
- Assertions: p95 latency < 800ms; zero ledger rows missing; balance = sum of credits verified via a control query every 30s; no deadlocks (pg `pg_stat_activity` clean at end).
- Focus: `SELECT ... FOR UPDATE` contention on hot accounts — scenario includes a "celebrity" user earning 10× the rate to stress row locking.

### 5.2 Concurrent checkout redemptions

File: `loadtests/rewards-redeem.js`

- Scenario: 200 VU for 5 minutes, each checking out an order with redemption applied.
- Duplicate-check: 10% of VUs submit the SAME idempotency key twice within 1 second — must see exactly one ledger row.
- Assertions: no double-debits (control query on `idempotency_key` uniqueness); balance never goes negative; 429 appearing only on rate-limited users, not on idempotent retries.

### 5.3 Ranking signal processing under load

File: `loadtests/ranking-query.js`

- Scenario: 1000 VU hitting marketplace feed endpoint with varying filters; 20% of results include boosted listings.
- Assertions: p95 < 300ms on feed endpoint; boost multiplier lookup must be batched (no N+1 — verify via query-count metric); ranking sort deterministic given same inputs.

### 5.4 Cron job load

File: `loadtests/cron-batch.js`

- Scenario: seed 100k tier-requalification candidates, run `tierService.batchRequalify`.
- Assertions: completes within 10 minutes; no memory leak (stable RSS); zero transient errors; all history rows written.

### 5.5 Fraud detection under attack

File: `loadtests/referral-fraud-burst.js`

- Scenario: 50 VU attempt 10 attributions each from rotated device/IP per request.
- Assertions: all legitimate attempts succeed, all fraud patterns blocked; trust recalculation queue drains within 60s.

---

## 6. Test Data Requirements

### 6.1 Seed data

Under `test/fixtures/rewards/`:

- `users.sql` — 20 canonical users with known tiers: `explorer_user`, `member_user`, `insider_user`, `vip_user`, `elite_user`, plus `frozen_user`, `high_risk_user`, `new_user`.
- `ledger-baseline.sql` — each tier user seeded with exactly the threshold-rolling-12m points to test boundary behavior.
- `referrals.sql` — pre-existing codes and attributions in various states (pending/held/released/rejected).
- `challenges.sql` — one of each `type`: daily, weekly, monthly, merchant, with sample criteria.
- `boosts.sql` — boosts in each state.
- `trust-profiles.sql` — profiles spanning all 5 bands.
- `fraud-flags.sql` — open and resolved flags for admin tests.
- `reward-rules-config.sql` — canonical seed of all 42 rules at documented default values.

### 6.2 Test account setup

- Buyer test accounts:
  - `buyer_new@test.deenly` — fresh, tier=explorer, balance=0
  - `buyer_balance@test.deenly` — balance=5000, tier=member, streak=7
  - `buyer_elite@test.deenly` — elite tier, long streak, max shields
  - `buyer_frozen@test.deenly` — account frozen
  - `buyer_highrisk@test.deenly` — trust band=high_risk
- Seller test accounts:
  - `seller_good@test.deenly` — trust=good, active store, 3 listings
  - `seller_poor@test.deenly` — trust=poor (boost gate should reject)
  - `seller_no_listings@test.deenly` — edge case for store-level boost
- Admin test accounts:
  - `admin_owner@test.deenly` — owner role, used with `requireAdminOwner`
  - `admin_mod@test.deenly` — moderator role (can resolve flags, cannot edit rules)

All test accounts use known passwords (from env `TEST_ACCOUNT_PASSWORD`) and are re-created per CI run. Never use real emails/phones.

### 6.3 Mock services

| Real service | In tests |
|---|---|
| Stripe (payments) | `services/__mocks__/stripe.js` — returns predictable `payment_intent_id`; webhook test helper |
| Plaid | `services/__mocks__/plaid.js` — static verified bank response |
| AWS S3 (media) | `services/__mocks__/media-storage.js` — local filesystem, deterministic URLs |
| Expo Push | `services/__mocks__/push-notifications.js` — records sends in-memory; exposed via `mock.calls` for assertions |
| Analytics sink | in-memory recorder; tests assert `analytics.track.mock.calls` |
| Cron timers | tests use fake timers (`jest.useFakeTimers()`) or call job functions directly |

Database: real Postgres (Docker) — never mocked. Tests that need DB must run in a suite that provisions and migrates `DEENLY_TEST_DATABASE_URL` before the suite, and drops it after.

---

## 7. CI/CD Requirements

### 7.1 Every PR (fast lane, blocking merge)

Runs in < 8 minutes. GitHub Actions workflow `ci-rewards.yml`.

- Lint: `eslint backend mobile frontend` — fail on warnings.
- Type check (mobile, frontend): `tsc --noEmit`.
- Unit tests: `jest --testPathIgnorePatterns=integration`. Must include:
  - `reward-rules-engine.test.js`
  - `reward-trust.test.js` (band mapping)
  - `reward-ranking.test.js`
  - `validators.test.js`
  - `reward-config.test.js`
  - notification builders, constants freeze checks.
- Integration tests scoped to `backend/test/integration/rewards/*` — reward-engine-only subset so full-suite doesn't gate rewards PRs.
- Migration dry-run: `npm run migrate:up && npm run migrate:down` against an ephemeral Postgres container — fail if either direction errors.
- Static analysis gates:
  - `grep -rn "db.query(" backend/src/modules/ | grep -v 'routes.js'` — must be empty (no service-bypassing raw queries in modules).
  - Magic-number grep: any new numeric literal in earn/redemption/tier/streak code files without an accompanying `rewardConfig.getNumber(...)` is flagged.
  - `.env.example` diff check: fail if a new `config.*` key is added without a matching line in `.env.example`.

### 7.2 On merge to `main` (pre-deploy, blocking promotion)

Runs in < 20 minutes. Workflow `pre-deploy-rewards.yml`.

- Full backend Jest suite including all `test/integration/**`.
- Playwright e2e on web admin console (admin freeze, admin adjust, audit log).
- Expo e2e smoke: buyer wallet, streak check-in, redemption preview. Uses `npm run test:e2e:smoke` from mobile.
- Database smoke: run all 3 rewards migrations against a cloned staging snapshot; verify constraint and index creation.
- Contract test: diff `docs/api-contracts-rewards-growth-engine.md` against an OpenAPI generator run over current routes — any unreviewed drift fails.

### 7.3 On deploy to staging (non-blocking, reported to Slack)

- k6 load tests from section 5, scaled-down (10 VU).
- Synthetic end-to-end: bot account completes full buyer+seller lifecycle once per deploy.
- Prometheus alerts verified: fraud-detection and ledger-balance-drift alarms tested with fault injection.

### 7.4 Nightly (non-blocking)

- Full load tests at production-scale VU counts.
- Chaos test: kill the cron process mid-job, verify no partial state (all jobs must be restart-safe).
- Drift check: balance invariant — `SUM(credits) - SUM(debits) = SUM(reward_accounts.balance)` — fails the job if off by more than 0 DP.

### 7.5 Coverage minimums by service

Measured via `jest --coverage` with per-package thresholds in
`jest.config.js`. Thresholds enforced; CI fails if a PR drops coverage
below them.

| Module / Service | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| `services/reward-rules-engine.js` | **100%** | **100%** | **100%** | **100%** |
| `services/reward-ledger.js` | 95% | 90% | 95% | 95% |
| `services/reward-tiers.js` | 90% | 85% | 90% | 90% |
| `services/reward-streaks.js` | 90% | 85% | 90% | 90% |
| `services/reward-challenges.js` | 85% | 80% | 85% | 85% |
| `services/reward-referrals.js` | 95% | 90% | 95% | 95% |
| `services/reward-trust.js` | 90% | 85% | 90% | 90% |
| `services/reward-boosts.js` | 90% | 85% | 90% | 90% |
| `services/reward-ranking.js` | 95% | 90% | 95% | 95% |
| `services/reward-checkout.js` | 95% | 90% | 95% | 95% |
| `services/reward-admin.js` | 85% | 80% | 85% | 85% |
| `services/reward-config.js` | 85% | 80% | 85% | 85% |
| `services/reward-notifications.js` | 80% | 70% | 85% | 80% |
| `modules/rewards/routes.js` | 85% | 80% | 85% | 85% |
| `modules/referrals/routes.js` | 85% | 80% | 85% | 85% |
| `modules/boosts/routes.js` | 85% | 80% | 85% | 85% |
| `modules/rewards/validators.js` | 95% | 90% | 95% | 95% |
| `modules/rewards/constants.js` | 100% | 100% | 100% | 100% |
| `cron/reward-jobs.js` | 80% | 70% | 85% | 80% |
| `mobile/src/lib/rewards.ts` | 80% | 70% | 85% | 80% |

The rules engine and ledger are held to the strictest bars; they are the
last line of defense against liability-creating bugs.

---

## Appendix A — Test invocation cheat sheet

```bash
# Backend unit-only (fast)
cd backend && npm test -- --testPathIgnorePatterns=integration

# Backend single file with coverage
cd backend && npx jest src/services/reward-rules-engine.test.js --coverage

# Backend integration (requires Postgres on DEENLY_TEST_DATABASE_URL)
cd backend && npm run test:integration

# Mobile unit
cd mobile && npm test

# Mobile e2e smoke
cd mobile && npm run test:e2e:smoke

# Frontend Playwright
cd frontend && npx playwright test

# k6 load
k6 run loadtests/rewards-earn.js

# Drift check (nightly)
psql $DATABASE_URL -f scripts/balance-invariant-check.sql
```

## Appendix B — Glossary of test-relevant terms

- **Balance invariant**: `sum(credits) − sum(debits) = reward_accounts.balance` for every user, always, after every operation.
- **Idempotency key**: string composed of `<operation>:<reference_id>`. A retry with the same key returns the prior result, never a new ledger row.
- **Hold window**: elapsed time between referral qualification and reward credit (default 14 days). Refund during this window forfeits the reward.
- **Grace period**: 30 days after a tier downgrade qualifies, during which the user keeps their current tier. Re-qualifying cancels the grace.
- **Trust gate**: boost activation check that rejects sellers in `poor` or `high_risk` bands.
- **Void**: marking a ledger entry as reversed by writing an offsetting entry and setting `voided_at` — never deleting the original row.
