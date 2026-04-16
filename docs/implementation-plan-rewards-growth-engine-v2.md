# Deenly Rewards & Growth Engine — Implementation Plan (v2)

> A file-by-file plan structured for linear execution in Cursor. Use
> alongside: `docs/api-contracts-rewards-growth-engine.md` (API shapes),
> `docs/schema-rewards-growth-engine.md` (DB), and the system architecture
> doc. Source-of-truth PDFs: Master Product Brief, Rewards Economics Spec,
> Fraud & Trust Policy, Analytics Event Taxonomy, PRD, 90-Day Roadmap.

## Language note

The Deenly backend is **JavaScript with JSDoc**, not TypeScript. The file
format below shows `Key functions: name(arg: Type): ReturnType` for
clarity — in code these become JSDoc `@param`/`@returns` annotations on
the exact same function signatures. The mobile app is TypeScript; all
`.ts` files in section 12+ are true TypeScript.

## Execution order

1. Shared types & constants  →  2. Migrations  →  3. Ledger  →  4. Rules
engine  →  5. Referral service  →  6. Checkout integration  →  7. Boost
service  →  8. Ranking modifier  →  9. Fraud detection (trust)  →
10. Notification hooks  →  11. Admin service  →  12. Buyer wallet API
→  13. Seller analytics API  →  14. Analytics emitter.

Every service exports a `createXxxService({ db, config, analytics, ... })`
factory. All DB access goes through these services — **no raw queries in
route handlers**. All business rule numbers come from the
`reward_rules_config` table via `RewardConfigService` — **no magic
numbers in code**.

---

## 1. Shared Types and Constants Package

### File: backend/src/modules/rewards/constants.js
Purpose: Frozen enums for the reward domain shared by all services — tiers, ledger sources/types, challenge categories, boost statuses, fraud severities, admin action types, share channels.
Depends on: (none)
Key functions:
  - (exports constants only — no functions)
Exports:
  - `TIERS: readonly string[]` — `['explorer','member','insider','vip','elite']`
  - `TIER_ORDER: Record<Tier, number>`
  - `LEDGER_TYPES: readonly string[]` — `['credit','debit']`
  - `LEDGER_CREDIT_SOURCES`, `LEDGER_DEBIT_SOURCES`, `LEDGER_SOURCES`
  - `REFERRAL_STATUSES`, `REFERRAL_REWARD_TYPES`, `REFERRAL_EVENT_TYPES`
  - `CHALLENGE_TYPES`, `CHALLENGE_CATEGORIES`, `CHALLENGE_STATUSES`
  - `BOOST_TYPES`, `BOOST_STATUSES`, `BOOST_MULTIPLIERS`, `BOOST_MIN_BUDGETS`
  - `TRUST_BANDS` — `['excellent','good','fair','poor','high_risk']`
  - `FRAUD_FLAG_TYPES`, `FRAUD_FLAG_SEVERITIES`, `FRAUD_FLAG_STATUSES`, `FRAUD_FLAG_SOURCES`
  - `ADMIN_ACTION_TYPES`, `ADMIN_TARGET_TYPES`
  - `SHARE_CHANNELS`, `MAX_REFERRAL_HOLD_EXTENSIONS`
Analytics events: (none)
Tests: `constants.test.js` — verify each export is `Object.freeze`'d, verify set uniqueness, verify `TIER_ORDER` indexes match `TIERS`.

### File: backend/src/modules/rewards/validators.js
Purpose: Domain-specific input validation with `(field, value, …)` signature. Throws `httpError(400, …)` on failure.
Depends on: `utils/http-error`
Key functions:
  - `requirePositiveInt(field: string, value: unknown): number`
  - `requireNonNegativeInt(field: string, value: unknown): number`
  - `requireEnum(field: string, value: unknown, allowed: string[]): string`
  - `optionalEnum(field: string, value: unknown, allowed: string[]): string|null`
  - `requireRewardString(field: string, value: unknown, opts?: {min,max}): string`
  - `requireUuid(field: string, value: unknown): string`
  - `optionalDate(field: string, value: unknown): Date|null`
  - `encodeCursor(obj: {createdAt, id}): string` — base64url JSON
  - `decodeCursor(cursor?: string): {createdAt, id}|null` — lenient, returns null on invalid
  - `parsePagination(query, maxLimit=100, defaultLimit=20): {limit, cursor}`
  - `parseOffsetPagination(query, maxLimit=200, defaultLimit=50): {limit, offset}`
  - `parseCommaSeparated(value?: string): string[]`
Analytics events: (none)
Tests: `validators.test.js` — positive/negative/zero paths; cursor round-trip; invalid cursor → null; pagination clamping; case-insensitive enum match; length bounds on strings.

### File: mobile/src/types/rewards.ts
Purpose: TypeScript mirror of backend API contract shapes for mobile consumption.
Depends on: (none)
Key types:
  - `RewardTier`, `TrustBand`, `LedgerType`, `LedgerSource`
  - `BoostType`, `BoostStatus`, `ReferralStatus`
  - `ChallengeType`, `ChallengeCategory`, `ChallengeStatus`, `ShareChannel`
  - `RewardAccountState`, `LedgerEntry`, `PaginatedLedger`
  - `TierInfo`, `StreakState`, `StreakCheckInResult`
  - `Challenge`, `UserChallenge`
  - `CheckoutEarnPreview`, `CheckoutRedemptionPreview`
  - `ReferralCode`, `ReferralSummary`, `Referral`
  - `TrustProfile`, `Boost`
  - Request payload types: `PreviewEarnRequest`, `PreviewRedemptionRequest`, `CreateBoostRequest`, `ShareReferralRequest`, `AttributeReferralRequest`
