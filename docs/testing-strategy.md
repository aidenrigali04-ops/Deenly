# Testing strategy

<!-- TODO(Rewards-Growth): Align with CI job names in `.github` or provider docs when Rewards suites are added. -->

## Current repo patterns

- **Backend**: Jest unit tests under `backend/test/`; integration tests when `DATABASE_URL` is set (see `backend/README.md`).
- **Frontend**: Playwright e2e under `frontend/e2e/`; app unit tests per package conventions.
- **Mobile**: Jest under `mobile/__tests__/`; release gate scripts as documented in `mobile/package.json`.

### Buyer rewards + referrals (implemented)

- **HTTP**: `backend/test/rewards-routes-http.test.js` (`/rewards/me`, `/rewards/ledger`), `backend/test/referrals-routes-http.test.js` (`/referrals/me`, `/referrals/me/share`, public `/referrals/code-preview`).
- **Read services**: `backend/test/rewards-read-service.test.js`, `backend/test/referral-read-service.test.js` (includes analytics assertions where applicable).
- **Shared rules**: `cd shared/rewards && npm test` (Vitest).

## Rewards + Growth Engine (planned)

<!-- TODO(Rewards-Growth-Sprint2): Idempotency tests for grant handler; DB constraints tests. -->
<!-- TODO(Rewards-Growth-Sprint3+): Integration tests for earn-rule hooks; optional e2e for balance UI. -->

| Area | Approach |
| ---- | -------- |
| Ledger / grants | Integration tests with real Postgres; assert duplicate idempotency keys do not double-credit. |
| API contracts | Contract tests or snapshot of JSON responses vs [api-contracts.md](./api-contracts.md). |
| Client | Minimal e2e: “ledger empty” → grant fixture → “ledger shows one row” (when UI exists). |

## Principles

- No customer-facing balance changes without a test that would fail on double-spend regressions.
- Keep analytics assertions **best-effort** (do not block CI on analytics insert failures unless explicitly required).
