# Post-MVP platform backlog

Ordered backlog for **user readiness** and production maturity. Each row can become its own issue/PR. Not tied to a single release.

## Product / UX

- Username-based DM start: **partial** — Messages tab can look up by name/@username via `/search/users` and start a chat; deep links from profile remain ideal follow-up.  
- Message requests / safety for unsolicited chats.  
- Search: debounced queries, recent searches, clearer zero-result guidance.  
- Marketplace: category/price filters when listing volume justifies them.  
- Optional: thread screen on stack (Messages) instead of inline scroll-only thread.

## Engineering / tooling

- **Backend ESLint + Jest globals:** `cd backend && npm run lint` fails with `no-undef` for Jest globals (e.g. `afterEach` in `backend/test/rewards-admin-ingest.test.js`). Fix by adding Jest `globals` for `backend/test/**/*.js` in `backend/eslint.config.cjs`, using `/* eslint-env jest */`, or importing `afterEach` from `@jest/globals` where needed. **Not caused by the Rewards / referrals buyer API sprint feature work** — hygiene-only follow-up. Sprint closure: [docs/sprints/SPRINT_REWARDS_REFERRALS_BUYER_API.md](./sprints/SPRINT_REWARDS_REFERRALS_BUYER_API.md).

## Reliability

- Dedicated **staging** environment; document URLs in team wiki.  
- Run [backend/scripts/verify-deploy-env-parity.js](../backend/scripts/verify-deploy-env-parity.js) in CI or before releases; align `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` with production.

## Observability

- Set `EXPO_PUBLIC_SENTRY_DSN` and wire [mobile/src/lib/crash-reporting.ts](../mobile/src/lib/crash-reporting.ts) for production iOS/Android builds.  
- Backend: ensure `/ops/metrics` and logs are monitored for releases.  
- Funnel events (privacy-minimal): signup completed, first post, first message sent, checkout started/completed.

## Trust / safety

- App Store / Play **Data safety** and in-app privacy copy aligned with actual collection.  
- Consistent **report** / **block** entry points on UGC surfaces (posts, profiles, chat).  
- Moderation queue health checks if volume grows.

## Web parity

- Continue [UX_CLUTTER_REDUCTION_PLAN.md](./UX_CLUTTER_REDUCTION_PLAN.md) Phase 2–3 when mobile IA changes (account, nav, business entry points).

## Payments / monetization (future epic)

**Shipped (partial):** Stripe Checkout **wallet-friendly** card flow + **Plaid Link** for US sellers to attach a bank account to **Stripe Connect** via processor token. See [PAYMENTS_APPLE_PAY_PLAID.md](./PAYMENTS_APPLE_PAY_PLAID.md).

Remaining if moving off **Stripe** entirely: **platform-held balances**, **StoreKit / IAP** for iOS digital (App Store rules), full **ledger**, compliance. Suggested milestones:

1. **Policy** — Per surface: iOS digital (IAP vs other), web/Android, physical/services; document decisions.  
2. **Acceptance** — Replace Stripe checkout with chosen rails; server validation / entitlements for IAP if applicable.  
3. **Ledger** — Internal balances, platform fee, refunds, reconciliation.  
4. **Payouts** — Extend beyond Plaid+Stripe (e.g. direct ACH, international) as needed.  
5. **Migration** — Feature-flag, settle open Stripe obligations, remove dead Stripe paths and env keys from [backend/src/modules/monetization/routes.js](../backend/src/modules/monetization/routes.js) and clients.

## References

- [README.md](./README.md) — documentation index (includes Rewards + Growth planning).  
- [PRE_LAUNCH_RUNBOOK.md](./PRE_LAUNCH_RUNBOOK.md) — env → QA → store order.  
- [USER_READINESS.md](./USER_READINESS.md) — review process.  
- [mobile/docs/STORE_RELEASE_CHECKLIST.md](../mobile/docs/STORE_RELEASE_CHECKLIST.md) — store submission.
