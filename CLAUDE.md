# CLAUDE.md — Deenly Engineering Standards

## 1. Project Overview

Deenly is a Muslim-first social commerce mobile app. The **Rewards and Growth Engine** adds buyer points, referral credits, seller boosts, performance-based ranking, fraud prevention, and admin controls on top of the existing social platform.

Key subsystems:
- **Points Ledger** — append-only credit/debit log, source of truth for all balances
- **Tier Engine** — 5 tiers (Explorer → Elite) with rolling 12-month qualification
- **Streak Engine** — daily check-in with escalating multipliers and shields
- **Challenge System** — daily/weekly/monthly/merchant challenges with auto-completion
- **Referral System** — two-sided rewards with fraud checks and refund-window gating
- **Trust Score** — composite 0–1000 score (identity 30%, behavioral 25%, transaction 20%, social 15%, device 10%)
- **Seller Boost** — paid ranking modifier (never a full override)
- **Admin Controls** — budget caps, anti-gaming rules, manual adjustments with audit trail

Source-of-truth documents live in `/Users/macbookpro/Downloads/`:
- Master Product Brief
- Rewards Business Rules & Economics Specification
- Fraud & Trust Policy
- Analytics Event Taxonomy
- 90-Day Implementation Roadmap
- Product Requirements Document

---

## 2. Tech Stack

| Layer | Stack | Version |
|-------|-------|---------|
| Mobile | Expo / React Native | Expo ~55, RN 0.83.4, React 19.2 |
| Mobile styling | NativeWind (Tailwind for RN) | NativeWind 4.x, Tailwind 3.4 |
| Mobile nav | React Navigation | bottom-tabs + native-stack v7 |
| Mobile state | Zustand + TanStack React Query | Zustand 5, RQ 5.95 |
| Backend | Node.js / Express | Node 20+, Express 4.21 |
| Database | PostgreSQL | pg 8.13 |
| Migrations | node-pg-migrate | 7.9 |
| Auth | JWT + Argon2 | jsonwebtoken 9, argon2 0.41 |
| Payments | Stripe + Plaid | Stripe 20, Plaid 38 |
| Storage | AWS S3 | @aws-sdk v3 |
| Push | Expo Server SDK | 6.1 |
| Frontend | Next.js / Tailwind | Next 15, Tailwind 3.4 |
| Monitoring | Sentry | RN ~7.11, React 10.48 |
| Logging | Pino | 9.5 |
| Testing | Jest (unit/integration), Playwright (e2e) | Jest 29, Playwright 1.53 |
| Design | Figma (design source of truth) | — |

Do **not** introduce competing libraries. If a new dependency is needed, check this list first.

> **UI styling commitment (Sprint 1 decision):** NativeWind is the only styling layer for mobile.
> Do not mix `StyleSheet` objects with NativeWind `className` props on the same component.
> Do not introduce any other component library (e.g. Gluestack, RN Paper, Tamagui) without
> explicit team sign-off — they conflict with NativeWind's Tailwind class model.

---

## 3. Folder and Service Structure

