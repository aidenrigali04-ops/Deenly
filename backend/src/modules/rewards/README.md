# Rewards module (backend)

Server-authoritative **Deenly Points** (consumer rewards): immutable ledger, earn rules, catalog checkout redemption, and read APIs. This is **not** creator cash (`earnings_ledger` / Stripe Connect payouts).

## What is wired today

| Surface | Entry | When it runs |
| ------- | ----- | ------------ |
| **Buyer read API** | `routes.js` → `createRewardsRouter` | Mounted from `createApp` when `rewardsReadService` is passed in. `backend/src/index.js` always constructs and injects `rewardsReadService`; **`DATABASE_URL` must be set** for Postgres-backed balance/ledger queries to work. |
| **Ledger writes** | `rewards-ledger-service.js` | Earn / spend / reversal rows on `reward_ledger_entries`; balance is sum of deltas. |
| **Earn orchestration** | `rewards-earn-service.js` | Shared rules engine + caps; `tryCreditEarnFromVerifiedAction` is the only supported grant path for policy-driven earns. |
| **Product checkout redemption** | `rewards-checkout-service.js` + monetization `routes.js` | Spend before Stripe Checkout session creation; persisted in `checkout_reward_redemptions`. |
| **Order payment earns** | `rewards-order-earn-hooks.js` | After a catalog order is marked `completed` in the Stripe `checkout.session.completed` path, `afterOrderCompletedEarn` runs (purchase + optional first-product milestone). |
| **Order invalidation** | Same hooks + monetization webhooks | On refund, dispute loss, etc., `reverseEarnsForRefundedOrder` appends **reversal** rows (same idempotency keys; no balance “corrections”). |
| **Qualified comment earn** | `rewards-qualified-comment-earn-hook.js` | Invoked from `interactions` routes after a **comment** insert when `REWARDS_EARN_QUALIFIED_COMMENT_ENABLED=true`. |

Typed defaults and validation for clients + Node policy live in [`shared/rewards`](../../../../shared/rewards).

## How users earn points (implemented)

All earns below go through `tryCreditEarnFromVerifiedAction` and append **earn** rows unless caps / rules deny.

