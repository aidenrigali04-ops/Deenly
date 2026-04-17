# API contracts (Deenly)

<!-- TODO(Rewards-Growth-Sprint2): OpenAPI fragment or copy-paste JSON examples for each table below. -->

Stable public API prefix: **`/api/v1`** (see backend README).

## Existing modules

Authoritative shapes today live in route handlers under `backend/src/modules/*`. This file will accumulate **published** contracts for cross-team clients.

## Rewards + Growth Engine

### Rewards (buyer read API)

**Status:** Implemented when `rewardsReadService` is mounted (see `backend/src/index.js` / `app.js`).

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/v1/rewards/me` | Points balance, currency meta, last catalog redemption time. |
| `GET` | `/api/v1/rewards/ledger` | Keyset-paginated ledger (`cursor`, `limit`). |

### Rewards at product checkout (monetization)

**Status:** Implemented when `rewardsLedgerService` and `rewardsCheckoutService` are wired into `createMonetizationRouter` (see `backend/src/app.js`).

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/v1/monetization/checkout/product/:productId/rewards-preview` | Query: `redeemEnabled`, optional `redeemPointsMinor`. Response: `eligible`, `denyReasons`, `balanceMinor`, `pointsToSpend`, `discountMinor`, `chargedMinor`, `listPriceMinor`, `productRewardsEligible`. Eligibility/planning uses `rewardsCheckoutService` + shared-aligned planner (`checkout-redemption-planner.js`). Analytics: `rewards_checkout_eligibility_viewed`. |
| `POST` | `/api/v1/monetization/checkout/product/:productId` | Optional body: `redeemMaxPoints`, `redeemPointsMinor`, required `redeemClientRequestId` when redeeming. Applies ledger spend (`redemption_catalog`) before Stripe session creation; persists `checkout_reward_redemptions` on success. Reverses spend on Stripe session failure, record insert failure, checkout expiry webhook, or full refund when a matching active redemption exists. |

**Server-only:** Stripe webhooks call `reverseActiveCheckoutRedemptionIfAny` for `checkout.session.expired` and full `charge.refunded` paths (see `backend/src/modules/monetization/routes.js`).

### Referrals (buyer read API)

**Status:** Implemented when referrals are enabled and `referralReadService` is mounted.

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/v1/referrals/me` | Referral code summary, referee attribution, qualified count. Server analytics: `referral_program_viewed`. |
| `GET` | `/api/v1/referrals/code-preview` | Query: `code` (required). Read-only validity / exhaustion for signup UX (no auth). Server analytics: `referral_code_preview_viewed`. |
| `POST` | `/api/v1/referrals/me/share` | Optional body `{ "surface": string }` — records `referral_share_recorded` (analytics only). |

**Lifecycle (server-only, not REST):** Signup attribution, first qualifying purchase → hold (`pending_clear`) → release (`qualified`) with points idempotency keys, refund/chargeback invalidation, and `releasePendingReferralsIfReady` — see `backend/src/modules/referrals/referral-service.js` and monetization order hooks.

**Client signup:** Optional JSON body field **`referralCode`** (string, trimmed, max length per server validation) on **`POST /api/v1/auth/register`** and **`POST /api/v1/auth/google`**. When `referralService` is wired, the server runs non-blocking `tryAttributeOnSignup` after the user row exists. The web app reads `?referralCode=` on `/auth/signup` and calls **`GET /api/v1/referrals/code-preview?code=`** for UX only.

### Rewards admin (moderator / admin)

**Base path:** `GET/POST /api/v1/admin/rewards/*` (same handlers mirrored under `/api/v1/monetization/admin/rewards/*` when monetization router mounts the rewards admin bundle).

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/admin/rewards/ledger-entries` | Paginated ledger (`userId`, `entryKind`, `reasonPrefix`, `since`, `until`, `limit`, `offset`). |
| `GET` | `/admin/rewards/ledger-entries/:id` | Ledger entry + optional reversal-of row. |
| `GET` | `/admin/rewards/referrals/queue` | Referral attributions in `pending_purchase` / `pending_clear` (filters: `status`, `referrerUserId`, `refereeUserId`). |
| `GET` | `/admin/rewards/referrals/attributions/:id` | Single attribution (+ `referralCode`). |
| `POST` | `/admin/rewards/referrals/attributions/:id/review` | Body `{ "action": "mark_reviewed" \| "reject" \| "release_hold", "reason"?, "notes"? }` — `release_hold` calls referral release with `forceClearHold` (requires `referralService` + completed qualifying order; rejects non–`pending_clear`). |
| `POST` | `/admin/rewards/fraud-flags/ingest` | Materializes current heuristic `items` into `reward_fraud_flags` (deduped by `metadata.heuristicFingerprint`). |
| `GET` | `/admin/rewards/fraud-flags` | Heuristic signals (`items`) + persisted `reward_fraud_flags` slice (`queuedRecords`; query: `queueStatus`, `queueLimit`, `queueOffset`). |
| `GET` | `/admin/rewards/fraud-flags/records/:id` | Typed fraud-flag row. |
| `POST` | `/admin/rewards/fraud-flags/records/:id/review` | Body `{ "action": "dismiss" \| "confirm" \| "triage", "notes"? }`; appends `rewards_admin_actions`. |
| `GET` | `/admin/rewards/redemptions` | Recent `checkout_reward_redemptions` for ops. |

### Creator seller analytics (authenticated seller or elevated `creatorUserId`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/creator/analytics/listings` | Per–creator-product views (linked posts), completed orders, gross minor, seller-boost impression counts on linked posts (`limit`, `offset`, optional `creatorUserId` for mods). |
| `GET` | `/creator/analytics/seller-boosts/summary` | Boost purchase counts + impressions (existing). |
| `GET` | `/creator/analytics/seller-boosts` | Paginated boost purchases (existing). |

**TODO(Rewards-Growth-Sprint2):** OpenAPI fragments, admin grant routes if any remain public.

## Growth / analytics (existing)

Client experiment ingest and admin dashboards are implemented under `/api/v1/analytics/*` — document alongside Rewards only where clients need a single checklist.
