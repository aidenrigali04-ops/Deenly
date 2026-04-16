# Cursor Engineering Handoff: Deenly Rewards & Growth Engine

> **Last updated:** 2026-04-15
> **Status:** Backend services + tests implemented. Mobile screens, integration tests, and final wiring remain.
> **Use this doc in Cursor:** Open it as your primary reference. Each sprint has a ready-to-paste Cursor prompt.

---

## 1. Project Context

Deenly is a Muslim-first social commerce mobile app. The Rewards & Growth Engine adds buyer loyalty points, referral credits, seller boosts, performance-based ranking, fraud prevention, and admin controls on top of the existing social platform.

The backend is a modular monolith running Node.js/Express/PostgreSQL. Every point mutation flows through an append-only ledger (`reward_ledger_entries`). Balances are derived, never stored directly. All business rules (point rates, caps, multipliers, thresholds) live in a `reward_rules_config` database table with an in-memory cache (60s TTL) — nothing is hardcoded. The system has 5 buyer tiers (Explorer through Elite), daily streaks with shields, challenges, a two-sided referral system with 14-day fraud-holds, seller boost multipliers on organic ranking, and a composite trust score (0-1000) that gates features and applies penalty multipliers.

The mobile client is Expo/React Native with TypeScript. State flows through Zustand stores and TanStack React Query (v5). All API types and client functions are already defined in `mobile/src/types/rewards.ts` and `mobile/src/lib/rewards.ts`. The remaining work is building the screens, hooks, and navigation for the buyer rewards wallet, referral sharing, streak check-in, and challenge participation — plus the seller boost management screen and the admin dashboard.

---

## 2. Tech Stack Reference

| Layer | Stack | Version | Notes |
|-------|-------|---------|-------|
| Mobile | Expo / React Native | 55 / 0.83.4 | React 19.2 |
| Navigation | React Navigation | v7 | bottom-tabs + native-stack |
| Mobile State | Zustand + React Query | 5 / 5.95 | |
| Backend | Node.js / Express | 20+ / 4.21 | |
| Database | PostgreSQL | pg 8.13 | |
| Migrations | node-pg-migrate | 7.9 | |
| Auth | JWT + Argon2 | 9 / 0.41 | |
| Push | Expo Server SDK | 6.1 | |
| Testing | Jest (unit/integration) | 29 | |
| E2E | Playwright | 1.53 | |
| Logging | Pino | 9.5 | |

**Do not add competing libraries.** Check `CLAUDE.md` section 2 before introducing any dependency.

---

## 3. Folder Structure

```
backend/
  src/
    config/env.js              # Env parsing — REWARD_CRON_ENABLED lives here
    db.js                      # pg pool: query(), getClient(), close()
    app.js                     # Express factory — all 13 reward services wired here
    index.js                   # Startup: preload config, start cron, shutdown handler
    middleware/                 # auth.js, error-handler.js
    modules/
      rewards/
        constants.js           # 26 frozen enums/configs — source of truth for CHECK constraints
        validators.js          # Input validation helpers (12 functions)
        routes.js              # Buyer + admin reward routes (17 endpoints)
      referrals/
        routes.js              # Referral routes (6 endpoints)
      boosts/
        routes.js              # Seller boost routes (7 endpoints)
    services/
      reward-config.js         # KV config from reward_rules_config (60s cache)
      reward-rules-engine.js   # Pure business logic — earn, redemption, tier, streak math
      reward-ledger.js         # THE point mutation service — all credits/debits here
      reward-tiers.js          # Tier progression, grace periods, batch requalify
      reward-streaks.js        # Daily check-in, shields, batch break detection
      reward-challenges.js     # Enrollment, progress tracking, auto-completion
      reward-referrals.js      # Attribution, hold management, fraud checks
      reward-trust.js          # Composite trust score, fraud flags, auto-actions
      reward-boosts.js         # Seller boost lifecycle, spend tracking
      reward-ranking.js        # Organic x boost x trust composition
      reward-checkout.js       # Checkout orchestration (preview/apply/confirm/refund)
      reward-notifications.js  # Push notification builder
      reward-admin.js          # Admin operations + audit trail
      __test-helpers__/
        reward-stubs.js        # Shared DB/config/analytics stubs for unit tests
    cron/
      reward-jobs.js           # Scheduled jobs (streak, tier, referral, challenge, boost, trust)
  migrations/
    1730000040000_create_rewards_engine_core.js      # reward_accounts, ledger, redemptions, rules_config
    1730000041000_create_referrals_and_challenges.js  # referral_codes/relationships/events/rewards, challenges
    1730000042000_create_trust_boost_admin.js          # trust, boost, fraud_flags, admin_actions

mobile/
  src/
    types/rewards.ts           # 30+ TypeScript types mirroring API contracts
    lib/rewards.ts             # 24 API client functions + rewardsQueryKeys
    screens/app/               # WHERE NEW SCREENS GO
    hooks/                     # WHERE NEW HOOKS GO
    store/                     # WHERE ZUSTAND STORES GO
    components/                # WHERE SHARED COMPONENTS GO
    navigation/AppNavigator.tsx # Register new screens here
    theme.ts                   # Design tokens

docs/
    implementation-plan-rewards-growth-engine-v2.md  # 14-section build plan
    testing-strategy-rewards-growth-engine.md         # Testing philosophy + test plan
    cursor-engineering-handoff-rewards.md             # THIS FILE
```

---

## 4. Cursor Rules (from CLAUDE.md)

Every sprint must follow these rules. Paste them into your Cursor system prompt or `.cursorrules`:

```
## Mandatory Rules for Rewards Engine Work

1. NEVER mutate balances directly — all mutations go through ledgerService.creditPoints() / debitPoints()
2. NEVER hardcode point values — all amounts, multipliers, caps from rewardConfig service
3. NEVER issue referral credits before refund window — rewards stay in 'held' status
4. NEVER override ranking with boosts — boosts are multipliers on organic score; zero organic = zero
5. NEVER use floats for money/points — all amounts are integers (1 DP = 1 cent)
6. NEVER skip tests on business logic — every sprint ends with passing tests
7. NEVER commit schema changes without a migration file — all DDL through node-pg-migrate
8. NEVER log PII — use user_id references only
9. NEVER import from another module's internal files — use exported factory functions
10. ASK before making schema changes — confirm migration plan before writing DDL

## Code Patterns
- Factory DI: createXxxService({ db, config, analytics })
- Route handler: asyncHandler(async (req, res) => { ... })
- All async route handlers wrapped with asyncHandler()
- Input validation at route level using validators.js
- Analytics events emitted in service layer, not route handlers
- Tests co-located: service.test.js next to service.js
- Cursor-based pagination with { createdAt, id } encoded as base64url JSON
```

---

## 5. Implementation Order

The backend services are **already implemented and tested** (149 unit tests passing). The remaining work is organized into 14 sprints focused on:

- **Sprints 1-3:** Backend hardening (integration tests, missing edge cases, migration verification)
- **Sprints 4-8:** Mobile screens (buyer wallet, streak, challenges, referrals)
- **Sprints 9-10:** Seller-facing features (boost management, analytics)
- **Sprints 11-12:** Admin dashboard
- **Sprints 13-14:** Load testing, final polish, CI/CD

