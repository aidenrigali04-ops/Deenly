# Testing strategy

<!-- TODO(Rewards-Growth): Align with CI job names in `.github` or provider docs when Rewards suites are added. -->

## Current repo patterns

- **Backend**: Jest unit tests under `backend/test/`; integration tests when `DATABASE_URL` is set (see `backend/README.md`).
- **Frontend**: Playwright e2e under `frontend/e2e/`; app unit tests per package conventions.
- **Mobile**: Jest under `mobile/__tests__/`; release gate scripts as documented in `mobile/package.json`.

### Buyer rewards + referrals (implemented)

- **HTTP**: `backend/test/rewards-routes-http.test.js` (`/rewards/me`, `/rewards/ledger`), `backend/test/referrals-routes-http.test.js` (`/referrals/me`, `/referrals/me/share`, public `/referrals/code-preview`).
- **Read services**: `backend/test/rewards-read-service.test.js`, `backend/test/referral-read-service.test.js` (includes analytics assertions where applicable).
- **Ledger + earn**: `backend/test/rewards-ledger-service.test.js`, `backend/test/rewards-earn-service.test.js`, `backend/test/rewards-order-earn-hooks.test.js`, `backend/test/rewards-qualified-comment-earn-hook.test.js`, `backend/test/stripe-payment-intent-resolve.test.js` (Stripe dispute → `payment_intent` helpers for webhooks).
- **Shared rules**: `cd shared/rewards && npm test` (Vitest).

## Rewards + Growth Engine (ongoing)

| Area | Approach |
| ---- | -------- |
| Ledger / reversals | Unit tests with in-memory repository + idempotency assertions; Postgres integration where `DATABASE_URL` is set. |
| API contracts | Contract tests or snapshot of JSON responses vs [api-contracts.md](./api-contracts.md); OpenAPI fragments still TODO in contracts doc. |
| Client | Web e2e optional for wallet/checkout; mobile checkout points UI not mirrored in repo (see api-contracts client map). |

## Principles

- No customer-facing balance changes without a test that would fail on double-spend regressions.
- Keep analytics assertions **best-effort** (do not block CI on analytics insert failures unless explicitly required).