Analytics events: (none)
Tests: (type-only, verified by `tsc --noEmit` during mobile build)

---

## 2. Database Migrations

All under `backend/migrations/`, executed in numeric timestamp order via `node-pg-migrate`. Every migration has `up` and `down`; `down` fully reverses `up`.

### File: backend/migrations/1730000040000_create_rewards_engine_core.js
Purpose: Core rewards tables — the ledger, per-user accounts, config table, daily earn tracking, streaks, tiers, and challenges.
Depends on: existing `users` table
Tables created:
  - `reward_accounts` — one row per user; `balance`, `lifetime_earned`, `lifetime_redeemed`, `tier`, `rolling_12m_points`, `frozen`, `frozen_reason`, `earnings_suspended`. Balance maintained in same txn as ledger writes.
  - `reward_ledger_entries` — **append-only, never updated except `voided_at`**. Columns: `id (uuid)`, `user_id`, `amount`, `type (credit|debit)`, `source`, `reference_id`, `reference_type`, `balance_after`, `tier_at_earn`, `multiplier_applied`, `metadata jsonb`, `idempotency_key unique`, `voided_at`, `created_at`.
  - `reward_rules_config` — `key (pk)`, `value (jsonb)`, `description`, `updated_by`, `updated_at`. Seeds 42 rules.
  - `reward_daily_earn` — `(user_id, earn_date)` unique. Tracks daily cap usage.
  - `reward_streaks` — per-user streak state, shields.
  - `reward_tier_history` — tier change audit.
  - `reward_challenge_definitions`, `reward_user_challenges`.
Indexes: FK indexes on `user_id`, `reference_id`; `(user_id, created_at DESC)` on ledger for history queries; unique `idempotency_key`.
Analytics events: (none — schema only)
Tests: `test/migrations/rewards-engine-core.test.js` — run `up` against a fresh test DB, verify tables exist with expected columns and indexes, run `down`, verify cleanup.

### File: backend/migrations/1730000041000_create_referrals_and_challenges.js
Purpose: Referral codes, attributions, events; challenge enrollment expansions.
Depends on: migration 40000
Tables:
  - `referral_codes` — user's active code, `is_active`.
  - `referral_attributions` — `referrer_id`, `referred_user_id`, `code`, `device_fingerprint`, `ip_address`, `held_until`, `status`, `hold_extensions_count`.
  - `referral_events` — share events, qualifying-purchase events, release/forfeit events.
Indexes: unique on `referral_codes.code`; `(referrer_id, status)` on attributions; `(referred_user_id)` unique partial where `status != 'rejected'` (one active referral per referred user).
Analytics events: (none)
Tests: `test/migrations/referrals.test.js` — up/down round-trip.

### File: backend/migrations/1730000042000_create_trust_boost_admin.js
Purpose: Trust profiles, fraud flags, seller boosts, boost spend events, admin action audit log.
Depends on: migration 40000
Tables:
  - `trust_profiles` — `user_id (pk)`, `score`, `band`, 5 component scores, `last_calculated_at`.
  - `trust_score_history` — every recalc writes a row with before/after, trigger, components snapshot.
  - `fraud_flags` — `type`, `severity`, `status`, `source`, `evidence jsonb`, `created_by`, `resolved_by`, `resolution_notes`.
  - `seller_boosts` — `seller_id`, `listing_id OR store_id`, `type`, `status`, `budget_minor`, `spent_minor`, `multiplier`, `duration_hours`, timestamps for start/end/paused/completed/cancelled.
  - `boost_spend_events` — per-charge spend records.
  - `admin_actions` — action audit log (required `reason`, optional before/after state).
Indexes: FK indexes; `(status, ends_at)` on boosts for expiry cron; `(user_id, status)` on fraud_flags.
Analytics events: (none)
Tests: `test/migrations/trust-boost-admin.test.js` — up/down round-trip.

---

## 3. Rewards Ledger Service

### File: backend/src/services/reward-config.js
Purpose: Fetch, cache, and mutate values from `reward_rules_config`. 60-second in-memory TTL cache. Single source of truth for tier multipliers, tier thresholds, daily caps per tier, streak multiplier curves, shield counts, redemption ratios, fraud thresholds.
Depends on: `db`
Key functions:
  - `get(key: string): Promise<unknown>`
  - `getNumber(key: string): Promise<number>`
  - `getDailyEarnCap(tier: RewardTier): Promise<number>`
  - `getTierMultiplier(tier: RewardTier): Promise<number>`
  - `getTierThreshold(tier: RewardTier): Promise<number>`
  - `getStreakMultiplier(streakDays: number): Promise<number>`
  - `getStreakShields(tier: RewardTier): Promise<number>`
  - `preload(): Promise<void>` — warm the cache on startup
  - `update(key: string, value: unknown, updatedBy: number): Promise<void>`
  - `getAll(): Promise<Array<{key, value, description, updated_at, updated_by}>>`
  - `clearCache(): void`
Analytics events: (emits `rewards.rule.updated` on `update`)
Tests: `reward-config.test.js` — cache hit/miss, TTL expiration, update invalidates cache, concurrent readers.