```
/
├── backend/
│   ├── src/
│   │   ├── index.js              # Entry — creates db, logger, app
│   │   ├── app.js                # Express factory: createApp({ config, db, … })
│   │   ├── config/env.js         # Centralized env parsing + validation
│   │   ├── db.js                 # pg pool wrapper: query(), checkConnection(), close()
│   │   ├── middleware/           # auth.js, error-handler.js
│   │   ├── modules/             # Domain modules (one dir per domain)
│   │   │   ├── auth/routes.js
│   │   │   ├── posts/routes.js
│   │   │   ├── rewards/         # ← NEW: points, tiers, streaks, challenges
│   │   │   ├── referrals/       # ← NEW
│   │   │   ├── trust/           # ← NEW: trust score, fraud detection
│   │   │   └── …
│   │   ├── services/            # Standalone services (analytics, push, payments…)
│   │   └── utils/               # async-handler, validators, http-error, content-safety
│   └── migrations/              # node-pg-migrate files
├── mobile/
│   └── src/
│       ├── components/          # Reusable UI (PostCard, MarketListingCard, …)
│       │   ├── create/          # Create-flow specific components
│       │   └── rewards/         # ← NEW: PointsBadge, TierBadge, StreakRing, etc.
│       ├── screens/
│       │   ├── auth/            # Welcome, Login, Signup
│       │   └── app/             # All authenticated screens
│       │       └── rewards/     # ← NEW: RewardsHomeScreen, WalletScreen, etc.
│       ├── lib/                 # API client, auth, storage, domain helpers
│       │   └── rewards.ts       # ← NEW: all rewards API helpers
│       ├── hooks/               # Custom React hooks
│       │   └── useRewards.ts    # ← NEW: consolidated rewards hooks
│       ├── navigation/          # AppNavigator.tsx
│       ├── store/               # Zustand stores
│       │   └── rewardsStore.ts  # ← NEW: local rewards UI state
│       ├── types/index.ts       # All TypeScript types
│       └── theme.ts             # Design tokens (colours, spacing, typography)
├── frontend/                    # Next.js web app
├── shared/                      # Cross-project config
├── docs/                        # Product/ops documentation
└── loadtests/                   # Load testing scripts
```

### Adding a new backend module

1. Create `backend/src/modules/<domain>/routes.js`
2. Export `create<Domain>Router({ db, config, analytics, … })`
3. Use `express.Router()` internally
4. Wrap all handlers with `asyncHandler()`
5. Register in `app.js`

### Adding a new mobile screen

1. Create `mobile/src/screens/app/<domain>/<ScreenName>Screen.tsx`
2. Add to `navigation/AppNavigator.tsx` stack
3. Add API helpers in `mobile/src/lib/<domain>.ts` (extend existing file or create new)
4. Add types in `mobile/src/types/index.ts`
5. Style with NativeWind `className` props — add a comment at the top referencing the Figma frame: `// Figma: Rewards / Wallet / Home`
6. Handle three render states explicitly: loading skeleton, error with retry, empty state with prompt

### Figma → implementation workflow (Sprint 1 decision)

We **do not** use Figma Make or any AI-to-code plugin. The workflow is:

1. Designer produces final frames in Figma
2. Developer opens **Figma Dev Mode** on the target frame to read exact spacing, colours, and typography values
3. Developer implements the screen manually in React Native + NativeWind using those values
4. Design tokens (colours, font sizes, radii) live in `mobile/src/theme.ts` — never hard-code a hex colour in a component file

---

## 4. Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| JS/TS variables, functions | camelCase | `fetchBalance`, `createRewardsRouter` |
| React components, types | PascalCase | `StreakCalendar`, `TierProgress` |
| Screen files | PascalCase + `Screen` suffix | `RewardsHomeScreen.tsx` |
| Component files | PascalCase | `StreakCalendar.tsx` |
| Backend module dirs | kebab-case or singular noun | `rewards/`, `trust/` |
| Backend files | kebab-case | `routes.js`, `points-service.js` |
| DB tables | snake_case, plural | `points_ledger`, `user_challenges` |
| DB columns | snake_case | `balance_after`, `created_at` |
| DB foreign keys | `<entity>_id` | `user_id`, `challenge_id` |
| DB timestamps | `<verb>_at` | `created_at`, `completed_at` |
| API paths | kebab-case | `/users/:id/trust-score` |
| Query keys (React Query) | kebab-case arrays | `["rewards-balance", userId]` |
| Env vars | SCREAMING_SNAKE | `POINTS_BASE_RATE`, `STREAK_SHIELD_MAX` |
| Analytics events | `<domain>.<entity>.<action>` | `rewards.points.earned` |
| Migration files | `<unix_ts>000_<description>.js` | `1730000030000_create_points_ledger.js` |
| Factory functions | `create<Name>` | `createRewardsRouter`, `createTrustService` |

---

## 5. API Design Standards

