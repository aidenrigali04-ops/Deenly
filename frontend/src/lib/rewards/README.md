# Web rewards imports

- **`rewards.ts`** — Re-exports [`shared/rewards`](../../../../shared/rewards) as `@deenly/rewards` for types, DTOs, and rules helpers used by the web app.
- **HTTP client** — Buyer-facing API calls live in `frontend/src/lib/rewards-api.ts` (wallet, ledger, referrals, referral code preview) aligned with [docs/api-contracts.md](../../../../docs/api-contracts.md).

Do not fork policy numbers here; extend `shared/rewards` and re-export.