```
Sprint  1: Migration verification & seed data
Sprint  2: Integration tests — checkout lifecycle
Sprint  3: Integration tests — referral + fraud scenarios
Sprint  4: Mobile — Rewards wallet screen
Sprint  5: Mobile — Streak check-in & calendar
Sprint  6: Mobile — Challenge browser & enrollment
Sprint  7: Mobile — Referral sharing & tracking
Sprint  8: Mobile — Checkout earn/redeem integration
Sprint  9: Mobile — Seller boost management
Sprint 10: Mobile — Seller analytics dashboard
Sprint 11: Frontend — Admin rewards dashboard
Sprint 12: Frontend — Admin fraud & audit views
Sprint 13: Load testing (k6)
Sprint 14: CI/CD pipeline + final review
```

---

## 6. Sprint Details

---

### Sprint 1: Migration Verification & Seed Data

**Goal:** Confirm all 3 reward migrations run cleanly up/down, seed dev data, verify config preload.

**Files to create:**
- `backend/test/fixtures/rewards/seed-dev-data.js`
- `backend/test/integration/migrations.test.js`

**Step-by-step:**
1. Run `npm run migrate:up` in a fresh local database — all 3 reward migrations should succeed
2. Run `npm run migrate:down` 3 times — each migration should cleanly reverse
3. Run `npm run migrate:up` again — verify idempotent re-run
4. Create `seed-dev-data.js` with factory functions that insert: 5 users across different tiers, 10 ledger entries per user, 2 referral relationships (1 pending, 1 qualified), 3 challenge definitions, 2 boost campaigns
5. Create `migrations.test.js` that programmatically runs up/down and verifies table existence
6. Run `npm test` — all existing 149 tests + new ones pass

**Acceptance criteria:**
- [ ] `migrate:up` creates all 16 reward tables
- [ ] `migrate:down` drops all 16 tables cleanly
- [ ] Seed data inserts without constraint violations
- [ ] `reward_rules_config` has all 32 seeded config rows
- [ ] All tests pass

**Analytics events:** None (infrastructure sprint).

**Tests required:**
- Migration up/down roundtrip (integration)
- Seed data insertion without errors
- Config preload returns expected keys

**Definition of done:** Migrations verified, seed script works, existing 149 tests still pass.

---

### Sprint 2: Integration Tests — Checkout Lifecycle

**Goal:** End-to-end test of earn preview → apply redemption → confirm earn → refund, hitting real service layers with stubbed DB.

**Files to create:**
- `backend/test/integration/checkout-lifecycle.test.js`

**Step-by-step:**
1. Create test that sets up a full service stack (rewardConfig → rulesEngine → ledger → tier → streak → checkout) with DB stubs
2. Test: preview earn for a $50 order by a Member-tier user with 7-day streak — verify multiplier composition
3. Test: preview redemption with 3000 DP balance — verify max_points and discount_minor
4. Test: apply redemption for 1000 DP → verify ledger debit created with idempotency key `redeem:{orderId}`
5. Test: confirm earn → verify ledger credit with idempotency key `earn:{orderId}`, verify tier requalification triggered
6. Test: refund order → verify both entries voided, balance restored
7. Test: retry confirm earn with same orderId — verify idempotent (same entry returned, no double-credit)
8. Test: earn when daily cap already 95% full — verify partial earn + wasCapped flag

**Acceptance criteria:**
- [ ] Full earn→redeem→refund lifecycle passes
- [ ] Idempotency prevents double-credit on retry
- [ ] Daily cap enforcement produces partial earn
- [ ] Refund voids both earn and redeem entries
- [ ] Balance math is exactly correct (integer arithmetic, no rounding errors)

**Analytics events verified in test:**
- `rewards.points.earned` (amount, source, balance_after, multiplier_applied, tier_at_earn)
- `rewards.points.redeemed` (amount, discount_minor, balance_after)
- `rewards.order.refunded` (earn_voided, redemption_voided)

**Tests required:** 8 integration tests as described above.

**Definition of done:** All 8 integration tests pass. Existing 149 unit tests still pass.

---

### Sprint 3: Integration Tests — Referral & Fraud Scenarios

**Goal:** Test the referral lifecycle end-to-end and fraud detection edge cases.

**Files to create:**
- `backend/test/integration/referral-lifecycle.test.js`
- `backend/test/integration/fraud-scenarios.test.js`

**Step-by-step:**
1. Referral lifecycle: create code → attribute signup → qualifying purchase → hold period → release → ledger credit
2. Referral fraud: self-referral blocked, device overlap detected, monthly cap enforced, IP overlap flagged but allowed
3. Fraud scenario: velocity breach triggers flag → critical severity auto-freezes account → subsequent earn rejected with 403
4. Fraud scenario: trust score recalculation after flag → band drops → boost activation blocked for poor/high_risk
5. Admin override: admin approves held referral early → reward released immediately

**Acceptance criteria:**
- [ ] Self-referral returns `rejectedReason: "self_referral"` without creating a relationship
- [ ] Device fingerprint overlap returns `rejectedReason: "device_overlap"` + emits fraud event
- [ ] Monthly cap returns `rejectedReason: "monthly_cap_exceeded"` at cap
- [ ] Hold release credits correct amount to referrer after hold period
- [ ] Critical fraud flag auto-freezes account
- [ ] Frozen account rejects creditPoints with 403
- [ ] Admin approve releases held rewards immediately

**Analytics events verified:**
- `growth.referral.attributed`, `growth.referral.qualified`, `growth.referral.completed`
- `growth.referral.fraud_detected` (device_overlap)
- `trust.fraud.detected`, `trust.account.frozen`

**Tests required:** 10+ integration tests.

**Definition of done:** All fraud scenarios covered. Full test suite passes.

---

### Sprint 4: Mobile — Rewards Wallet Screen

**Goal:** Build the main rewards wallet screen showing balance, tier, streak preview, and transaction history.

**Files to create:**
- `mobile/src/screens/app/RewardsWalletScreen.tsx`
- `mobile/src/hooks/useRewardsAccount.ts`
- `mobile/src/components/rewards/TierBadge.tsx`
- `mobile/src/components/rewards/PointsBalance.tsx`
- `mobile/src/components/rewards/LedgerHistoryList.tsx`

**Step-by-step:**
1. Create `useRewardsAccount` hook wrapping React Query calls to `fetchRewardBalance`, `fetchTierInfo`, `fetchStreakState`
2. Build `PointsBalance` component — large number display with animated count-up, dollar value subtitle (balance / 100)
3. Build `TierBadge` — tier name + icon + progress bar to next tier (rolling_12m_points / next_threshold)
4. Build `LedgerHistoryList` — FlatList with cursor-based infinite scroll using `fetchRewardHistory`, grouped by date
5. Compose into `RewardsWalletScreen` — pull-to-refresh, loading skeleton, error state, empty state
6. Register screen in `AppNavigator.tsx`
7. Add to bottom tab if applicable, or as a stack screen under the profile tab

**Acceptance criteria:**
- [ ] Balance displays as integer DP with dollar equivalent (e.g., "3,250 DP ($32.50)")
- [ ] Tier badge shows current tier name, multiplier, and progress percentage
- [ ] Streak preview shows current streak days, multiplier, and shields remaining
- [ ] History list loads first 20 entries, loads more on scroll
- [ ] Pull-to-refresh invalidates all three queries
- [ ] Loading, error, and empty states all render correctly
- [ ] No hardcoded point values anywhere