- RESTful resources. Use nouns, not verbs: `/users/:id/balance` not `/getBalance`.
- Standard HTTP methods: GET (read), POST (create/action), PUT (full replace), PATCH (partial update), DELETE.
- Response shape: `{ data?, error?, message? }`. Lists include `{ items[], nextCursor? }`.
- Status codes: 200 (ok), 201 (created), 400 (bad input), 401 (unauthed), 403 (forbidden), 404 (not found), 409 (conflict), 422 (unprocessable), 429 (rate limited), 500 (server error).
- All endpoints behind `authenticate()` middleware unless explicitly public.
- Rate limiting on all write endpoints. Per-endpoint limits defined in route files.
- Pagination: cursor-based (not offset). Return `nextCursor` in response.
- Idempotency: POST endpoints that create resources should accept an `idempotency_key` header or parameter where applicable.
- All monetary/point amounts are integers (no floats). 1 DP = 1 integer unit = $0.01 USD.
- Wrap all async handlers with `asyncHandler()` from `utils/async-handler.js`.
- Validate inputs at the route level using functions from `utils/validators.js`.

---

## 6. Database Rules

- PostgreSQL is the only data store. Redis may be added for caching — not as source of truth.
- All tables must have `id` (primary key), `created_at` (timestamptz, default `current_timestamp`).
- Mutable tables must also have `updated_at` (timestamptz).
- Use `uuid` or `serial` for IDs consistently within a domain. Existing tables use `serial`; new rewards tables should use `uuid` for external-facing IDs.
- Foreign keys with `ON DELETE CASCADE` or `ON DELETE SET NULL` — never orphan rows.
- Indexes on every foreign key column and any column used in WHERE/ORDER BY.
- Use `JSONB` sparingly — only for truly schemaless data (e.g., challenge criteria, tier benefits). Never query inside JSONB for hot paths.
- All point balances derived from `points_ledger` aggregation. Never store a cached balance without a materialized view or trigger-maintained column that is kept in sync.
- Use transactions (`BEGIN/COMMIT`) for any operation that touches multiple tables.
- No raw string interpolation in queries — always use parameterized queries (`$1, $2`).

---

## 7. Migration Rules

- Tool: `node-pg-migrate` (config at `backend/node-pg-migrate.config.json`).
- Every schema change requires a migration file. No manual DDL in production.
- File naming: `<unix_timestamp>000_<descriptive_name>.js` — timestamp must be greater than all existing migrations.
- Every migration must have both `exports.up` and `exports.down`.
- `down` must fully reverse `up` — dropping tables, removing columns, removing indexes.
- Never modify an existing migration that has been merged to `main`. Create a new one.
- Test migrations locally with `npm run migrate:up` and `npm run migrate:down` before committing.
- One concern per migration. Don't mix unrelated table changes.
- Migration scripts must be idempotent where possible (`IF NOT EXISTS`).

---

## 8. Testing Requirements

### Backend
- **Unit tests** for all business logic (points calculation, tier qualification, streak logic, fraud rules). File: `<module>/<file>.test.js` next to source.
- **Integration tests** for API endpoints using Supertest. File: `test/integration/<module>.test.js`.
- Business logic functions must have >90% branch coverage.
- Test edge cases: zero balances, tier boundaries, streak shield depletion, expired points, concurrent ledger writes.
- Mock external services (Stripe, Plaid, S3, push). Never mock the database in integration tests.

### Mobile
- **Component tests** with `@testing-library/react-native` for any component with conditional logic.
- **Hook tests** for custom hooks with complex state.
- Test commands: `npm test` (unit), `npm run test:e2e:smoke` (e2e smoke).

### Frontend
- **E2E tests** with Playwright for critical flows.

### General
- Tests must pass before PR merge.
- Never commit a test that depends on real API keys, real database state, or network calls to external services.
- Name test files with `.test.ts` or `.test.js` suffix.

---

## 9. Analytics Event Rules

Follow the Deenly Analytics Event Taxonomy specification.

