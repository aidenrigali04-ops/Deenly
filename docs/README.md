# Deenly documentation index

Core product and engineering references. **Rewards + Growth Engine**: buyer **points** ledger, **earn** hooks (purchase, qualified comment), **catalog checkout redemption**, **referrals** (when enabled), Stripe **refund/dispute** invalidation hooks, and **admin/moderator HTTP** for ops are **implemented** in the backend; see [api-contracts.md](./api-contracts.md) and [architecture.md](./architecture.md). Shipped **buyer** web/mobile UIs cover wallet, ledger, referrals, and web checkout points; dedicated internal ops UI remains deferred.

| Document | Purpose |
| -------- | ------- |
| [architecture.md](./architecture.md) | System boundaries, packages, Rewards vs analytics vs monetization |
| [schema.md](./schema.md) | Planned and existing data concepts (migrations are source of truth for applied schema) |
| [api-contracts.md](./api-contracts.md) | Published `/api/v1` contracts (tables + descriptions; OpenAPI fragments still TODO) |
| [testing-strategy.md](./testing-strategy.md) | How we test; Rewards-specific coverage notes |

Shared implementation (TypeScript): [`../shared/rewards/README.md`](../shared/rewards/README.md).

## Sprint records

| Document | Purpose |
| -------- | ------- |
| [sprints/SPRINT_REWARDS_REFERRALS_BUYER_API.md](./sprints/SPRINT_REWARDS_REFERRALS_BUYER_API.md) | **Closed** — buyer rewards/referrals API + web client; test/lint closure notes |

## Existing docs

| Document | Purpose |
| -------- | ------- |
| [PLATFORM_BACKLOG.md](./PLATFORM_BACKLOG.md) | Post-MVP backlog |
| [PRE_LAUNCH_RUNBOOK.md](./PRE_LAUNCH_RUNBOOK.md) | Env → QA → release |
| [USER_READINESS.md](./USER_READINESS.md) | Readiness review |
| [SMOKE_TEST_CHECKLIST.md](./SMOKE_TEST_CHECKLIST.md) | Manual smoke checks |
| [PAYMENTS_APPLE_PAY_PLAID.md](./PAYMENTS_APPLE_PAY_PLAID.md) | Payments notes |
| [MONETIZATION_PROMOTED_AND_EVENTS.md](./MONETIZATION_PROMOTED_AND_EVENTS.md) | Monetization / events |