**Analytics events:**
- `rewards.wallet.viewed` — emitted on screen focus

**Tests required:**
- Component test for `PointsBalance` (renders formatted balance)
- Component test for `TierBadge` (renders progress bar correctly at 0%, 50%, 100%)
- Hook test for `useRewardsAccount` (loading → success states)

**Definition of done:** Screen renders with mock data. All component tests pass. Navigation works.

---

### Sprint 5: Mobile — Streak Check-in & Calendar

**Goal:** Build daily check-in flow with streak calendar visualization.

**Files to create:**
- `mobile/src/screens/app/StreakScreen.tsx`
- `mobile/src/components/rewards/StreakCalendar.tsx`
- `mobile/src/components/rewards/StreakCheckInButton.tsx`
- `mobile/src/hooks/useStreak.ts`

**Step-by-step:**
1. Create `useStreak` hook: `fetchStreakState` query + `submitDailyCheckIn` mutation with optimistic update
2. Build `StreakCalendar` — 30-day grid showing checked-in days (green), missed days (red), shields used (yellow), today (pulsing)
3. Build `StreakCheckInButton` — disabled if already checked in today, shows bonus points earned on success, animates on tap
4. Compose into `StreakScreen` — calendar at top, check-in button centered, streak stats (current/longest/multiplier/shields) below
5. After successful check-in: invalidate streak query, show success toast with "+5 DP" and new multiplier
6. Register in navigation

**Acceptance criteria:**
- [ ] Check-in button disabled + labeled "Checked in!" when `checked_in_today === true`
- [ ] Successful check-in shows toast with bonus points and new multiplier
- [ ] Calendar correctly highlights last 30 days based on streak data
- [ ] Multiplier badge updates immediately via optimistic update
- [ ] Shield count visible (e.g., "2 shields remaining")
- [ ] Error state shows retry button

**Analytics events:**
- `rewards.streak.viewed` — on screen focus
- `rewards.streak.checkin.tapped` — on button tap (before API call)

**Tests required:**
- Component test: `StreakCheckInButton` disabled state vs enabled state
- Hook test: `useStreak` optimistic update on check-in

**Definition of done:** Check-in works end-to-end with real API. Calendar renders. Tests pass.

---

### Sprint 6: Mobile — Challenge Browser & Enrollment

**Goal:** Build challenge discovery, enrollment, and progress tracking screens.

**Files to create:**
- `mobile/src/screens/app/ChallengesScreen.tsx`
- `mobile/src/screens/app/ChallengeDetailScreen.tsx`
- `mobile/src/components/rewards/ChallengeCard.tsx`
- `mobile/src/components/rewards/ChallengeProgress.tsx`
- `mobile/src/hooks/useChallenges.ts`

**Step-by-step:**
1. Create `useChallenges` hook: `fetchAvailableChallenges` + `fetchMyChallenges` queries, `enrollInChallenge` mutation
2. Build `ChallengeCard` — title, reward points badge, type tag (daily/weekly/monthly), time remaining, progress bar (if enrolled)
3. Build `ChallengeProgress` — circular progress indicator showing progress/target
4. Build `ChallengesScreen` — two tabs: "Available" (from `listAvailable`) and "My Challenges" (from `getUserChallenges`)
5. Build `ChallengeDetailScreen` — full details, enroll button (or progress if enrolled), criteria description
6. Enroll button → mutation → invalidate both lists → navigate to detail
7. Register both screens in navigation

**Acceptance criteria:**
- [ ] Available tab shows only challenges not yet enrolled in, sorted by newest
- [ ] My Challenges tab shows enrolled challenges with progress bars
- [ ] Completed challenges show "Completed" badge with reward amount
- [ ] Enroll button grays out and shows "Enrolled" after enrollment
- [ ] Challenge full (max_participants) shows "Full" instead of enroll button
- [ ] Expired challenges don't appear in available list

**Analytics events:**
- `rewards.challenges.viewed` — on screen focus
- `rewards.challenge.detail_viewed` — on detail screen
- `rewards.challenge.enroll_tapped` — before API call

**Tests required:**
- Component test: `ChallengeCard` renders all variants (available, enrolled, completed, full)
- Hook test: `useChallenges` enrollment mutation invalidates queries

**Definition of done:** Both screens navigate correctly. Enrollment works. Tests pass.

---

### Sprint 7: Mobile — Referral Sharing & Tracking

**Goal:** Build referral code sharing screen and referral status dashboard.

**Files to create:**
- `mobile/src/screens/app/ReferralScreen.tsx`
- `mobile/src/components/rewards/ReferralCodeCard.tsx`
- `mobile/src/components/rewards/ReferralStatusList.tsx`
- `mobile/src/hooks/useReferrals.ts`

**Step-by-step:**
1. Create `useReferrals` hook: `fetchReferralCode` + `fetchReferralStatus` queries, `recordReferralShare` mutation
2. Build `ReferralCodeCard` — large code display, share URL, share button (opens native share sheet), monthly usage counter (3/10 this month)
3. Build `ReferralStatusList` — list of referral items showing referee name, status badge (pending/qualified/rewarded), hold countdown ("Release in 12 days"), reward amount
4. Compose into `ReferralScreen` — code card at top, summary stats (total earned DP, pending DP), list below
5. Share button: trigger native share sheet with message + link, then call `recordReferralShare({ channel })` for analytics
6. Register in navigation

**Acceptance criteria:**
- [ ] Referral code auto-generated on first visit (getOrCreateCode)
- [ ] Share button opens native share sheet with referral link
- [ ] Share event recorded with correct channel (whatsapp/sms/copy_link/other)
- [ ] Monthly cap shown ("3 of 10 referrals used this month")
- [ ] Status list shows hold countdown for qualified referrals
- [ ] Rewarded referrals show earned amount

**Analytics events:**
- `growth.referral.screen_viewed`
- `growth.referral.share_tapped` (channel)
- `growth.referral.code_copied`

**Tests required:**
- Component test: `ReferralCodeCard` renders code and share button
- Component test: `ReferralStatusList` renders all status variants

**Definition of done:** Code generation works. Share sheet opens. Status list renders. Tests pass.

---

### Sprint 8: Mobile — Checkout Earn/Redeem Integration

**Goal:** Integrate reward earn preview and redemption into the existing checkout flow.

**Files to create:**
- `mobile/src/components/rewards/CheckoutEarnPreview.tsx`
- `mobile/src/components/rewards/CheckoutRedeemSlider.tsx`
- `mobile/src/hooks/useCheckoutRewards.ts`

**Step-by-step:**
1. Create `useCheckoutRewards` hook: wraps `previewCheckoutEarn` + `previewCheckoutRedemption` with cart total as param, auto-refetches when cart changes
2. Build `CheckoutEarnPreview` — "You'll earn X DP" banner showing base points, multiplier breakdown (tier × streak), capped indicator if applicable
3. Build `CheckoutRedeemSlider` — slider from 0 to max_points, shows discount in dollars, minimum redemption threshold, balance remaining after
4. Integrate both components into the existing checkout screen (find in `mobile/src/screens/app/`)
5. On order confirmation: call `confirmEarn` from the order success handler
6. On order refund: call `refundOrder` to void entries