- Naming: `<domain>.<entity>.<action>` — e.g., `rewards.points.earned`, `trust.score.changed`.
- Every user-facing feature must emit at minimum: a `.started` or `.viewed` event, and a `.completed` or `.failed` event.
- Every point mutation must emit `rewards.points.earned` or `rewards.points.redeemed` with: `user_id`, `amount`, `source`, `reference_id`, `balance_after`, `multiplier_applied`, `tier_at_earn`.
- Tier changes emit `rewards.tier.upgraded` or `rewards.tier.downgraded`.
- Streak events: `rewards.streak.started`, `rewards.streak.continued`, `rewards.streak.broken`.
- Trust events: `trust.score.calculated`, `trust.score.changed`, `trust.fraud.detected`.
- Growth events: `growth.referral.sent`, `growth.referral.completed`.
- Never log PII (email, phone, name) in event payloads. Use `user_id` only.
- Analytics calls must be non-blocking — fire and forget, never await in the request path.
- Add analytics calls in the service layer, not in route handlers.

---

## 10. Security and Fraud Rules

### Authentication & Authorization
- All reward-mutating endpoints require authenticated user.
- Admin endpoints require `requireAccessSecret()` or role-based check.
- Rate limit all write endpoints. Points earning: max N per minute per user.
- JWT tokens: short-lived access (from config), long-lived refresh with rotation.

### Points & Rewards Fraud Prevention
- Daily earn cap per tier (configured, not hardcoded).
- Velocity checks: max transactions per hour, per day.
- Minimum transaction amount: $1 to earn points.
- Duplicate transaction detection: same merchant + amount + user within a 5-minute window.
- Referral fraud: device/IP overlap detection, self-referral blocking, minimum activity before reward release.
- Points expiration: 12 months of account inactivity.

### Trust Score
- Score components weighted: identity (30%), behavioral (25%), transaction (20%), social (15%), device (10%).
- Score changes must be logged with before/after values and trigger reason.
- Fraud flags trigger step-up authentication or account freeze — never silent ignore.

### Points Earn Eligibility
- **No passive engagement farming.** Points are earned only for qualified commerce and intentional engagement actions: purchases, verified streak check-ins, completed challenges, referral qualifications. Scrolling a feed, viewing listings, or opening the app does NOT earn points.
- Any proposed "earn on browse" feature requires explicit sign-off and a per-session velocity cap before implementation.
- Social engagement rewards (likes, comments) must gate through the challenge system with caps, not via direct earn triggers.

### Seller Boost / Ranking
- **Boosts are multipliers on organic rank, not replacements.** `final_rank_score = organic_score × boost_multiplier`. If `organic_score = 0`, the result is 0 regardless of boost spend.
- No feature may allow a seller to purchase a guaranteed top position or bypass organic ranking entirely.
- Boosted content must still pass content safety checks before the boost multiplier is applied.
- Boost spend is tracked in an append-only spend ledger for transparency and refund calculation.

### General
- No secrets in code. All secrets via env vars parsed in `config/env.js`.
- Parameterized queries only. No string concatenation in SQL.
- Input validation on all endpoints using `utils/validators.js`.
- Helmet middleware on all responses.
- CORS configured per environment.

---

## 11. Never Do List

1. **Never mutate reward balances directly** — always use ledger entries (INSERT into `reward_ledger_entries`). Balances are derived from ledger aggregation, never stored-and-patched. This is an immutable ledger model: once a row is written it is never updated, only voided via a compensating entry.
2. **Never issue referral credits before the refund window closes** — referral rewards stay in `held` status until the configurable hold period expires and no open fraud flags exist on either party.
3. **Never override ranking fully with paid boosts** — boosts are multipliers on organic score only. `final_rank = organic_score × boost_multiplier`. A zero-organic-score item multiplied by any boost is still zero.
4. **Never hardcode point values** — all point amounts, multipliers, caps, and thresholds come from config (`reward_rules_config` table or env vars). No magic numbers anywhere in service logic.
5. **Never add features without corresponding analytics events** — every feature ships with its event instrumentation as defined in the Analytics Event Taxonomy.
6. **Never skip tests on business logic** — points math, tier transitions, streak logic, fraud rules must have unit tests before merge.
7. **Never edit `.env` files** — `.env` is gitignored and machine-local. Update `.env.example` when adding new variables, and update `config/env.js` parsing.
8. **Never commit schema changes without a migration file** — all DDL goes through `node-pg-migrate`. No ad-hoc SQL in production.
9. **Never use floating point for money or points** — all amounts are integers. 1 DP = 1 integer unit = $0.01 USD.
10. **Never log PII in analytics or application logs** — use `user_id` references only.
11. **Never import from another module's internal files** — use the module's exported router/service factory only.
12. **Never bypass rate limiting or auth middleware** — even for admin endpoints, use `requireAccessSecret()`.
13. **Never store cached balances without a sync mechanism** — if you cache, use a materialized view or trigger. Stale balance = liability risk.
14. **Never award points for passive scrolling or mere app opens** — points are earned only for qualified commerce and verified engagement actions. Any new earn trigger that doesn't require user intent requires explicit review against the fraud policy.
15. **Never use Figma Make or AI-to-code generation for production UI** — all screens are implemented manually from Figma Dev Mode specs. Generated code creates unmaintainable style debt and breaks NativeWind conventions.
16. **Never mix NativeWind `className` with `StyleSheet.create` on the same component** — use NativeWind by default. `StyleSheet` is reserved for animated style objects only (e.g. `useAnimatedStyle` with Reanimated). Add a comment when you do.