### File: backend/src/services/reward-ledger.js
Purpose: **The core of the engine.** Append-only ledger for every point mutation. Enforces daily caps, idempotency, frozen-account gating, and atomic balance updates. All other services credit/debit points through this file.
Depends on: `db`, `reward-config`, `modules/rewards/constants`, `modules/rewards/validators`
Key functions:
  - `creditPoints(params: {userId, amount, source, referenceId?, referenceType?, idempotencyKey, tierAtEarn?, multiplierApplied?, metadata?, bypassDailyCap?}): Promise<LedgerEntry>` — Opens txn, `SELECT … FOR UPDATE` on `reward_accounts`, checks idempotency key, enforces daily cap (unless bypassed for admin), inserts ledger row with `balance_after`, updates account balance, commits.
  - `debitPoints(params: {userId, amount, source, referenceId?, referenceType?, idempotencyKey, metadata?, allowFrozen?}): Promise<LedgerEntry>` — Mirror of credit; checks balance sufficiency and frozen flag (admin can override via `allowFrozen` for `fraud_void`/`refund_clawback`).
  - `voidEntry({ledgerEntryId, reason}): Promise<{original, offset}>` — Creates offsetting entry and sets `voided_at` on original.
  - `getAccountState(userId): Promise<RewardAccountState>` — Auto-creates account if missing.
  - `getHistory({userId, limit, cursor?, type?, source?}): Promise<PaginatedLedger>` — Cursor-based, dynamic WHERE clause, returns `{items, hasMore, nextCursor}`.
  - `ensureAccount(userId, client?): Promise<void>` — `INSERT ON CONFLICT DO NOTHING`.
  - `getDailyEarnStatus(userId): Promise<{earned_today, cap, remaining}>` — handles date rollover.
  - `checkVelocity(userId): Promise<{tx_last_hour, tx_last_24h, over_limit}>`
Analytics events: `rewards.points.earned`, `rewards.points.redeemed`, `rewards.points.voided`, `rewards.points.velocity_exceeded`
Tests: `reward-ledger.test.js` + integration `test/integration/ledger.test.js` — idempotency double-call, daily cap enforcement, frozen-account block, concurrent credits on same user (verifies `FOR UPDATE`), void creates correct offset, balance = sum(credits) − sum(debits) invariant.

### File: backend/src/services/reward-tiers.js
Purpose: Tier qualification, requalification, grace-period downgrades. Uses rolling 12-month points window.
Depends on: `db`, `reward-config`, `reward-rules-engine`, `reward-ledger`
Key functions:
  - `getTierInfo(userId): Promise<TierInfo>` — current tier, multiplier, rolling-12m total, next tier, points to next, progress %.
  - `requalify(userId): Promise<{before, after, changed, direction, gracePeriodEndsAt?}>` — Recomputes tier, writes `reward_tier_history`, applies 30-day grace on downgrade.
  - `batchRequalify({userIds?, sinceDays?}): Promise<{processed, errors}>` — Cron entry point.
  - `recalcRolling12m(userId): Promise<number>` — Sums credits in last 365 days (excludes voided).
  - `getMultiplier(userId): Promise<number>` — Shortcut used by earn calculations.
Analytics events: `rewards.tier.upgraded`, `rewards.tier.downgraded`, `rewards.tier.grace_started`
Tests: `reward-tiers.test.js` — threshold boundaries (2499→2500 triggers upgrade), grace-period downgrade logic, voided entries excluded, concurrent-user batch.

### File: backend/src/services/reward-streaks.js
Purpose: Daily check-in, streak multiplier computation, shield consumption, break detection.
Depends on: `db`, `reward-config`, `reward-rules-engine`, `reward-ledger`
Key functions:
  - `checkIn(userId): Promise<StreakCheckInResult>` — Detects consecutive day; increments or resets; awards streak-bonus points; idempotent per day.
  - `getStreakState(userId): Promise<StreakState>`
  - `batchBreakDetection({}): Promise<{broken, shielded}>` — Cron. Detects users whose last check-in > 1 day ago; decrements shield or breaks streak.
  - `resetShields(userId, newTier): Promise<void>` — On tier change.
Analytics events: `rewards.streak.started`, `rewards.streak.continued`, `rewards.streak.milestone_reached`, `rewards.streak.broken`, `rewards.streak.shielded`
Tests: `reward-streaks.test.js` — first check-in, consecutive day, missed day with shield, missed day without shield, multiplier curve (3→1.25×, 7→1.5×, 14→2×, 31→3×), same-day idempotency.

### File: backend/src/services/reward-challenges.js
Purpose: Daily/weekly/monthly/merchant challenge lifecycle. Enrollment, progress events, auto-completion, rewards disbursement, expiry cron.
Depends on: `db`, `reward-config`, `reward-ledger`
Key functions:
  - `listAvailable({userId, limit, offset, type?, category?}): Promise<{items, total}>` — Excludes already-enrolled.
  - `enroll({userId, challengeId}): Promise<UserChallenge>` — Respects `max_participants`.
  - `getUserChallenges({userId, limit, offset, status?}): Promise<{items, total}>`
  - `processEvent({userId, eventType, metadata}): Promise<{updated: UserChallenge[], completed: string[]}>` — Called from other services on relevant events; advances matching criteria; auto-completes and credits reward.
  - `batchExpire(): Promise<{expired}>` — Cron.
  - `createDefinition(input): Promise<Challenge>` — Admin.
Analytics events: `rewards.challenge.enrolled`, `rewards.challenge.progressed`, `rewards.challenge.completed`, `rewards.challenge.expired`
Tests: `reward-challenges.test.js` — criteria evaluation, multi-step progress, reward credited exactly once, max-participants, concurrent progress events (idempotent on `user_challenge_id + event_hash`).

---

## 4. Rewards Rules Engine

