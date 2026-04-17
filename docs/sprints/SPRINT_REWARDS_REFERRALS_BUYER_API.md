# Sprint closure: Rewards & referrals (buyer API + web client)

**State: CLOSED** — Scope is complete. **Do not reopen this sprint for additional feature work.** Any new capability belongs to a new sprint or backlog item.

## Status (final)

| Track | Status |
| ----- | ------ |
| **Tests** | **Complete** — Relevant backend Jest suites for buyer rewards/referrals routes and read services pass; `shared/rewards` Vitest passes. |
| **Implementation** | **Complete** — Buyer-facing rewards balance/ledger, referrals me/share, public referral code preview, optional signup `referralCode`, and scoped web UI are in a shippable state. |
| **Lint** | **Blocked (follow-up)** — `cd backend && npm run lint` still fails due to a **Jest globals / ESLint configuration** issue (`no-undef` for `afterEach` in `backend/test/rewards-admin-ingest.test.js`), not due to sprint feature logic. |

## Technical debt / follow-up items

1. **Backend Jest globals vs ESLint (tracked)** — Unblock `npm run lint` by teaching ESLint Jest globals for `backend/test/**` or by importing from `@jest/globals` in affected tests. Tracked as a **separate cleanup task** in [PLATFORM_BACKLOG.md](../PLATFORM_BACKLOG.md) (Engineering / tooling).  
2. **Documentation** — OpenAPI or JSON examples for published contracts remain a broader [api-contracts.md](../api-contracts.md) TODO (Sprint2+).

## References

- Contracts: [api-contracts.md](../api-contracts.md)  
- Tests: [testing-strategy.md](../testing-strategy.md) (buyer rewards + referrals section)  
- Agent context: [CLAUDE.md](../../CLAUDE.md)