---

## 12. PR and Task Scope Rules

### PR Scope
- One concern per PR. A "concern" is: one feature, one bug fix, one refactor, or one migration.
- Max ~400 lines changed (excluding generated files and tests). If larger, split.
- Every PR must include: the feature code, its migration (if any), its tests, and its analytics events.
- PR title: `<type>(<scope>): <short description>` — e.g., `feat(rewards): add points ledger and earn endpoint`.
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `migration`.
- PR description must include: what changed, why, how to test, and any config changes needed.

### Task Scope
- Break features into vertical slices: DB migration → service logic → API route → mobile screen → analytics.
- Each slice should be independently mergeable and testable.
- Do not build horizontal layers (e.g., "all migrations first, then all services"). Ship vertically.

### Branch Naming
- `feat/<short-name>` for features
- `fix/<short-name>` for bug fixes
- `chore/<short-name>` for maintenance

---

## 13. Feature Implementation Checklist

Use this checklist for every new Rewards & Growth Engine feature:

```
### Feature: [Name]

#### Planning
- [ ] Requirements traced to PRD section (F1–F10)
- [ ] Business rules confirmed against Economics Specification
- [ ] Fraud/abuse vectors identified per Fraud & Trust Policy
- [ ] Analytics events listed per Event Taxonomy

#### Database
- [ ] Migration file created (`<timestamp>000_<name>.js`)
- [ ] `up` and `down` both implemented and tested locally
- [ ] Indexes on FK columns and query-path columns
- [ ] No raw balance columns — ledger-derived only

#### Backend
- [ ] Module created in `backend/src/modules/<domain>/`
- [ ] Factory function: `create<Domain>Router({ db, config, analytics })`
- [ ] Input validation on all endpoints
- [ ] Auth middleware on all endpoints
- [ ] Rate limiting on write endpoints
- [ ] Fraud checks where applicable (velocity, caps, duplicate detection)
- [ ] Analytics events emitted in service layer
- [ ] All point amounts from config, not hardcoded
- [ ] Error responses use `httpError()` with correct status codes

#### Testing
- [ ] Unit tests for business logic (points math, tier rules, streak logic)
- [ ] Integration tests for API endpoints
- [ ] Edge cases: zero balance, tier boundary, concurrent writes, expired state
- [ ] Tests pass: `npm test`

#### Mobile
- [ ] Screen created in `mobile/src/screens/app/<domain>/`
- [ ] Types added to `mobile/src/types/index.ts`
- [ ] API helper in `mobile/src/lib/<domain>.ts`
- [ ] React Query hooks with proper cache invalidation
- [ ] Zustand slice updated if local UI state is needed (`mobile/src/store/`)
- [ ] NativeWind `className` props used for all styling — no inline `style={{}}` objects
- [ ] Figma frame referenced in a comment at the top of the screen file: `// Figma: Rewards / Wallet / Home`
- [ ] Design tokens sourced from `theme.ts`, not hardcoded hex values
- [ ] Loading skeleton state (not just a spinner)
- [ ] Error state with retry action
- [ ] Empty state with contextual prompt
- [ ] Navigation registered in `AppNavigator.tsx`

