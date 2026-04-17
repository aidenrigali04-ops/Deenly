# Deenly architecture

<!-- TODO(Rewards-Growth-Sprint1): Flesh out diagrams and env matrix after product locks scope. -->

## Current layout (repo)

- **backend**: Express app, `src/modules/*` feature routers, `src/services/*`, PostgreSQL via `node-pg-migrate` in `migrations/`.
- **frontend**: Next.js app (web).
- **mobile**: Expo / React Native.

## Rewards + Growth Engine (planned)

**Intent:** User-facing **rewards** (balances, earn/spend rules, optional referrals) and continued **growth** instrumentation (experiments, rollout). This doc defines **boundaries only** until implementation starts.

### Boundaries (do not conflate)

| Concern | Owns | Notes |
| ------- | ---- | ----- |
| **Analytics / experiments** | `analytics_events`, `/analytics/*` | Best-effort event stream; not a financial or points ledger. |
| **Monetization ledger** | `earnings_ledger`, Stripe/Connect flows | Creator **cash**; separate from consumer reward points. |
| **Rewards (planned)** | Dedicated module + tables (see [schema.md](./schema.md)) | Server-authoritative grants; idempotent writes. |

### Shared TypeScript (config + types)

Canonical module: [`shared/rewards`](../shared/rewards) (types, centralized config, validation, shape metadata, **rules engine** under `shared/rewards/rules/`). Web imports `@deenly/rewards`; mobile uses `@/lib/rewards` (re-export). Rules are pure functions — ledger / HTTP layers stay separate.

### Scaffold (no runtime wiring yet)

Reserved for Sprint 2+ implementation; see folder READMEs:

- `backend/src/modules/rewards/README.md`
- `frontend/src/lib/rewards.ts` (re-export)
- `mobile/src/lib/rewards/README.md` + `index.ts` (re-export)

### Feed ranking modifiers (Growth)

**Implemented (backend):** `GET /api/feed` (and `/api/v1/feed`) composes `rank_score` from chronology plus engagement, trust penalties, tab/intent boosts, and optional **rewards growth modifiers** when `FEED_REWARDS_RANKING_ENABLED=true`. Commerce-only terms (sales velocity `LN(1+orders)`, conversion proxy, product boost tier) apply on marketplace tab; combined positive modifiers are **LEAST-capped** with a **boost dominance** guardrail (`assertFeedRankModifierGuardrails` at config load). Seller boost catalog points are capped separately and gated by `FEED_SELLER_BOOST_RANKING_ENABLED`. Signal **ingestion** is live-read from `post_views`, `interactions`, `orders`, `reports`, and `seller_boost_*`; `feed-rank-signals.js` emits sampled `feed_ranking_signal_ingested` analytics on view writes and product order completion (no separate materialized ranking store yet).

### References

- [api-contracts.md](./api-contracts.md) — planned HTTP shapes.
- [testing-strategy.md](./testing-strategy.md) — how Rewards will be tested once built.
