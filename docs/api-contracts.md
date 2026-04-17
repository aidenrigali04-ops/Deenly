# API contracts (Deenly)

<!-- TODO(Rewards-Growth-Sprint2): Replace stubs with OpenAPI fragment or copy-paste JSON examples from implementation. -->

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
| `POST` | `/api/v1/referrals/me/share` | Optional body `{ "surface": string }` — records `referral_share_recorded` (analytics only). |

**Lifecycle (server-only, not REST):** Signup attribution, first qualifying purchase → hold (`pending_clear`) → release (`qualified`) with points idempotency keys, refund/chargeback invalidation, and `releasePendingReferralsIfReady` — see `backend/src/modules/referrals/referral-service.js` and monetization order hooks.

**TODO(Rewards-Growth-Sprint2):** OpenAPI fragments, admin grant routes if any remain public.

## Growth / analytics (existing)

Client experiment ingest and admin dashboards are implemented under `/api/v1/analytics/*` — document alongside Rewards only where clients need a single checklist.