#### Pre-Merge
- [ ] Migration tested: up and down
- [ ] All tests pass
- [ ] Analytics events verified in dev
- [ ] No hardcoded values for points/config
- [ ] PR is single-concern and <400 lines (excluding tests)
- [ ] `.env.example` updated if new env vars added
```

---

## Quick Reference: Existing Patterns to Follow

### Backend route handler
```javascript
function createRewardsRouter({ db, config, analytics }) {
  const router = express.Router();
  const auth = authenticate({ config, db });

  router.get('/:userId/balance', auth, asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      'SELECT COALESCE(SUM(amount), 0) AS balance FROM points_ledger WHERE user_id = $1',
      [req.params.userId]
    );
    res.json({ balance: Number(rows[0].balance) });
  }));

  return router;
}
module.exports = { createRewardsRouter };
```

### Mobile API call
```typescript
// lib/rewards.ts
import { apiRequest } from './api';

export async function fetchBalance(userId: string): Promise<{ balance: number }> {
  return apiRequest(`/rewards/${userId}/balance`);
}
```

### Mobile screen query
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['rewards-balance', userId],
  queryFn: () => fetchBalance(userId),
});
```

### Migration
```javascript
exports.up = (pgm) => {
  pgm.createTable('points_ledger', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'integer', notNull: true, references: 'users(id)', onDelete: 'cascade' },
    amount: { type: 'integer', notNull: true },
    type: { type: 'varchar(10)', notNull: true }, // 'credit' | 'debit'
    source: { type: 'varchar(30)', notNull: true },
    reference_id: { type: 'uuid' },
    balance_after: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
  });
  pgm.createIndex('points_ledger', 'user_id');
  pgm.createIndex('points_ledger', 'created_at');
};

exports.down = (pgm) => {
  pgm.dropTable('points_ledger');
};
```

### Mobile NativeWind component
```tsx
// Figma: Rewards / Wallet / PointsBadge
import React from 'react';
import { View, Text } from 'react-native';

interface PointsBadgeProps {
  points: number;
  tier: 'explorer' | 'member' | 'insider' | 'vip' | 'elite';
}

const TIER_COLORS: Record<PointsBadgeProps['tier'], string> = {
  explorer: 'bg-gray-100 text-gray-600',
  member:   'bg-blue-100 text-blue-700',
  insider:  'bg-purple-100 text-purple-700',
  vip:      'bg-amber-100 text-amber-700',
  elite:    'bg-yellow-100 text-yellow-800',
};

export function PointsBadge({ points, tier }: PointsBadgeProps) {
  return (
    <View className={`flex-row items-center gap-1 px-3 py-1 rounded-full ${TIER_COLORS[tier]}`}>
      <Text className="font-semibold text-sm">
        {points.toLocaleString()} DP
      </Text>
    </View>
  );
}
```
No `StyleSheet.create`, no inline `style={{}}`. All values come from NativeWind classes or
tokens from `theme.ts`. For animated variants, use `useAnimatedStyle` from Reanimated 3 and
add a comment marking the intentional StyleSheet island.

---

## 14. Design Workflow

### Source of truth
Figma is the single source of truth for all UI. Developers reference it in **Dev Mode** (not Edit Mode) to extract exact values.

### Token mapping
Figma styles map to `mobile/src/theme.ts`. New tokens go in `theme.ts` before use in components.

| Figma token | `theme.ts` key | NativeWind class |
|-------------|----------------|------------------|
| `brand/primary` | `colors.primary` | `text-primary`, `bg-primary` |
| `brand/accent` | `colors.accent` | `text-accent` |
| `neutral/900` | `colors.gray900` | `text-gray-900` |
| `spacing/4` | `spacing[4]` | `p-4`, `m-4` |
| `radius/card` | `borderRadius.card` | `rounded-card` |

### Do not use
- Figma Make
- Any "AI to code" or "design to code" plugin
- Storybook auto-generation pipelines

These produce class-soup that bypasses our NativeWind conventions and creates merge conflicts with manual work.

