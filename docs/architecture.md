# Deenly architecture

## Current layout (repo)

- **backend**: Express app, `src/modules/*` feature routers, `src/services/*`, PostgreSQL via `node-pg-migrate` in `migrations/`.
- **frontend**: Next.js app (web).
- **mobile**: Expo / React Native.

## Rewards + Growth Engine (implemented)

**Intent:** User-facing **Deenly Points** (balances, earn/spend rules, optional referrals) and **growth** instrumentation (experiments, feed ranking modifiers). This section reflects **current** wiring in `backend/src/index.js` and `backend/src/app.js`.

### Boundaries (do not conflate)

| Concern | Owns | Notes |
| ------- | ---- | ----- |
| **Analytics / experiments** | `analytics_events`, `/analytics/*` | Best-effort event stream; **not** the points ledger. |
| **Monetization (cash)** | `earnings_ledger`, Stripe/Connect, `orders` | Creator **cash** and buyer card charges; separate from consumer reward points. |
| **Rewards (points)** | `reward_accounts`, `reward_ledger_entries`, `backend/src/modules/rewards/*` | Append-only ledger; idempotent earn/spend/reversal. Checkout discount spend is initiated from **monetization** routes but ledger logic lives in the rewards module. |
| **Referrals** | `referral_*` tables, `backend/src/modules/referrals/*` | Attribution lifecycle and referral-specific ledger rows; coordinates with orders + monetization webhooks. |

### Shared TypeScript (config + types + rules)

Canonical module: [`shared/rewards`](../shared/rewards) (types, centralized config, validation, **rules engine** under `shared/rewards/rules/`). Web imports `@deenly/rewards`; mobile uses `@/lib/rewards` (re-export). Rules are pure functions — Node services (`rewards-earn-service`, checkout planner) enforce them at runtime.

### Runtime wiring (backend)

The production process **`backend/src/index.js`** constructs:

- `rewardsLedgerService`, `rewardsCheckoutService`, and `rewardsReadService` unconditionally (they use the shared `db` pool; **`DATABASE_URL` must be set** in real deployments or ledger reads/writes will fail at query time).
- `rewardsEarnService` and `rewardsOrderEarnHooks` only when `DATABASE_URL` is set (plus earn service dependencies).
- `rewardsQualifiedCommentEarnHook` when `rewardsEarnService` exists (interactions router receives it).

`createApp` mounts:

- **`/api/v1/rewards`** (`GET /me`, `GET /ledger`) when `rewardsReadService` is injected (default from `index.js`).
- **`/api/v1/referrals`** when `referralReadService` is set (`REFERRALS_ENABLED` + DB + referral service).
- **Monetization** router receives `rewardsLedgerService`, `rewardsCheckoutService`, and `rewardsOrderEarnHooks` for checkout redemption and Stripe webhook reversals.

Minimal or test `createApp({ ... })` call sites may omit `rewardsReadService`; those apps will not expose `/rewards` until it is passed in.

### Feed ranking modifiers (Growth)

**Implemented (backend):** `GET /api/feed` (and `/api/v1/feed`) composes `rank_score` from chronology plus engagement, trust penalties, tab/intent boosts, and optional **rewards growth modifiers** when `FEED_REWARDS_RANKING_ENABLED=true`. Commerce-only terms (sales velocity `LN(1+orders)`, conversion proxy, product boost tier) apply on marketplace tab; combined positive modifiers are **LEAST-capped** with a **boost dominance** guardrail (`assertFeedRankModifierGuardrails` at config load). Seller boost catalog points are capped separately and gated by `FEED_SELLER_BOOST_RANKING_ENABLED`. Signal **ingestion** is live-read from `post_views`, `interactions`, `orders`, `reports`, and `seller_boost_*`; `feed-rank-signals.js` emits sampled `feed_ranking_signal_ingested` analytics on view writes and product order completion (no separate materialized ranking store yet).

### References

- [api-contracts.md](./api-contracts.md) — published HTTP shapes + buyer UI map.
- [schema.md](./schema.md) — rewards-related tables.
- [testing-strategy.md](./testing-strategy.md) — how Rewards is tested in CI/local.