**Acceptance criteria:**
- [ ] Earn preview shows correct multiplier breakdown (base × tier × streak)
- [ ] Earn preview updates when cart total changes
- [ ] Redeem slider capped at maxRedeemablePoints (never exceeds 50% of cart)
- [ ] Slider shows dollar discount updating in real-time
- [ ] Minimum redemption enforced (slider snaps to 0 or min threshold)
- [ ] "Not enough points" message when balance < minRedemptionPoints
- [ ] Frozen account shows "Rewards unavailable" instead of slider

**Analytics events:**
- `rewards.checkout.earn_preview_viewed`
- `rewards.checkout.redeem_slider_opened`
- `rewards.checkout.redeem_applied` (points, discount_minor)

**Tests required:**
- Component test: `CheckoutEarnPreview` multiplier breakdown display
- Component test: `CheckoutRedeemSlider` min/max enforcement, frozen state
- Hook test: `useCheckoutRewards` recalculates on cart change

**Definition of done:** Earn preview and redeem slider work in checkout. Order confirm credits points. Tests pass.

---

### Sprint 9: Mobile — Seller Boost Management

**Goal:** Build the seller-facing boost creation and management screen.

**Files to create:**
- `mobile/src/screens/app/BoostManagementScreen.tsx`
- `mobile/src/screens/app/CreateBoostScreen.tsx`
- `mobile/src/components/rewards/BoostCard.tsx`
- `mobile/src/hooks/useBoosts.ts`

**Step-by-step:**
1. Create `useBoosts` hook: `fetchBoosts` query, mutations for `createBoost`, `activateBoost`, `pauseBoost`, `resumeBoost`, `cancelBoost`
2. Build `BoostCard` — status badge, listing/store name, budget bar (spent/total), multiplier, time remaining, action buttons per status
3. Build `BoostManagementScreen` — tabs by status (active/paused/draft/completed), FlatList of BoostCards
4. Build `CreateBoostScreen` — form: select listing/store, type picker (standard/premium/featured), budget input (validates min), duration picker, multiplier display, "Create Draft" button
5. Action flows: Draft → Activate (trust gate check, payment), Active → Pause, Paused → Resume, Any → Cancel
6. Register both screens

**Acceptance criteria:**
- [ ] Draft boosts show "Activate" button; activation checks trust gate
- [ ] Active boosts show spend progress bar and time remaining
- [ ] Pause/resume toggles correctly
- [ ] Cancel shows confirmation dialog with "Cancel Boost" button
- [ ] Budget validates against type minimum (standard: 500, premium: 1500, featured: 5000)
- [ ] Trust gate failure shows "Your trust score is too low to boost" message
- [ ] Completed boosts show final impressions count

**Analytics events:**
- `boost.management.viewed`
- `boost.create.started`, `boost.create.completed`
- `boost.activated`, `boost.paused`, `boost.cancelled`

**Tests required:**
- Component test: `BoostCard` renders all 5 status variants correctly
- Component test: `CreateBoostScreen` validates min budget

**Definition of done:** Boost CRUD works end-to-end. Trust gate enforced. Tests pass.

---

### Sprint 10: Mobile — Seller Analytics Dashboard

**Goal:** Build seller analytics screen showing earnings breakdown, boost ROI, and trust metrics.

**Files to create:**
- `mobile/src/screens/app/SellerAnalyticsScreen.tsx`
- `mobile/src/components/rewards/EarningsChart.tsx`
- `mobile/src/components/rewards/BoostROICard.tsx`
- `mobile/src/components/rewards/TrustScoreCard.tsx`
- `mobile/src/hooks/useSellerAnalytics.ts`

**Step-by-step:**
1. Create API functions for seller analytics endpoints (if not yet in `lib/rewards.ts`)
2. Create `useSellerAnalytics` hook
3. Build `EarningsChart` — weekly/monthly bar chart of points earned from sales
4. Build `BoostROICard` — total boost spend, impressions gained, cost per impression
5. Build `TrustScoreCard` — composite score, 5 component bars (identity/behavioral/transaction/social/device), band badge
6. Compose into `SellerAnalyticsScreen` — scrollable dashboard with all cards
7. Register in navigation

**Acceptance criteria:**
- [ ] Earnings chart shows correct date range and point totals
- [ ] Boost ROI shows impressions per dollar spent
- [ ] Trust score shows all 5 components with correct weights
- [ ] Band badge color matches trust band (excellent=green, good=blue, fair=yellow, poor=orange, high_risk=red)
- [ ] Pull-to-refresh reloads all analytics

**Analytics events:**
- `seller.analytics.viewed`
- `seller.analytics.period_changed` (period: week/month/quarter)

**Tests required:**
- Component test: `TrustScoreCard` renders 5 component bars with correct labels
- Component test: `BoostROICard` handles zero-impressions edge case

**Definition of done:** Dashboard renders with real data. All component tests pass.

---

### Sprint 11: Frontend — Admin Rewards Dashboard

**Goal:** Build the Next.js admin dashboard for rewards management.

**Files to create:**
- `frontend/src/app/admin/rewards/page.tsx`
- `frontend/src/app/admin/rewards/accounts/page.tsx`
- `frontend/src/app/admin/rewards/rules/page.tsx`
- `frontend/src/components/admin/RewardAccountTable.tsx`
- `frontend/src/components/admin/RuleConfigEditor.tsx`
- `frontend/src/components/admin/BudgetStatusCard.tsx`
- `frontend/src/lib/admin-rewards.ts`

**Step-by-step:**
1. Create admin API client functions for: list accounts, search account, adjust points, freeze/unfreeze, get budget status, list/update rules
2. Build `BudgetStatusCard` — daily + monthly spend vs cap with progress bars and utilization percentage
3. Build `RewardAccountTable` — searchable table of reward accounts with balance, tier, streak, frozen status. Row click opens detail.
4. Build detail drawer: balance, tier, streak info, recent ledger entries, freeze/unfreeze button, manual credit/debit form
5. Build `RuleConfigEditor` — editable table of all 32+ config rules with current value, edit button, save with required reason
6. All admin endpoints use `requireAccessSecret()` middleware
7. Add to admin sidebar navigation

**Acceptance criteria:**
- [ ] Budget status shows real-time daily/monthly utilization
- [ ] Account search by user ID or username works
- [ ] Manual credit shows new balance immediately after submission
- [ ] Freeze shows confirmation dialog with required reason (min 3 chars)
- [ ] Rule update requires reason and shows before/after values
- [ ] All actions require admin authentication
- [ ] Audit trail entry created for every action

**Analytics events:**
- `admin.rewards.dashboard_viewed`
- `admin.rewards.account_searched`
- `admin.rewards.points_adjusted` (direction, amount)
- `admin.rewards.account_frozen`, `admin.rewards.account_unfrozen`
- `admin.rewards.rule_updated` (key, old_value, new_value)

**Tests required:**
- E2E test (Playwright): search account → adjust points → verify balance change
- E2E test: update rule → verify new value displayed

**Definition of done:** Admin can search accounts, adjust points, freeze/unfreeze, and update rules. All actions audited.

---