### File: backend/src/services/reward-rules-engine.js
Purpose: **Pure, stateless calculation layer.** No database writes. Lives between route/orchestration logic and config values. Tests can exercise it with a stub config — no DB needed.
Depends on: `reward-config` (injected — never calls DB directly), `modules/rewards/constants`
Key functions:
  - `calculatePurchaseEarn({orderAmountMinor, tier, streakMultiplier, earnedToday, dailyCap}): Promise<{eligible, basePoints, tierMultiplier, streakMultiplier, combinedMultiplier, rawEarn, dailyCapRemaining, finalEarn, ineligibleReason}>`
  - `calculateRedemptionEligibility({balance, orderAmountMinor}): Promise<{eligible, maxRedeemablePoints, maxRedeemableReason, maxDollarValueMinor, minRedemptionPoints}>` — Caps: 15% of order, $20 absolute, balance, with `min_redemption_points` floor.
  - `computeStreakMultiplier(streakDays: number): Promise<number>`
  - `computeQualifiedTier(rolling12mPoints: number): Promise<{qualifiedTier, nextTier, nextThreshold, progress}>`
  - `pointsToDollars(points: number): Promise<number>` — cents
  - `dollarsToBasePoints(amountMinor: number): Promise<number>`
Analytics events: (pure — emits none)
Tests: `reward-rules-engine.test.js` (unit, no DB) — min-order rejection, tier×streak multiplier correctness at each tier, daily-cap truncation, redemption caps (pct vs absolute vs balance vs min-floor), tier boundaries, progress %, conversion round-trips.

---

## 5. Referral Service

### File: backend/src/services/reward-referrals.js
Purpose: Two-sided referral system with 14-day hold, device/IP overlap fraud checks, self-referral blocking, monthly-cap enforcement. Rewards are `held` until refund window closes.
Depends on: `db`, `reward-ledger`, `reward-config`, `modules/rewards/constants`
Key functions:
  - `getOrCreateCode(userId: number): Promise<ReferralCode>` — Username-based code with retry on collision; returns monthly usage summary.
  - `recordShare({userId, channel, metadata}): Promise<{id}>`
  - `attributeSignup({newUserId, code, deviceFingerprint?, ipAddress?}): Promise<{id, status}>` — Fraud checks: device overlap, IP overlap, self-referral, referrer monthly cap, referred-user already attributed.
  - `evaluateQualifyingPurchase({userId, orderId, orderAmountMinor}): Promise<{qualified, referralId?, heldUntil?}>` — Called by checkout on first qualifying order; creates held referral reward.
  - `getStatus({userId}): Promise<ReferralSummary>` — Counts, pending, earned, list of referrals.
  - `batchReleaseHolds(): Promise<{released, forfeited}>` — Cron; releases rewards past `held_until`, forfeits rejected.
  - `adminApprove({referralId, adminId, reason}): Promise<Referral>`
  - `adminReject({referralId, adminId, reason}): Promise<Referral>`
  - `extendHold({referralId, reason}): Promise<Referral>` — Increments `hold_extensions_count` (capped at `MAX_REFERRAL_HOLD_EXTENSIONS`).
Analytics events: `growth.referral.code_created`, `growth.referral.shared`, `growth.referral.signup_attributed`, `growth.referral.qualifying_purchase`, `growth.referral.held`, `growth.referral.released`, `growth.referral.forfeited`, `growth.referral.fraud_blocked`, `growth.referral.hold_extended`
Tests: `reward-referrals.test.js` + integration — self-referral rejected, device/IP overlap rejected, monthly-cap enforced, hold window release, extension cap, two-sided credit correctness.

---

## 6. Checkout Integration

### File: backend/src/services/reward-checkout.js
Purpose: Orchestration layer between the orders/checkout module and the rewards engine. Single entry point for cart preview, apply-redemption, confirm-earn-on-paid, and refund clawback. Keeps rules engine pure and ledger writes idempotent.
Depends on: `reward-ledger`, `reward-rules-engine`, `reward-tiers`, `reward-streaks`, `reward-config`
Key functions:
  - `previewEarn({userId, cartTotalMinor}): Promise<CheckoutEarnPreview>` — Reads tier, streak, daily-earned; calls rules engine; never writes.
  - `previewRedemption({userId, cartTotalMinor, requestedPoints?}): Promise<CheckoutRedemptionPreview>` — Reads balance; applies eligibility rules; returns max/chosen points and discount in cents.
  - `applyRedemption({userId, orderId, pointsToRedeem, cartTotalMinor}): Promise<{ledger_entry_id, points_redeemed, discount_minor, balance_after}>` — Debits via ledger with `idempotencyKey="redeem:{orderId}"`.
  - `confirmEarn({userId, orderId, paidAmountMinor}): Promise<{credited, points, ledger_entry_id?, balance_after?}>` — Credits via ledger with `idempotencyKey="earn:{orderId}"`; triggers tier requalification nudge.
  - `refundOrder({userId, orderId, reason}): Promise<{earn_voided, redemption_voided, earn_amount?, redemption_amount?}>` — Voids both earn and redemption entries by idempotency key lookup.
Analytics events: `rewards.checkout.earn_previewed`, `rewards.checkout.redemption_previewed`, `rewards.points.redeemed`, `rewards.points.earned`, `rewards.order.refunded`
Tests: `reward-checkout.test.js` + integration `test/integration/checkout-rewards.test.js` — preview math matches rules engine, applyRedemption is idempotent across retries, confirmEarn below min-order skips credit, refund voids both sides, partial refund handled.

---

## 7. Boost Service