---

## 15. Sprint Tracker

### Sprint 1 — Rewards & UI Foundations ✅ COMPLETE
**Completed:** 2026-04

**Deliverables shipped:**
- Master Product Brief
- Product Requirements Document (PRD) — features F1–F10
- Business Rules & Economics Specification (earn rates, caps, tiers, referrals, boosts)
- Fraud & Trust Policy
- Analytics Event Taxonomy
- 90-Day Implementation Roadmap
- UI stack decision: React Native + Expo + NativeWind + Figma Dev Mode workflow
- Backend: 4 migration files (rewards core, referrals/challenges, trust/boost/admin, reconciliation)
- Backend: 12 service files (ledger, tiers, streaks, challenges, referrals, trust, checkout, rules engine, config, ranking, boosts, admin, notifications)
- Backend: 267 tests passing across unit + integration suites

**Key decisions locked:**
1. NativeWind for all mobile styling (no competing libraries)
2. Immutable ledger model (no direct balance mutation)
3. Boosts = organic rank multipliers only (no pay-for-top-position)
4. Points require qualified intent (no passive scroll farming)
5. Manual UI implementation from Figma Dev Mode (no codegen)

---

### Sprint 2 — Points & Wallet (Mobile) 🔜 NEXT
**Goal:** Ship the buyer-facing Rewards Hub — balance display, earn history, tier card, streak widget.

**Planned deliverables:**
- `RewardsHomeScreen` — balance, tier badge, streak ring, earn history list
- `WalletScreen` — redemption flow, points-to-discount preview
- `StreakCalendarSheet` — bottom sheet streak calendar
- `TierProgressCard` — rolling-12m progress bar, next-tier projection
- `mobile/src/lib/rewards.ts` — `fetchBalance`, `fetchHistory`, `fetchStreak`, `fetchTier`
- React Query hooks: `useRewardsBalance`, `useStreakState`, `useTierInfo`
- Wire `confirmEarn` into order payment-success webhook
- Show `previewEarn` on cart screen before checkout

**Constraints from Sprint 1:**
- All balance reads go through the ledger API — no client-side balance arithmetic
- Tier badge colours must match Figma design system exactly
- Streak ring animation uses Reanimated 3 (already a dep) — not the legacy Animated API

---

### Sprint 3 — Referral System (Mobile + Backend) 🔜
**Goal:** Full referral lifecycle — share flow, attribution, hold management, admin release.

### Sprint 4 — Seller Boosts & Ranking 🔜
**Goal:** Boost purchase, spend tracking, organic×boost ranking, admin pause/cancel.

### Sprint 5 — Trust Score & Fraud Admin 🔜
**Goal:** Trust score display, fraud flag admin UI, manual score override, freeze/unfreeze flow.

### Sprint 6 — Challenges & Gamification 🔜
**Goal:** Challenge feed, enrollment, progress tracking, completion animation.

### Sprints 7–9 — Hardening, Load Testing, Launch 🔜
**Goal:** Performance profiling, rate-limit tuning, CI/CD pipeline, production migration runbook.

---

## 16. Architecture Decision Log

### ADR-001 — Immutable Rewards Ledger
**Date:** 2026-04 · **Sprint:** 1

**Decision:** All point mutations are INSERT-only rows. No row is ever updated to change an amount. Corrections are compensating entries (void + re-credit).

**Rationale:** Audit trail integrity; no race conditions on balance UPDATE; enables point-in-time balance reconstruction.

**Constraints on future work:**
- Balance reads require `SUM(amount)` aggregation or a trigger-maintained `reward_accounts.balance` column. The trigger must be updated whenever a new ledger `source` type is added.
- Refunds go through `voidEntry()` — never a direct DELETE or UPDATE on a ledger row.
- Adding a new entry type without auditing the trigger will silently produce wrong displayed balances.

---

### ADR-002 — Boosts as Organic Rank Multipliers
**Date:** 2026-04 · **Sprint:** 1

**Decision:** `final_rank_score = organic_score × boost_multiplier`. Paid boosts cannot produce a non-zero rank for zero-organic content.

