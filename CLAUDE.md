# Claude / agent context (Deenly)

<!-- TODO(Rewards-Growth): Expand with runbook links and “do not” list as the team adopts this file. -->

## Documentation

Start from **[docs/README.md](docs/README.md)** for the full index. Closed sprint notes (status + follow-ups): **[docs/sprints/SPRINT_REWARDS_REFERRALS_BUYER_API.md](docs/sprints/SPRINT_REWARDS_REFERRALS_BUYER_API.md)**.

**Rewards + Growth Engine (planning phase):**

- [docs/architecture.md](docs/architecture.md) — system boundaries.
- [docs/schema.md](docs/schema.md) — planned vs existing tables (migrations are source of truth for applied schema).
- [docs/api-contracts.md](docs/api-contracts.md) — published `/api/v1` buyer and admin shapes (tables + narrative; OpenAPI TBD).
- [docs/testing-strategy.md](docs/testing-strategy.md) — how to test upcoming Rewards work.

## Shared Rewards (TypeScript)

Policy types and defaults: [`shared/rewards`](shared/rewards). Import as `@deenly/rewards` (web) or `@/lib/rewards` (mobile).

## Rewards + referrals (wired today)

Buyer read APIs mount when services are configured (see `backend/src/index.js`, `backend/src/app.js`): **`GET /rewards/me`**, **`GET /rewards/ledger`**, **`GET /referrals/me`**, **`GET /referrals/code-preview`**, **`POST /referrals/me/share`**. Web uses `frontend/src/lib/rewards-api.ts`, hooks under `frontend/src/hooks/`, and account pages under `frontend/src/app/account/rewards` and `.../referrals`. Signup may pass optional **`referralCode`** on **`POST /auth/register`** and **`POST /auth/google`** when referrals are enabled.

## Scaffold / shared packages

- `backend/src/modules/rewards/` — ledger, read paths, checkout integration; see module `README.md` if present.
- `shared/rewards/` — TypeScript types and rules engine (`@deenly/rewards` on web via `frontend/tsconfig.json` paths).
- `frontend/src/lib/rewards.ts` — re-export barrel for `@/lib/rewards`.
- `mobile/src/lib/rewards/` — re-export + `README.md` there (parity with web APIs is incremental).

## Local Claude tooling

See [.claude/README.md](.claude/README.md) for worktree / local tooling notes.