### File: backend/src/services/reward-boosts.js
Purpose: Seller-paid boosts (listing / store / featured). Lifecycle `draft → active → paused|completed|cancelled`. Trust-gate check at activation. Spend tracked via `boost_spend_events`. Auto-complete when budget spent or duration expires.
Depends on: `db`, `reward-config`, `reward-trust`, `modules/rewards/constants`
Key functions:
  - `createBoost({sellerId, listingId?, storeId?, type, budgetMinor, multiplier, durationHours}): Promise<Boost>` — Validates min budget per type, exactly one of listing/store, allowed multiplier values.
  - `activateBoost({boostId, sellerId, paymentRef?}): Promise<Boost>` — Enforces trust gate (rejects `poor`/`high_risk`); sets `starts_at`, `ends_at`.
  - `pauseBoost({boostId, sellerId}): Promise<Boost>`
  - `resumeBoost({boostId, sellerId}): Promise<Boost>` — Extends `ends_at` by pause duration.
  - `cancelBoost({boostId, sellerId, reason?}): Promise<Boost>`
  - `recordSpend({boostId, amountMinor, reason}): Promise<Boost>` — Atomic `FOR UPDATE`; auto-transitions to `completed` at budget.
  - `getListingMultiplier(listingId): Promise<number>` — Highest active multiplier, 1.0 if none.
  - `getStoreMultiplier(storeId): Promise<number>`
  - `listBoosts({sellerId, status?, limit, offset}): Promise<{items, limit, offset}>`
  - `getBoost({boostId, sellerId}): Promise<Boost>`
  - `batchExpire(): Promise<{expired}>` — Cron.
Analytics events: `boost.created`, `boost.activated`, `boost.paused`, `boost.resumed`, `boost.cancelled`, `boost.spend_recorded`, `boost.completed`, `boost.expired`, `boost.trust_gate_rejected`
Tests: `reward-boosts.test.js` + integration — trust gate rejects poor/high_risk, spend races (`FOR UPDATE`), budget-exhaust auto-complete, pause+resume extends end correctly, duration-based expiry.

---

## 8. Ranking Modifier Service

### File: backend/src/services/reward-ranking.js
Purpose: Compose visibility score as `organic × boost × trust`. **Never overrides** — a zero-organic item remains zero. Batched-lookup aware to avoid N+1.
Depends on: `reward-boosts`, `reward-trust`
Key functions:
  - `scoreListing({listingId, sellerId, organicScore}): Promise<{visibility_score, organic_score, boost_multiplier, trust_multiplier}>`
  - `scoreListings(items: Array<{listingId, sellerId, organicScore}>): Promise<ScoredItem[]>` — Dedupes seller+listing lookups, sorts desc.
  - `applyRanking(listings: Array<{id, seller_id, organic_score}>): Promise<Listing[]>` — Convenience wrapper that preserves original fields and adds `visibility_score`, `boost_multiplier`, `trust_multiplier`.
Analytics events: (pure composition — none directly; feed/search modules emit `feed.ranking.applied`)
Tests: `reward-ranking.test.js` — zero organic stays zero even at 5× boost, multiplier composition correct, high-risk trust penalty (0.3×), batch sorts descending and preserves originals.

---

## 9. Fraud Detection Service (Trust)

### File: backend/src/services/reward-trust.js
Purpose: Composite 0–1000 trust score with 5 weighted components (identity 30%, behavioral 25%, transaction 20%, social 15%, device 10%). Band-driven penalty multipliers. Fraud flag lifecycle with auto-actions at high/critical severity.
Depends on: `db`, `reward-config`, `modules/rewards/constants`
Key functions:
  - `getProfile(userId: number): Promise<TrustProfile>` — Auto-creates default profile (500 → `fair`) if missing.
  - `assessRisk(userId: number): Promise<{identity_score, behavioral_score, transaction_score, social_score, device_score, score}>` — Derives each component from raw signals: identity (email/phone/KYC), behavioral (account age, confirmed flags), transaction (order count, chargebacks), social (followers), device (distinct fingerprints).
  - `recalculateScore(userId: number, trigger?: string): Promise<TrustProfile>` — Transaction: assess + update profile + insert `trust_score_history` row with before/after/delta/components snapshot.
  - `createFlag({userId, type, severity, source, evidence?, createdBy?}): Promise<FraudFlag>` — Auto-action: `critical` → freeze account, `high` → suspend earnings. Triggers recalc.
  - `resolveFlag({flagId, resolution, resolvedBy, notes?}): Promise<FraudFlag>` — If dismissed, lifts auto-freeze caused by this flag. Triggers recalc.
  - `getFlags({userId?, status?, severity?, limit, offset}): Promise<{items, total, limit, offset}>`
  - `batchRecalculate({userIds?, sinceDays?}): Promise<{processed, errors, total}>` — Cron, limit 500/run.
  - `getPenaltyMultiplier(userId: number): Promise<number>` — `excellent|good: 1.0`, `fair: 0.9`, `poor: 0.7`, `high_risk: 0.3`.
  - `scoreToBand(score: number): TrustBand` — Pure helper (exported).
Analytics events: `trust.score.calculated`, `trust.score.changed`, `trust.band.changed`, `trust.fraud.detected`, `trust.fraud.resolved`, `trust.account.auto_frozen`, `trust.account.auto_suspended`
Tests: `reward-trust.test.js` (pure band mapping) + integration `test/integration/trust.test.js` — component scoring, band transitions, flag auto-actions, history written on every recalc, dismissal lifts freeze.

---

## 10. Notification Hooks

