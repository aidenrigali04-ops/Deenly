# Claude / agent context (Deenly)

<!-- TODO(Rewards-Growth): Expand with runbook links and “do not” list as the team adopts this file. -->

## Documentation

Start from **[docs/README.md](docs/README.md)** for the full index.

**Rewards + Growth Engine (planning phase):**

- [docs/architecture.md](docs/architecture.md) — system boundaries.
- [docs/schema.md](docs/schema.md) — planned vs existing tables (migrations are source of truth for applied schema).
- [docs/api-contracts.md](docs/api-contracts.md) — planned `/api/v1` shapes (stubs until Sprint 2).
- [docs/testing-strategy.md](docs/testing-strategy.md) — how to test upcoming Rewards work.

## Shared Rewards (TypeScript)

Policy types and defaults: [`shared/rewards`](shared/rewards). Import as `@deenly/rewards` (web) or `@/lib/rewards` (mobile).

## Scaffold folders (reserved)

Implementation is **not** wired into the app yet. Reserved directories:

- `backend/src/modules/rewards/` — see `README.md` there.
- `frontend/src/lib/rewards.ts` — re-export barrel.
- `mobile/src/lib/rewards/` — re-export + `README.md` there.

## Local Claude tooling

See [.claude/README.md](.claude/README.md) for worktree / local tooling notes.