### Sprint 12: Frontend — Admin Fraud & Audit Views

**Goal:** Build fraud flag management and audit log views.

**Files to create:**
- `frontend/src/app/admin/rewards/fraud/page.tsx`
- `frontend/src/app/admin/rewards/audit/page.tsx`
- `frontend/src/app/admin/rewards/referrals/page.tsx`
- `frontend/src/components/admin/FraudFlagTable.tsx`
- `frontend/src/components/admin/AuditLogTable.tsx`
- `frontend/src/components/admin/ReferralManagementTable.tsx`

**Step-by-step:**
1. Build `FraudFlagTable` — filterable by status (open/investigating/resolved), severity badge (color-coded), user link, evidence preview, resolve button
2. Resolve flow: dialog with resolution dropdown (resolved_legitimate / resolved_fraud) + notes textarea
3. Build `AuditLogTable` — chronological list of all admin actions, filterable by action type, target type, admin ID. Shows before/after state diff.
4. Build `ReferralManagementTable` — list of referrals with status filter, approve/reject buttons for qualified referrals, fraud flag option on reject
5. Approve → immediate reward release. Reject → forfeit + optional fraud flag creation.

**Acceptance criteria:**
- [ ] Fraud flags filterable by status and severity
- [ ] Resolve dialog requires notes (min 3 chars)
- [ ] Critical fraud flags highlighted with red background
- [ ] Audit log shows complete action history with timestamps
- [ ] Referral approve releases rewards immediately (reflected in referrer's balance)
- [ ] Referral reject with fraud flag creates flag on referrer's account
- [ ] All actions require admin auth

**Analytics events:**
- `admin.fraud.flag_viewed`, `admin.fraud.flag_resolved`
- `admin.audit.log_viewed`
- `admin.referral.approved`, `admin.referral.rejected`

**Tests required:**
- E2E: resolve a fraud flag → verify status changes
- E2E: reject referral with fraud flag → verify flag created

**Definition of done:** Fraud management and audit trail fully functional. All actions create audit entries.

---

### Sprint 13: Load Testing

**Goal:** Verify the system handles concurrent point operations, cap enforcement under load, and referral processing at scale.

**Files to create:**
- `loadtests/rewards/earn-concurrent.k6.js`
- `loadtests/rewards/redeem-concurrent.k6.js`
- `loadtests/rewards/referral-attribution.k6.js`
- `loadtests/rewards/streak-checkin-burst.k6.js`
- `loadtests/rewards/README.md`

**Step-by-step:**
1. `earn-concurrent.k6.js` — 50 VUs, each earning points for 60s. Verify: no double-credits (idempotency), daily caps enforced, balance = sum of ledger entries
2. `redeem-concurrent.k6.js` — 20 VUs trying to redeem same user's points simultaneously. Verify: no negative balance, total debited <= original balance
3. `referral-attribution.k6.js` — 30 VUs attributing referrals. Verify: self-referral blocked, monthly cap enforced, no duplicate relationships
4. `streak-checkin-burst.k6.js` — 100 VUs checking in at midnight rollover. Verify: each user gets exactly 1 check-in per day
5. After each test, run validation query comparing balances to ledger sums

**Acceptance criteria:**
- [ ] Zero double-credits across 3000+ concurrent earn attempts
- [ ] Zero negative balances across 1200+ concurrent redemptions
- [ ] Daily cap never exceeded by any user
- [ ] p95 response time < 200ms for earn endpoint
- [ ] p95 response time < 300ms for redemption endpoint
- [ ] Balance integrity check passes: `reward_accounts.balance == SUM(ledger credits) - SUM(ledger debits)` for all users

**Analytics events:** N/A (infrastructure sprint).

**Tests required:** Load test scripts themselves serve as tests. Post-run validation queries.

**Definition of done:** All load tests pass with zero integrity violations. Performance within SLA.

---

### Sprint 14: CI/CD Pipeline & Final Review

**Goal:** Wire up CI checks, finalize coverage gates, and do a final cross-cutting review.

**Files to create:**
- `.github/workflows/rewards-tests.yml` (or update existing CI config)
- `docs/rewards-runbook.md`

**Step-by-step:**
1. Add CI job: `npm test -- --testPathPattern="reward"` — must pass on every PR
2. Add coverage gate: reward services must have >= 85% branch coverage
3. Add CI job: run migrations up/down in test database
4. Create `rewards-runbook.md`: how to deploy, rollback migrations, freeze all accounts in emergency, update business rules, read audit log
5. Final review checklist:
   - All 16 tables have appropriate indexes
   - All endpoints have auth + rate limiting
   - All analytics events match the taxonomy document
   - No hardcoded point values (grep for magic numbers)
   - All error responses use httpError() with correct status codes
   - Mobile screens handle loading/error/empty states
   - Admin actions all create audit trail entries

**Acceptance criteria:**
- [ ] CI runs reward tests on every PR
- [ ] Coverage gate blocks PR merge below 85%
- [ ] Migration up/down verified in CI
- [ ] Runbook covers all emergency procedures
- [ ] Final review checklist passes with zero issues

**Analytics events:** N/A.

**Tests required:** CI pipeline itself is the test.

**Definition of done:** CI green. Runbook complete. Full review checklist passed. Ready for production.

---

## 7. Cursor Prompts

Copy-paste these into Cursor for each sprint. Each prompt is self-contained.

---

### Sprint 1 Prompt

```
## Task: Migration Verification & Seed Data

Context: I'm building the Deenly Rewards & Growth Engine. All backend services are implemented.
The database schema has 3 migration files in backend/migrations/ (1730000040000, 1730000041000, 1730000042000).

### What to do:
1. Create `backend/test/fixtures/rewards/seed-dev-data.js` with factory functions that insert:
   - 5 users across tiers (explorer, member, insider, vip, elite) with matching reward_accounts
   - 10 ledger entries per user (mix of credits and debits)
   - 2 referral relationships (1 pending, 1 qualified with held rewards)
   - 3 challenge definitions (1 daily, 1 weekly, 1 merchant)
   - 2 boost campaigns (1 active standard, 1 draft premium)
   - Ensure balance in reward_accounts matches ledger entry sums

2. Create `backend/test/integration/migrations.test.js` that:
   - Verifies all 16 reward tables exist after migration up
   - Verifies reward_rules_config has 32 seeded rows
   - Verifies all foreign key constraints are in place

### Rules:
- ASK before making any schema changes — do not modify migration files
- All point amounts must be integers
- Use parameterized queries ($1, $2) — no string interpolation
- Factory functions should accept overrides for flexibility

### Acceptance criteria:
- [ ] Seed data inserts without constraint violations
- [ ] Migration test verifies table existence
- [ ] All existing 149 reward unit tests still pass
- [ ] Run: npx jest --testPathPattern="reward" — all green
```

---

### Sprint 2 Prompt

```
## Task: Integration Tests — Checkout Lifecycle

Context: The checkout service is at backend/src/services/reward-checkout.js.
It orchestrates: previewEarn → previewRedemption → applyRedemption → confirmEarn → refundOrder.
Test stubs are in backend/src/services/__test-helpers__/reward-stubs.js.

### What to do:
Create `backend/test/integration/checkout-lifecycle.test.js` with these tests:

1. "full earn→redeem→confirm→refund lifecycle"
   - User (member tier, 7-day streak, 3000 DP balance) checks out $50 order
   - Preview earn returns correct multiplied points (base × 1.5 tier × 1.5 streak)
   - Preview redemption returns max_points capped at 50% of cart
   - Apply 1000 DP redemption → debit created with idempotency key redeem:{orderId}
   - Confirm earn → credit created with idempotency key earn:{orderId}
   - Refund → both entries voided, balance restored

2. "idempotent confirm earn" — same orderId twice → same entry returned, no double credit

3. "daily cap partial earn" — user at 95% of cap → partial earn with wasCapped=true

4. "frozen account blocks redemption" — preview returns eligible:false, reason:account_frozen

5. "zero-amount cart returns zero earn"

6. "below minimum order returns not credited"

### Rules:
- ASK before making any schema changes
- Use the existing makeDbStub from __test-helpers__/reward-stubs.js
- All point amounts are integers — verify no floats in assertions
- Check analytics events are emitted with correct payloads

### Acceptance criteria:
- [ ] All 6+ tests pass
- [ ] Idempotency verified (no double credits)
- [ ] Daily cap enforcement verified
- [ ] Balance math exact (integer arithmetic)
- [ ] Existing 149 unit tests still pass
```

---

### Sprint 3 Prompt

```
## Task: Integration Tests — Referral & Fraud Scenarios

Context: The referral service is at backend/src/services/reward-referrals.js.
The trust service is at backend/src/services/reward-trust.js.
Test stubs in backend/src/services/__test-helpers__/reward-stubs.js.

### What to do:
Create two files:

**backend/test/integration/referral-lifecycle.test.js:**
1. "full referral lifecycle" — create code → attribute signup → qualifying purchase → hold created → admin approve → reward released → ledger credit
2. "hold expiry batch release" — batchReleaseHolds releases clean holds, extends flagged holds, forfeits at max extensions

**backend/test/integration/fraud-scenarios.test.js:**
1. "self-referral blocked" — same userId as referrer and referee → rejected
2. "device overlap detected" — same fingerprint → rejectedReason: device_overlap + fraud event emitted
3. "monthly cap enforced" — 10th referral of month → rejected
4. "critical fraud flag auto-freezes" — createFlag with severity 'critical' → account frozen, subsequent earn rejected 403
5. "poor trust band blocks boost activation" — trust band 'poor' → activateBoost returns 403

### Rules:
- ASK before making any schema changes
- Never issue referral credits before hold period — verify rewards stay in 'held' status
- Verify all fraud detection events emit correct analytics payloads
- Use integer amounts only

### Acceptance criteria:
- [ ] Self-referral returns rejectedReason without creating relationship
- [ ] Device overlap emits growth.referral.fraud_detected event
- [ ] Monthly cap enforced at exact limit
- [ ] Critical severity auto-freezes account
- [ ] Frozen account rejects earn with 403
- [ ] Poor/high_risk trust band blocks boost activation
- [ ] All existing tests still pass
```

---

### Sprint 4 Prompt

```
## Task: Mobile — Rewards Wallet Screen

Context: Deenly mobile is Expo/React Native with TypeScript. Types are defined in
mobile/src/types/rewards.ts. API functions in mobile/src/lib/rewards.ts. State via
Zustand + TanStack React Query v5. Design tokens in mobile/src/theme.ts.

### What to do:
1. Create `mobile/src/hooks/useRewardsAccount.ts`
   - useQuery for fetchRewardBalance (key: rewardsQueryKeys.balance(userId))
   - useQuery for fetchTierInfo (key: rewardsQueryKeys.tier(userId))
   - useQuery for fetchStreakState (key: rewardsQueryKeys.streak(userId))
   - Return { balance, tier, streak, isLoading, error, refetch }

2. Create components in `mobile/src/components/rewards/`:
   - PointsBalance.tsx — large DP number + "$X.XX" subtitle
   - TierBadge.tsx — tier name, multiplier, progress bar (rolling_12m / next_threshold)
   - LedgerHistoryList.tsx — FlatList with useInfiniteQuery, cursor pagination, date grouping

3. Create `mobile/src/screens/app/RewardsWalletScreen.tsx`
   - Compose above components
   - Pull-to-refresh invalidates all queries
   - Loading skeleton, error state, empty state

4. Register in navigation/AppNavigator.tsx

### Rules:
- ASK before making any schema changes
- Use existing types from mobile/src/types/rewards.ts — don't create new ones
- Use rewardsQueryKeys from mobile/src/lib/rewards.ts for cache keys
- All amounts displayed as integers (DP) with dollar conversion (/ 100)
- Loading, error, empty states required for every screen
- Follow existing screen patterns in mobile/src/screens/app/

### Acceptance criteria:
- [ ] Balance shows "X,XXX DP ($XX.XX)"
- [ ] Tier shows name + multiplier + progress bar
- [ ] History infinite-scrolls with cursor pagination
- [ ] Pull-to-refresh works
- [ ] All three states (loading/error/empty) render
```

---

### Sprint 5 Prompt

```
## Task: Mobile — Streak Check-in & Calendar

Context: Streak API: submitDailyCheckIn(userId) returns StreakCheckInResult.
fetchStreakState(userId) returns StreakState. Types in mobile/src/types/rewards.ts.

### What to do:
1. Create `mobile/src/hooks/useStreak.ts`
   - useQuery for streak state
   - useMutation for submitDailyCheckIn with optimistic update
   - On success: invalidate streak query, show toast

2. Create components:
   - StreakCalendar.tsx — 30-day grid, green=checked-in, today=pulsing, shield-used=yellow
   - StreakCheckInButton.tsx — disabled when checked_in_today, shows "+5 DP" on success

3. Create `mobile/src/screens/app/StreakScreen.tsx`
   - Calendar at top, check-in button center, stats below (current/longest/multiplier/shields)

4. Register in navigation

### Rules:
- ASK before making any schema changes
- Optimistic update: immediately show new streak count, rollback on error
- Button MUST be disabled after check-in (checked_in_today flag)
- No hardcoded bonus amounts — display what the API returns
- Follow existing component patterns

### Acceptance criteria:
- [ ] Check-in disabled when already checked in today
- [ ] Success shows toast with bonus points
- [ ] Calendar highlights correct days
- [ ] Multiplier updates immediately via optimistic update
- [ ] Shield count visible
```

---

### Sprint 6 Prompt

```
## Task: Mobile — Challenge Browser & Enrollment

Context: Challenge API functions in mobile/src/lib/rewards.ts: fetchAvailableChallenges,
fetchMyChallenges, enrollInChallenge. Types: Challenge, UserChallenge in rewards.ts.

### What to do:
1. Create `mobile/src/hooks/useChallenges.ts`
2. Create components: ChallengeCard.tsx, ChallengeProgress.tsx
3. Create screens: ChallengesScreen.tsx (two tabs: Available/My), ChallengeDetailScreen.tsx
4. Enroll mutation → invalidate both lists
5. Register in navigation

### Rules:
- ASK before making any schema changes
- Available list excludes already-enrolled challenges
- Completed challenges show reward amount with checkmark
- Full challenges (max_participants reached) show "Full" badge
- Use cursor pagination for both lists

### Acceptance criteria:
- [ ] Two tabs: Available and My Challenges
- [ ] Enroll → "Enrolled" badge replaces button
- [ ] Progress bar shows progress/target ratio
- [ ] Completed shows "Completed" + reward
- [ ] Full challenges show "Full" state
```

---

### Sprint 7 Prompt

```
## Task: Mobile — Referral Sharing & Tracking

Context: Referral API: fetchReferralCode, fetchReferralStatus, recordReferralShare.
Types: ReferralCode, ReferralSummary in rewards.ts.

### What to do:
1. Create `mobile/src/hooks/useReferrals.ts`
2. Create: ReferralCodeCard.tsx (code display + share button), ReferralStatusList.tsx
3. Create: ReferralScreen.tsx — code card top, summary stats, status list
4. Share button → native share sheet → recordReferralShare({ channel })
5. Register in navigation

### Rules:
- ASK before making any schema changes
- Code auto-generated on first visit via getOrCreateCode
- Monthly cap shown: "X of Y referrals used"
- Hold countdown: "Release in X days" for qualified referrals
- Use ShareChannel type for channel tracking

### Acceptance criteria:
- [ ] Code generated and displayed on first visit
- [ ] Share opens native share sheet
- [ ] Monthly usage counter visible
- [ ] Status list shows all referral statuses with correct badges
- [ ] Hold countdown displayed for qualified referrals
```

---

### Sprint 8 Prompt

```
## Task: Mobile — Checkout Earn/Redeem Integration

Context: Checkout API: previewCheckoutEarn, previewCheckoutRedemption in mobile/src/lib/rewards.ts.
Types: CheckoutEarnPreview, CheckoutRedemptionPreview in rewards.ts.
Find the existing checkout screen in mobile/src/screens/app/.

### What to do:
1. Create `mobile/src/hooks/useCheckoutRewards.ts` — wraps earn + redeem previews
2. Create: CheckoutEarnPreview.tsx ("You'll earn X DP" with multiplier breakdown)
3. Create: CheckoutRedeemSlider.tsx (slider 0→max_points, shows dollar discount)
4. Integrate into existing checkout screen
5. On order success: trigger confirmEarn. On refund: trigger refundOrder.

### Rules:
- ASK before making any schema changes
- All amounts are integers — display conversion (DP / 100 = dollars)
- Slider must respect minRedemptionPoints (snap to 0 or above minimum)
- maxRedeemablePoints caps at 50% of order (per business rules)
- Frozen accounts show "Rewards unavailable" — no slider
- Auto-refetch previews when cart total changes

### Acceptance criteria:
- [ ] Earn preview shows base × tier × streak breakdown
- [ ] Slider capped at max_points
- [ ] Dollar discount updates as slider moves
- [ ] Minimum threshold enforced (no fractional redemptions)
- [ ] Frozen account handled gracefully
- [ ] Cart changes trigger preview refresh
```

---

### Sprint 9 Prompt

```
## Task: Mobile — Seller Boost Management

Context: Boost API: fetchBoosts, createBoost, activateBoost, pauseBoost, resumeBoost, cancelBoost
in mobile/src/lib/rewards.ts. Types: Boost, CreateBoostRequest in rewards.ts.

### What to do:
1. Create `mobile/src/hooks/useBoosts.ts`
2. Create: BoostCard.tsx (status badge, budget bar, action buttons per status)
3. Create: BoostManagementScreen.tsx (tabs: Active/Paused/Draft/Completed)
4. Create: CreateBoostScreen.tsx (form: listing, type, budget, duration)
5. Action flows: Draft→Activate, Active→Pause, Paused→Resume, Any→Cancel
6. Register in navigation

### Rules:
- ASK before making any schema changes
- Budget validates against BOOST_MIN_BUDGETS: standard=500, premium=1500, featured=5000
- Duration 1-720 hours
- Trust gate: show error message if activation blocked by low trust score
- Cancel requires confirmation dialog
- Boosts are multipliers on organic rank, NEVER full overrides

### Acceptance criteria:
- [ ] Create form validates budget minimum per type
- [ ] Activate checks trust gate, shows error on failure
- [ ] Status tabs filter correctly
- [ ] Budget bar shows spent/total ratio
- [ ] Cancel shows confirmation dialog
```

---

### Sprints 10-14 Prompts

```
## Sprint 10: Seller Analytics Dashboard
Follow the same pattern as Sprint 9. Create SellerAnalyticsScreen with EarningsChart,
BoostROICard, TrustScoreCard. Display all 5 trust components with correct weights.
ASK before making any schema changes.

## Sprint 11: Admin Rewards Dashboard (Next.js)
Create admin pages under frontend/src/app/admin/rewards/. Build BudgetStatusCard,
RewardAccountTable, RuleConfigEditor. All admin endpoints require requireAccessSecret().
Every action writes to admin_actions audit table. ASK before making schema changes.

## Sprint 12: Admin Fraud & Audit Views (Next.js)
Create FraudFlagTable, AuditLogTable, ReferralManagementTable. Resolve fraud flags
with required notes. Approve/reject referrals with audit trail. ASK before schema changes.

## Sprint 13: Load Testing
Create k6 scripts under loadtests/rewards/. Test concurrent earn, concurrent redemption,
referral attribution at scale, streak check-in burst. Validate balance integrity post-run.
ASK before making schema changes.

## Sprint 14: CI/CD & Final Review
Add rewards test CI job. Add coverage gate (>=85%). Create rewards-runbook.md.
Run final review checklist: indexes, auth, rate limiting, analytics events, error codes,
mobile states, audit trail. ASK before making schema changes.
```

---

## 8. Common Mistakes to Avoid

### Backend

| Mistake | Why it's dangerous | Prevention |
|---------|-------------------|------------|
| Storing cached balance without sync | Stale balance = liability | Always derive from ledger or use the maintained `reward_accounts.balance` updated in the same transaction |
| Using floats for point math | `0.1 + 0.2 !== 0.3` | All amounts `Number.isInteger(amount)` — check enforced in ledgerService |
| Hardcoding point values | Can't tune the economy | All values from `rewardConfig.getNumber()` or `rewardConfig.get()` |
| Skipping idempotency key on earn/redeem | Double-credits on retry | Every order-linked operation uses `earn:{orderId}` or `redeem:{orderId}` |
| Releasing referral rewards early | Refund window abuse | Rewards stay `held` until `hold_until` date passes in batch job |
| Running analytics calls with `await` | Blocks the request | Analytics must be fire-and-forget: `.catch(() => {})` |
| String interpolation in SQL | SQL injection | Always use `$1, $2` parameterized queries |
| Mutating points outside ledgerService | Balance diverges from ledger | Only `creditPoints()` and `debitPoints()` write to the ledger |
| Missing `FOR UPDATE` on balance reads | Race condition double-spend | Ledger always locks with `SELECT ... FOR UPDATE` in transaction |
| Using wrong admin action type | logAction rejects + no audit | Must match `ADMIN_ACTION_TYPES` constant exactly |

### Mobile

| Mistake | Why it's dangerous | Prevention |
|---------|-------------------|------------|
| Missing loading/error/empty states | Broken UX on slow networks | Every screen must handle all three states |
| Forgetting cache invalidation | Stale data shown | After mutations, invalidate relevant `rewardsQueryKeys` |
| Displaying raw DP without conversion | User confusion | Always show "X DP ($Y.YY)" format |
| Not disabling check-in button after check-in | Double API calls | Guard with `checked_in_today` flag |
| Importing types from backend | Cross-project coupling | Use `mobile/src/types/rewards.ts` — it mirrors the API contract |

### General

| Mistake | Why it's dangerous | Prevention |
|---------|-------------------|------------|
| Modifying existing migrations | Breaks production DBs | Create a new migration file; never edit merged migrations |
| Committing `.env` or secrets | Security breach | Only update `.env.example`; secrets via env vars |
| Logging PII (email, name, phone) | Privacy violation | Only log `user_id` — enforced in CLAUDE.md |
| Skipping tests on business logic | Silent regressions | PR blocked unless `npx jest --testPathPattern="reward"` passes |
| Oversized PRs (>400 lines) | Review fatigue, missed bugs | One sprint = one PR; split if larger |

---

## 9. Review Checklist (Before Marking Any Sprint Done)

Copy this checklist into every sprint PR description:

```markdown
### Sprint Review Checklist

#### Code Quality
- [ ] No hardcoded point values — all from rewardConfig
- [ ] No string interpolation in SQL queries
- [ ] All async route handlers wrapped with asyncHandler()
- [ ] Input validation on all new endpoints
- [ ] Error responses use httpError() with correct status codes
- [ ] No PII logged (user_id only)
- [ ] No `.env` files modified (only `.env.example`)

#### Testing
- [ ] All new tests pass: `npx jest --testPathPattern="reward"`
- [ ] All existing 149+ tests still pass
- [ ] Edge cases covered (zero balance, cap boundary, frozen account)
- [ ] No tests depend on real API keys or network calls

#### Analytics
- [ ] All required analytics events emitted (see sprint spec)
- [ ] Events emitted in service layer, not route handlers
- [ ] Event payloads match taxonomy: domain.entity.action

#### Mobile (if applicable)
- [ ] Loading, error, and empty states all implemented
- [ ] Types from mobile/src/types/rewards.ts used (no new types without reason)
- [ ] React Query cache invalidation after mutations
- [ ] Amounts shown as "X DP ($Y.YY)" format

#### Security
- [ ] Auth middleware on all new endpoints
- [ ] Rate limiting on write endpoints
- [ ] Admin endpoints use requireAccessSecret()
- [ ] No secrets in code

#### Schema (if applicable)
- [ ] Migration file has both up and down
- [ ] Indexes on FK columns and query-path columns
- [ ] Tested: migrate:up + migrate:down locally
- [ ] No modifications to existing merged migrations

#### PR Standards
- [ ] Single concern (one feature or fix)
- [ ] Under 400 lines (excluding tests)
- [ ] Title format: type(scope): description
- [ ] Description includes: what, why, how to test
```

---

## Appendix A: Service Dependency Graph

```
rewardConfig (standalone — reads reward_rules_config table)
    |
    v
rulesEngine (depends on: rewardConfig)
    |
    +---> ledgerService (depends on: rewardConfig)
    |         |
    |         +---> tierService (depends on: rulesEngine, ledgerService, rewardConfig)
    |         +---> streakService (depends on: rulesEngine, ledgerService, rewardConfig)
    |         +---> challengeService (depends on: ledgerService, rewardConfig)
    |         +---> referralService (depends on: ledgerService, rewardConfig)
    |
    +---> trustService (depends on: rewardConfig, db)
    |         |
    |         +---> boostService (depends on: trustService, rewardConfig)
    |         |         |
    |         |         +---> rankingService (depends on: boostService, trustService)
    |         |
    |         +---> adminService (depends on: ledgerService, trustService, referralService, rewardConfig)
    |
    +---> checkoutService (depends on: ledgerService, rulesEngine, tierService, streakService, rewardConfig)
    |
    +---> notificationsService (depends on: pushService)
```

## Appendix B: Database Table Quick Reference

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `reward_accounts` | Per-user state | balance, tier, streak_current, is_frozen |
| `reward_ledger_entries` | Append-only point log | user_id, type, amount, balance_after, source, idempotency_key |
| `reward_redemptions` | Redemption requests | order_id, points, status |
| `reward_rules_config` | Business rules KV | rule_key, rule_value (jsonb) |
| `referral_codes` | One active code/user | user_id, code, total_uses |
| `referral_relationships` | Referrer→referee | referrer_user_id, referee_user_id, status |
| `referral_events` | Lifecycle log | referral_id, event_type |
| `referral_rewards` | Hold tracking | referral_id, amount, status, hold_until |
| `challenge_definitions` | Challenge templates | title, criteria, reward_points, starts_at, ends_at |
| `user_challenges` | Enrollment + progress | user_id, challenge_id, progress, target, status |
| `seller_boosts` | Boost campaigns | seller_id, type, budget_minor, spent_minor, status, multiplier |
| `boost_spend_events` | Per-impression spend | boost_id, amount_minor |
| `trust_profiles` | Composite trust score | user_id, score, band, component scores |
| `fraud_flags` | Detection events | user_id, flag_type, severity, status |
| `admin_actions` | Immutable audit trail | admin_id, action_type, target_type, reason, before/after_state |

## Appendix C: Analytics Event Quick Reference

| Event | When | Key payload fields |
|-------|------|--------------------|
| `rewards.points.earned` | Credit posted | amount, source, balance_after, multiplier_applied, tier_at_earn |
| `rewards.points.redeemed` | Debit for redemption | amount, source, balance_after |
| `rewards.points.voided` | Entry voided | voided_entry_id, amount, reason |
| `rewards.tier.upgraded` | Tier goes up | previous_tier, new_tier |
| `rewards.tier.downgraded` | Grace expired, tier drops | previous_tier, new_tier |
| `rewards.tier.grace_started` | Downgrade detected, grace begins | tier, grace_until |
| `rewards.streak.started` | First check-in or reset | user_id |
| `rewards.streak.continued` | Consecutive check-in | streak_current, multiplier |
| `rewards.streak.broken` | Missed day, no shields | streak_was |
| `rewards.streak.shield_used` | Shield consumed | streak_current, shields_remaining |
| `rewards.streak.milestone` | Day 7, 14, or 30 | streak_days, multiplier |
| `rewards.challenge.enrolled` | User joins challenge | challenge_id, challenge_type |
| `rewards.challenge.progressed` | Progress incremented | progress, target |
| `rewards.challenge.completed` | Target reached, reward issued | reward_points |
| `growth.referral.attributed` | Signup linked to referrer | referrer_user_id, referee_user_id |
| `growth.referral.qualified` | First purchase qualifies | order_id |
| `growth.referral.completed` | Reward released | reward_type, amount |
| `growth.referral.fraud_detected` | Fraud check failed | reason (device_overlap, etc.) |
| `boost.activated` | Boost goes live | boost_id, type, budget, multiplier |
| `boost.completed` | Budget exhausted | boost_id, impressions |
| `trust.score.changed` | Score recalculated | before_score, after_score, trigger |
| `trust.fraud.detected` | Flag created | flag_type, severity |

---

*End of handoff document. Start with Sprint 1 and work sequentially. Each sprint should take one day or less. Good luck!*