### File: backend/src/services/reward-notifications.js
Purpose: Thin domain wrapper over the existing push-notification service. Fire-and-forget — never awaited in the request path; errors log and swallow.
Depends on: existing `push-notifications` service (`pushService.sendToUser`)
Key functions:
  - `notifyPointsEarned({userId, amount, source, balanceAfter}): Promise<void>`
  - `notifyTierUpgraded({userId, fromTier, toTier}): Promise<void>`
  - `notifyTierDowngraded({userId, fromTier, toTier}): Promise<void>`
  - `notifyStreakMilestone({userId, streakDays, multiplier}): Promise<void>`
  - `notifyStreakAboutToBreak({userId, streakDays, hoursLeft}): Promise<void>`
  - `notifyReferralReleased({userId, amount, referredUsername}): Promise<void>`
  - `notifyChallengeCompleted({userId, challengeName, reward}): Promise<void>`
  - `notifyBoostCompleted({sellerId, boostId, impressions}): Promise<void>`
  - `notifyBoostPaused({sellerId, boostId, reason}): Promise<void>`
  - `notifyAccountFrozen({userId, reason}): Promise<void>`
Analytics events: (push delivery is tracked by the push service itself; no domain events fired here)
Tests: `reward-notifications.test.js` — each method calls `pushService.sendToUser` with correct `{title, body, data}`; errors never throw.

### File: backend/src/cron/reward-jobs.js
Purpose: Background job scheduler for all reward maintenance tasks. Hourly + daily + weekly intervals. `start()`/`stop()` lifecycle managed from `index.js`. Gated by `config.rewardCronEnabled` (disabled in tests).
Depends on: `reward-streaks`, `reward-tiers`, `reward-referrals`, `reward-boosts`, `reward-challenges`, `reward-trust`
Key functions:
  - `createRewardJobs({logger, streakService, tierService, referralService, boostService, challengeService, trustService, config}): { start, stop, dailyStreakBreakCheck, dailyTierRequalification, dailyReferralReleases, hourlyBoostExpiry, dailyChallengeExpiry, weeklyTrustRecalc }`
  - `start(): void` — Starts intervals; hourly = 60m, daily = 24h, weekly = 7d.
  - `stop(): void` — Clears all intervals.
  - Individual job functions are exported for manual triggering / tests.
Analytics events: `cron.reward_job.started`, `cron.reward_job.completed`, `cron.reward_job.failed` (per job, with `durationMs`)
Tests: `cron/reward-jobs.test.js` — each job delegates to the right service, failures are caught and logged, `stop()` clears intervals.

---

## 11. Admin Service

### File: backend/src/services/reward-admin.js
Purpose: All admin-only mutations funnel through here. Every action writes an `admin_actions` row with required `reason`. Includes budget-cap monitoring for rewards spend.
Depends on: `db`, `reward-ledger`, `reward-trust`, `reward-referrals`, `reward-config`, `reward-notifications`, `modules/rewards/constants`
Key functions:
  - `logAction({adminId, actionType, targetType, targetId, reason, beforeState?, afterState?, metadata?}): Promise<AdminAction>`
  - `adjustPoints({adminId, userId, amount, direction, reason, metadata?}): Promise<{ledger_entry, before_balance}>` — Credit/debit bypasses daily cap + frozen-gate.
  - `setAccountFrozen({adminId, userId, frozen, reason}): Promise<{frozen, user_id}>`
  - `updateRule({adminId, key, value, reason?}): Promise<{key, value}>`
  - `resolveFraudFlag({adminId, flagId, resolution, notes?}): Promise<FraudFlag>` — Delegates to trust service.
  - `approveReferral({adminId, referralId, reason}): Promise<Referral>`
  - `rejectReferral({adminId, referralId, reason}): Promise<Referral>`
  - `getBudgetStatus(): Promise<{daily: {cap, spent, remaining, utilization}, monthly: {...}}>` — Aggregates ledger credits against configured caps.
  - `listAuditLog({actionType?, targetType?, adminId?, limit, offset}): Promise<{items, limit, offset}>`
Analytics events: `rewards.admin.credit`, `rewards.admin.debit`, `rewards.admin.account_frozen`, `rewards.admin.account_unfrozen`, `rewards.admin.rule_updated`, `rewards.admin.flag_resolved`, `rewards.admin.referral_approved`, `rewards.admin.referral_rejected`
Tests: `reward-admin.test.js` + integration — every action writes to `admin_actions`, missing-reason rejected, adjustments bypass caps, budget aggregation correct, rule-update triggers config cache invalidation.

---

## 12. Buyer Wallet API

### File: backend/src/modules/rewards/routes.js
Purpose: Buyer-facing HTTP routes under `/api/rewards` plus admin sub-routes. Controllers are thin — every handler delegates to a service. No business logic here.
Depends on: all services above; `middleware/auth`, `modules/rewards/validators`, `modules/rewards/constants`
Routes:
  - `GET /balance` → `ledgerService.getAccountState`
  - `GET /history?limit&cursor&type&source` → `ledgerService.getHistory`
  - `GET /tier` → `tierService.getTierInfo`
  - `GET /streak` → `streakService.getStreakState`
  - `POST /streak/check-in` → `streakService.checkIn` (rate-limited 30/min)
  - `GET /challenges?limit&offset&type&category` → `challengeService.listAvailable`
  - `GET /challenges/mine?limit&offset&status` → `challengeService.getUserChallenges`
  - `POST /challenges/:id/enroll` → `challengeService.enroll`
  - `POST /checkout/preview-earn {cart_total_minor}` → `checkoutService.previewEarn`
  - `POST /checkout/preview-redemption {cart_total_minor, requested_points?}` → `checkoutService.previewRedemption`
  - `POST /admin/adjust {user_id, amount, direction, reason}` → `adminService.adjustPoints`
  - `POST /admin/freeze {user_id, frozen, reason}` → `adminService.setAccountFrozen`
  - `GET /admin/rules` → `rewardConfig.getAll`
  - `PUT /admin/rules/:key {value, reason?}` → `adminService.updateRule`
  - `GET /admin/budget` → `adminService.getBudgetStatus`
  - `GET /admin/audit-log?action_type&target_type&admin_id&limit&offset` → `adminService.listAuditLog`