**Rationale:** Prevents pure pay-to-win; maintains feed quality; reduces regulatory risk around deceptive promotion.

**Constraints on future work:**
- Any "featured placement" or "guaranteed slot" product requires a separate mechanism (e.g. a designated sponsored slot with disclosure label) — it cannot reuse the boost multiplier path.
- Boost ROI analytics must be computed against organic baseline, not absolute rank position.
- The organic score normalisation range (0–1? 0–1000?) must be defined before the ranking service ships — incoherent ranges across content types (listings vs. sellers vs. posts) will make multipliers meaningless.

---

### ADR-003 — No Passive Scroll Farming
**Date:** 2026-04 · **Sprint:** 1

**Decision:** Points are awarded only for qualified intent: purchase completion, verified streak check-in, challenge completion, referral qualification.

**Rationale:** Prevents bot-driven point inflation; keeps earn economics predictable; avoids engagement-bait regulatory scrutiny.

**Constraints on future work:**
- "Watch a video" or "read an article" triggers require a server-side qualification mechanism (minimum watch time, scroll depth) and explicit fraud-policy review before implementation.
- Social engagement rewards (likes, comments) must gate through the challenge system with caps — not direct earn triggers. Clarify this boundary before Sprint 6 (challenges) to avoid re-architecture.

---

### ADR-004 — NativeWind as Sole Mobile Styling Layer
**Date:** 2026-04 · **Sprint:** 1

**Decision:** All React Native UI uses NativeWind `className` props. `StyleSheet.create` is reserved for animated style objects only.

**Rationale:** Consistency with web Tailwind; eliminates style naming debates; faster prototyping.

**Constraints on future work:**
- NativeWind 4 requires a Babel plugin and Metro config — do not eject without a full style migration plan.
- Complex animations (streak ring fill, tier upgrade burst) must use Reanimated 3's `useAnimatedStyle`, which returns plain style objects outside NativeWind. Document the pattern at the component level.
- Third-party components that render their own `StyleSheet` internals must be wrapped in a NativeWind-compatible container — test before adopting any charting or calendar library.

---

### ADR-005 — Manual UI Implementation from Figma Dev Mode
**Date:** 2026-04 · **Sprint:** 1

**Decision:** No AI or plugin-based Figma→code generation. Developers read exact values from Figma Dev Mode and implement manually.

**Rationale:** Generated code produces unmaintainable class-soup; bypasses NativeWind conventions; creates hidden coupling to a specific plugin version.

**Constraints on future work:**
- Design handoff must include: all tokens defined in Figma Styles (not ad-hoc), component states documented (default, pressed, disabled, loading), and responsive notes annotated.
- If design velocity creates a backlog, the solution is better token coverage in `theme.ts` — not relaxing the no-codegen rule.

---

## 17. Known Risks & Technical Debt

These are flagged at the architecture level. Review before each sprint.

| # | Risk | Impact | When to address |
|---|------|--------|-----------------|
| R1 | Trigger-maintained `reward_accounts.balance` goes out of sync if a new ledger `source` type is added without updating the trigger | Silent wrong balances displayed to users | Every time a new source type is added |
| R2 | Boost organic score normalisation range undefined | Multipliers produce incoherent cross-content-type comparisons | Before Sprint 4 (Boosts) |
| R3 | "Earn on social endorsement" in PRD conflicts with ADR-003 (no passive farming) | Scope creep and last-minute re-architecture in Sprint 6 | Resolve during Sprint 5 planning |
| R4 | Referral hold-period integration tests hardcode 14 days instead of reading config | False test confidence if ops changes `referral_hold_days` to 30 | Sprint 3 (Referral mobile) |
| R5 | NativeWind + Reanimated coexistence has no clean abstraction | Contributors expect NativeWind everywhere; animated components confuse reviewers | Document pattern in first animated component (Sprint 2) |
| R6 | `scoreToBand` vocabulary (`high_risk/poor/fair/good/excellent`) differs from DB CHECK constraint (`critical/low/new/good/excellent`) | Band mismatch bugs in trust queries | Before Sprint 5 (Trust admin) |