1. **Qualifying catalog purchase completed** — `purchase_completed` (+ optional `first_product_order_completed` for the buyer’s first completed **product** order). Gated by `REWARDS_EARN_PURCHASE_COMPLETED_ENABLED` and related env (see [Config](#config--feature-flags)). Requires referral qualification checks in `rewards-order-earn-hooks` (e.g. buyer ≠ seller unless `REFERRAL_ALLOW_BUYER_IS_SELLER`). Referral program points stay in `referral-service`; no double-count with purchase earns.

2. **Qualified comment** — `qualified_comment` after server-verified comment insert. Gated by `REWARDS_EARN_QUALIFIED_COMMENT_ENABLED` plus min chars/words.

**Configured but not hooked in this repo:** `first_post_published` has env + action-point wiring in `rewards-earn-action-points.js`, but **no** posts route calls `tryCreditEarnFromVerifiedAction` for that key yet — treat as deferred until a publish hook exists.

## How users spend points (implemented)

- **Catalog product checkout discount** — Optional body on `POST /api/v1/monetization/checkout/product/:productId` redeems points for a fiat discount before Stripe session creation. Ledger **spend** reason `redemption_catalog` (see monetization routes + `rewards-checkout-service`).

## Reversals (refund / cancel / dispute)

- **Purchase-related earns:** `reverseEarnsForRefundedOrder` reverses `purchase_completed` and, when the first-product earn row is tied to this `orderId`, that earn too. Uses `rewardsLedgerService.reverseEntry` only (immutable ledger).
- **Ledger reversal reasons** include `order_refunded` (refund path) and `order_dispute_lost` (Stripe `charge.dispute.closed` with status `lost` or `charge_refunded`); idempotency prevents double reversal if multiple webhooks fire.
- **Checkout redemption:** Active redemption is reversed on `checkout.session.expired`, on **full** `charge.refunded`, and on **full-charge** disputes (`dispute.amount` ≥ charge amount) via `charge.dispute.closed` (merchant loss outcomes). Partial refund / partial dispute does **not** auto-reverse redemption (same pattern as before for partial refund).

## What referrals do

Implemented in `backend/src/modules/referrals/` (not in this folder): signup attribution, qualifying order hold → release, ledger grants for referrer/referee with idempotency, and **void / clawback** on `onOrderFinanciallyInvalidated` when an order is refunded or dispute-invalidated. Buyer read APIs: `/api/v1/referrals/*` when `REFERRALS_ENABLED` and `referralReadService` are wired (`index.js`).

## What sellers do / do not do with points

- **Sellers do not earn or spend Deenly Points** through product listing or payout flows in this module. Creator **cash** is separate (`earnings_ledger`, Connect, etc.).
- **Buyers** may redeem points **against their own checkout** for a discount on eligible creator products (subject to checkout rules).
- **Seller Boost** and other monetization SKUs use **card payments**, not points redemption from this ledger.

## Still deferred / out of scope here

- First-post-published earn **hook** (config exists; no post-publish integration).
- Buyer **admin UI** for ledger / fraud / referral queue (HTTP exists under `/admin/rewards/*` and monetization mirror; no shipped web/mobile ops console).
- OpenAPI / JSON schema fragments for rewards DTOs (`docs/api-contracts.md` table remains authoritative narrative).
- Proportional earn clawback for **partial** chargebacks (policy; today invalidation still reverses configured purchase earns when the order leaves `completed` — align product with `shared/rewards` rules if that should change).

## Config / feature flags (representative)

Production behavior depends on `backend/src/config/env.js`. Common toggles:

| Area | Env (examples) |
| ---- | ---------------- |
| Database | `DATABASE_URL` — required for ledger, checkout redemption persistence, and earn hooks that touch `orders` / `interactions`. |
| Referrals | `REFERRALS_ENABLED`, attribution window, reward amounts, qualifying order kinds — see `referral*` keys in `env.js`. |
| Purchase earns | `REWARDS_EARN_PURCHASE_COMPLETED_ENABLED`, `REWARDS_EARN_PURCHASE_COMPLETED_POINTS_MINOR`, first-product flags. |
| Comment earns | `REWARDS_EARN_QUALIFIED_COMMENT_ENABLED`, min chars/words. |
| Checkout redemption caps | `REWARDS_MAX_POINTS_PER_REDEMPTION_MINOR`, `REWARDS_MIN_BALANCE_MINOR`, `REWARDS_COOLDOWN_HOURS_BETWEEN_REDEMPTIONS`, `REWARDS_MAX_CHECKOUT_DISCOUNT_BPS`, `REWARDS_POINTS_PER_FIAT_MINOR_UNIT`, etc. |
| Earn caps / anti-farming | `REWARDS_MAX_EARN_PER_USER_PER_DAY_MINOR`, `REWARDS_MAX_SINGLE_GRANT_MINOR`, `REWARDS_RULES_*`, fraud heuristics `REWARDS_FRAUD_*`. |
| Trust / analytics | `TRUST_REWARDS_*`, `TRUST_REFERRAL_*` — large earn/spend flags, referral clawback heuristics. |

## Tests

See [docs/testing-strategy.md](../../../../docs/testing-strategy.md): `rewards-*`, `referrals-*`, `rewards-order-earn-hooks`, `rewards-ledger-service`, `shared/rewards` Vitest.

## References

- [docs/architecture.md](../../../../docs/architecture.md) — boundaries vs analytics vs monetization cash.  
- [docs/api-contracts.md](../../../../docs/api-contracts.md) — published HTTP shapes.  
- [docs/schema.md](../../../../docs/schema.md) — tables.