Middleware: `authenticate()` on all; admin routes add `authorize(['admin','moderator'])` + rate limiter.
Analytics events: (fired inside services; route layer never emits events directly)
Tests: `test/integration/rewards-api.test.js` — auth required, validators reject bad inputs, response shapes match API contract doc, admin authz enforced, pagination round-trip.

### File: backend/src/modules/referrals/routes.js
Purpose: Buyer referral routes under `/api/referrals`.
Depends on: `reward-referrals`, `reward-admin`
Routes:
  - `GET /code` → `referralService.getOrCreateCode`
  - `GET /status` → `referralService.getStatus`
  - `POST /share {channel, metadata?}` → `referralService.recordShare`
  - `POST /attribute {code, device_fingerprint?}` → `referralService.attributeSignup` (IP from `req.ip`)
  - `POST /admin/:id/approve {reason}` → `adminService.approveReferral`
  - `POST /admin/:id/reject {reason}` → `adminService.rejectReferral`
Analytics events: (fired inside services)
Tests: `test/integration/referrals-api.test.js` — fraud rejection status codes, happy-path attribution, admin authz.

### File: mobile/src/lib/rewards.ts
Purpose: Mobile API client — thin wrappers over `apiRequest`, matching API contract doc. React Query key registry exported as `rewardsQueryKeys`.
Depends on: `mobile/src/lib/api` (existing `apiRequest`), `mobile/src/types/rewards`
Key functions (all return `Promise<...>`):
  - `fetchRewardBalance()`, `fetchRewardHistory(params)`
  - `fetchTierInfo()`
  - `fetchStreakState()`, `submitDailyCheckIn()`
  - `fetchAvailableChallenges(params)`, `fetchMyChallenges(params)`, `enrollInChallenge(id)`
  - `previewCheckoutEarn(body)`, `previewCheckoutRedemption(body)`
  - `fetchReferralCode()`, `fetchReferralStatus()`, `recordReferralShare(body)`, `attributeReferral(body)`
  - `fetchBoosts(params)`, `fetchBoost(id)`, `createBoost(body)`, `activateBoost(id, ref?)`, `pauseBoost(id)`, `resumeBoost(id)`, `cancelBoost(id, reason?)`
  - `rewardsQueryKeys`: stable React Query keys.
Analytics events: (the mobile analytics package handles screen/event emission; these helpers don't emit directly)
Tests: `mobile/src/lib/rewards.test.ts` — URL + payload shape assertions via mocked `apiRequest`; React Query key stability.

---

## 13. Seller Analytics API

### File: backend/src/modules/boosts/routes.js
Purpose: Seller-facing boost HTTP routes under `/api/boosts`.
Depends on: `reward-boosts`, `modules/rewards/validators`, `modules/rewards/constants`
Routes:
  - `GET /?status&limit&offset` → `boostService.listBoosts`
  - `POST / {listing_id?, store_id?, type, budget_minor, multiplier, duration_hours}` → `boostService.createBoost`
  - `GET /:id` → `boostService.getBoost`
  - `POST /:id/activate {payment_reference?}` → `boostService.activateBoost`
  - `POST /:id/pause` → `boostService.pauseBoost`
  - `POST /:id/resume` → `boostService.resumeBoost`
  - `POST /:id/cancel {reason?}` → `boostService.cancelBoost`
Middleware: `authenticate()` + 20/min write limiter; seller ownership enforced in service (queries include `seller_id = req.user.id`).
Analytics events: (fired inside `boostService`)
Tests: `test/integration/boosts-api.test.js` — only owner can mutate (404 on non-owner), lifecycle transitions, validator rejects invalid multiplier/type/budget.

### File: backend/src/modules/seller-analytics/routes.js (future — stubbed)
Purpose: Aggregate seller-side reward impact: points-redeemed-against-store over time, boost ROI, trust band, refund clawbacks. **Not built in initial vertical** — add when analytics dashboard mockups land. Placeholder route file returns 501.
Depends on: `db`, `reward-ledger`, `reward-boosts`
Key functions (planned):
  - `GET /stores/:storeId/rewards-summary?since&until`
  - `GET /stores/:storeId/boost-roi?since&until`
  - `GET /stores/:storeId/trust`
Analytics events: `seller.analytics.viewed`
Tests: (deferred to feature implementation)

---

## 14. Analytics Event Emitter

### File: backend/src/services/analytics.js (existing — extended)
Purpose: The existing analytics service (non-blocking, fire-and-forget `track(eventName, payload)`) is reused verbatim. Every reward service takes it as an optional dependency and calls `.track(...).catch(() => {})` so failures never break the request path.
Depends on: (existing)
Key functions (existing):
  - `track(eventName: string, payload: object): Promise<void>`
  - `flush(): Promise<void>`
Analytics events: (emits whatever callers pass — see event inventory below)
Tests: (existing tests cover core behavior)

### Event taxonomy reference (emitted by reward services)

Naming convention: `<domain>.<entity>.<action>`. Payloads never include PII — `user_id` only.

| Domain | Events |
|---|---|
| `rewards.points` | `earned`, `redeemed`, `voided`, `velocity_exceeded` |
| `rewards.tier` | `upgraded`, `downgraded`, `grace_started` |
| `rewards.streak` | `started`, `continued`, `milestone_reached`, `broken`, `shielded` |
| `rewards.challenge` | `enrolled`, `progressed`, `completed`, `expired` |
| `rewards.checkout` | `earn_previewed`, `redemption_previewed` |
| `rewards.order` | `refunded` |
| `rewards.admin` | `credit`, `debit`, `account_frozen`, `account_unfrozen`, `rule_updated`, `flag_resolved`, `referral_approved`, `referral_rejected` |
| `rewards.rule` | `updated` |
| `growth.referral` | `code_created`, `shared`, `signup_attributed`, `qualifying_purchase`, `held`, `released`, `forfeited`, `fraud_blocked`, `hold_extended` |
| `trust.score` | `calculated`, `changed` |
| `trust.band` | `changed` |
| `trust.fraud` | `detected`, `resolved` |
| `trust.account` | `auto_frozen`, `auto_suspended` |
| `boost` | `created`, `activated`, `paused`, `resumed`, `cancelled`, `spend_recorded`, `completed`, `expired`, `trust_gate_rejected` |
| `cron.reward_job` | `started`, `completed`, `failed` |

Every required payload field per event is specified in the Analytics Event Taxonomy PDF; the services implement those contracts exactly.

---

## Wiring: app bootstrap, env, cron

### Modifications to existing files

**`backend/src/app.js`** — import all 12 new service factories + 3 new routers; instantiate services in the `createApp` factory; attach to `app.locals`; mount routers under `/rewards`, `/referrals`, `/boosts`.

**`backend/src/index.js`** — call `rewardConfig.preload()` on startup; instantiate `createRewardJobs(...)` with all dependent services; call `.start()` after server listens; call `.stop()` in the shutdown handler before `server.close()`.

**`backend/src/config/env.js`** — parse `REWARD_CRON_ENABLED` as boolean (default `true`, default `false` in test env). Expose as `config.rewardCronEnabled`.

**`backend/.env.example`** — document the new env var under a `# --- Rewards & Growth Engine ---` section.

### Dependency graph

```
constants ─┐
validators ┤
           ├─► reward-config ─► reward-rules-engine
           │                    │
           │                    ▼
           ├─────────────► reward-ledger ─► reward-tiers
           │                    │               │
           │                    ├──► reward-streaks
           │                    │
           │                    ├──► reward-challenges
           │                    │
           │                    └──► reward-referrals
           │
           └─► reward-trust ─► reward-boosts ─► reward-ranking
                                   │
                                   ▼
                            reward-checkout (uses ledger, rules-engine, tiers, streaks)
                                   │
                                   ▼
                            reward-admin (uses ledger, trust, referrals, config)
                                   │
                                   ▼
                            reward-notifications

routes/rewards   ─► ledger, tiers, streaks, challenges, checkout, admin, config
routes/referrals ─► referrals, admin
routes/boosts    ─► boosts

cron/reward-jobs ─► streaks, tiers, referrals, boosts, challenges, trust
```

### Execution checklist for Cursor

```
### Phase 1 — Shared primitives
- [ ] constants.js + test
- [ ] validators.js + test
- [ ] mobile/types/rewards.ts

### Phase 2 — Schema
- [ ] migration 40000 (core)   — up/down verified
- [ ] migration 41000 (referrals/challenges) — up/down verified
- [ ] migration 42000 (trust/boost/admin) — up/down verified

### Phase 3 — Foundational services
- [ ] reward-config.js + test
- [ ] reward-ledger.js + unit + integration test
- [ ] reward-rules-engine.js + unit test (no DB)

### Phase 4 — Domain services
- [ ] reward-tiers.js + test
- [ ] reward-streaks.js + test
- [ ] reward-challenges.js + test
- [ ] reward-referrals.js + unit + integration test
- [ ] reward-trust.js + unit + integration test
- [ ] reward-boosts.js + test
- [ ] reward-ranking.js + test

### Phase 5 — Orchestration
- [ ] reward-checkout.js + unit + integration test
- [ ] reward-notifications.js + test
- [ ] reward-admin.js + unit + integration test

### Phase 6 — HTTP layer & cron
- [ ] modules/rewards/routes.js + integration test
- [ ] modules/referrals/routes.js + integration test
- [ ] modules/boosts/routes.js + integration test
- [ ] cron/reward-jobs.js + test
- [ ] app.js — wire services + mount routers
- [ ] index.js — preload config + start cron + stop on shutdown
- [ ] config/env.js — REWARD_CRON_ENABLED
- [ ] .env.example — document new var

### Phase 7 — Mobile client
- [ ] mobile/src/lib/rewards.ts + test

### Pre-merge guardrails
- [ ] `npm test` green (backend)
- [ ] `npm run migrate:up && npm run migrate:down` clean for all 3 migrations
- [ ] `node --check` every new file
- [ ] No hardcoded point values in code (grep for numbers — all must come from rewardConfig)
- [ ] No raw SQL outside of services (grep for `db.query(` in routes — should be zero)
- [ ] Every service exports a `createXxx` factory (no classes, no globals)
- [ ] Every new env var is in `.env.example`
- [ ] Every user-facing feature has at least `.started` and `.completed/.failed` analytics events
```
