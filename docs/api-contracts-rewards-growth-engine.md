# Deenly Rewards & Growth Engine — API Contracts

> Version 1.0 — April 2026
> Status: Ready for Implementation
> Source of Truth: PRD (F1–F10), Business Rules & Economics Specification
> Base Path: `/api/rewards`, `/api/referrals`, `/api/checkout`, `/api/admin`

---

## Table of Contents

1. [Conventions](#1-conventions)
2. [Buyer APIs](#2-buyer-apis)
   - 2.1 [GET /rewards/balance](#21-get-rewardsbalance)
   - 2.2 [GET /rewards/history](#22-get-rewardshistory)
   - 2.3 [POST /rewards/redeem](#23-post-rewardsredeem)
   - 2.4 [GET /referrals/code](#24-get-referralscode)
   - 2.5 [POST /referrals/share](#25-post-referralsshare)
   - 2.6 [GET /referrals/status](#26-get-referralsstatus)
3. [Seller APIs](#3-seller-apis)
   - 3.1 [POST /boosts/purchase](#31-post-boostspurchase)
   - 3.2 [GET /boosts/history](#32-get-boostshistory)
   - 3.3 [GET /seller/analytics/performance](#33-get-selleranalyticsperformance)
   - 3.4 [GET /seller/analytics/ranking](#34-get-selleranalyticsranking)
4. [Checkout APIs](#4-checkout-apis)
   - 4.1 [GET /checkout/rewards/eligibility](#41-get-checkoutrewardseligibility)
   - 4.2 [POST /checkout/rewards/apply](#42-post-checkoutrewardsapply)
   - 4.3 [POST /checkout/complete](#43-post-checkoutcomplete)
5. [Internal / Backend APIs](#5-internal--backend-apis)
   - 5.1 [POST /events/ingest](#51-post-eventsingest)
   - 5.2 [POST /rewards/calculate](#52-post-rewardscalculate)
   - 5.3 [POST /referrals/evaluate](#53-post-referralsevaluate)
   - 5.4 [POST /ranking/signals](#54-post-rankingsignals)
   - 5.5 [POST /trust/flag](#55-post-trustflag)
6. [Admin APIs](#6-admin-apis)
   - 6.1 [GET /admin/rewards/ledger](#61-get-adminrewardsledger)
   - 6.2 [POST /admin/rewards/override](#62-post-adminrewardsoverride)
   - 6.3 [GET /admin/referrals/queue](#63-get-adminreferralsqueue)
   - 6.4 [POST /admin/referrals/approve](#64-post-adminreferralsapprove)
   - 6.5 [POST /admin/referrals/reject](#65-post-adminreferralsreject)
   - 6.6 [GET /admin/fraud/flags](#66-get-adminfraudflags)
   - 6.7 [POST /admin/fraud/action](#67-post-adminfraudaction)
7. [Shared Types](#7-shared-types)
8. [Error Reference](#8-error-reference)
9. [Rate Limiting Summary](#9-rate-limiting-summary)

---

## 1. Conventions

### 1.1 Base URLs

All endpoints are registered under the Express API router and available at both prefixes:

```
/api/<path>
/api/v1/<path>
```

### 1.2 Authentication

Every endpoint requires a valid JWT Bearer token unless explicitly marked **Public**.

```
Authorization: Bearer <access_token>
```

The `authenticate({ config, db })` middleware populates `req.user` with:

```json
{
  "id": 42,
  "email": "user@example.com",
  "username": "ahmed",
  "role": "user",
  "is_active": true,
  "created_at": "2026-01-15T12:00:00.000Z"
}
```

Admin endpoints additionally require `authorize(["moderator", "admin"])` + `requireAdminOwner`.

### 1.3 Response Envelope

All responses follow one of these shapes:

**Single resource:**
```json
{ "data": { ... } }
```

**List (cursor-based, user-facing):**
```json
{
  "items": [ ... ],
  "limit": 20,
  "hasMore": true,
  "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA0..."
}
```

**List (offset-based, admin):**
```json
{
  "items": [ ... ],
  "limit": 50,
  "offset": 0,
  "total": 312
}
```

**Action result:**
```json
{
  "ok": true,
  "message": "Points redeemed successfully",
  "data": { ... }
}
```

**Error:**
```json
{
  "error": "INSUFFICIENT_BALANCE",
  "message": "You need at least 500 DP to redeem"
}
```

### 1.4 Common Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes (unless public) | `Bearer <jwt>` |
| `Content-Type` | Yes (POST/PUT/PATCH) | `application/json` |
| `Idempotency-Key` | Recommended (POST writes) | UUID. Prevents duplicate transactions. |
| `X-Request-Id` | Optional | Trace ID. Auto-generated if absent. |
| `X-Device-Fingerprint` | Recommended (referral/checkout) | Client device fingerprint for fraud detection. |

### 1.5 Pagination

**Cursor-based** (all user-facing list endpoints):
- `?limit=20` — items per page (max 100, default 20)
- `?cursor=<opaque_string>` — base64url-encoded cursor from previous response's `nextCursor`

**Offset-based** (admin endpoints):
- `?limit=50` — items per page (max 200, default 50)
- `?offset=0` — starting row offset

### 1.6 Monetary & Points Values

- All **point amounts** are integers. 1 DP = 1 integer unit.
- All **dollar amounts** are integers in **minor units** (cents). $25.00 = `2500`.
- Conversion: 100 DP = $1.00. So `dollar_value_minor = points_amount`.

---

## 2. Buyer APIs

Module: `backend/src/modules/rewards/routes.js`
Factory: `createRewardsRouter({ db, config, analytics })`

---

### 2.1 GET /rewards/balance

Retrieve the authenticated user's current reward account state — balance, tier, streak, and earn progress.

**Route:** `GET /api/rewards/balance`

**Auth:** Required (Bearer JWT)

**Rate Limit:** Global (120/min)

**Request Headers:**
```
Authorization: Bearer <token>
```

**Request Body:** None

**Query Params:** None

**Response: 200 OK**
```json
{
  "data": {
    "user_id": 42,
    "balance": 1250,
    "balance_dollar_value_minor": 1250,
    "lifetime_earned": 8400,
    "lifetime_redeemed": 3200,
    "tier": "member",
    "tier_multiplier": 1.25,
    "tier_next": "insider",
    "tier_next_threshold": 5000,
    "tier_progress_points": 1250,
    "tier_qualified_at": "2026-03-01T00:00:00.000Z",
    "rolling_12m_points": 1250,
    "streak": {
      "current": 14,
      "longest": 21,
      "multiplier": 2.0,
      "shields_remaining": 1,
      "last_checkin_date": "2026-04-12",
      "checked_in_today": false
    },
    "daily_earn": {
      "earned_today": 120,
      "cap_today": 750,
      "remaining_today": 630
    },
    "is_frozen": false,
    "last_activity_at": "2026-04-12T18:30:00.000Z"
  }
}
```

**Response: 404 Not Found** (no reward account yet — auto-create on first call)
```json
{
  "error": "REWARD_ACCOUNT_NOT_FOUND",
  "message": "Reward account will be created on first activity"
}
```

> **Implementation note:** If no `reward_accounts` row exists for the user, the endpoint should auto-create one with default values (Explorer tier, 0 balance) and return it. This avoids requiring a separate "initialize" call.

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 401 | `AUTHENTICATION_REQUIRED` | Missing or invalid token |
| 500 | `INTERNAL_ERROR` | Database failure |

**Business Rules Enforced:**
- Balance is derived from `reward_accounts.balance` (trigger-maintained from ledger)
- Daily earn cap returned is tier-specific: Explorer 500, Member 750, Insider 1000, VIP 1500, Elite 2500
- Streak multiplier bands: days 1–6 = 1.0×, 7–13 = 1.5×, 14–30 = 2.0×, 31+ = 3.0×
- `checked_in_today` is computed by comparing `streak_last_checkin_date` to current date
- Frozen accounts still return balance data but all earn/redeem endpoints will reject

**Analytics Events:**
- `rewards.balance.viewed` — `{ user_id, balance, tier }`

---

### 2.2 GET /rewards/history

Retrieve the authenticated user's point transaction history with cursor-based pagination and optional filters.

**Route:** `GET /api/rewards/history`

**Auth:** Required (Bearer JWT)

**Rate Limit:** Global (120/min)

**Request Headers:**
```
Authorization: Bearer <token>
```

**Query Params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `limit` | integer | No | 20 | Items per page (1–100) |
| `cursor` | string | No | — | Pagination cursor from previous response |
| `type` | string | No | — | Filter: `credit` or `debit` |
| `source` | string | No | — | Filter: `purchase`, `referral_earned`, `streak_bonus`, etc. |
| `from` | string (ISO 8601) | No | — | Start date filter |
| `to` | string (ISO 8601) | No | — | End date filter |

**Response: 200 OK**
```json
{
  "items": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "type": "credit",
      "amount": 250,
      "balance_after": 1250,
      "source": "purchase",
      "description": "Points earned from order #1847",
      "tier_at_time": "member",
      "multiplier_applied": 2.50,
      "created_at": "2026-04-12T18:30:00.000Z",
      "expires_at": null,
      "voided_at": null
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "type": "debit",
      "amount": 500,
      "balance_after": 1000,
      "source": "redemption",
      "description": "Redeemed 500 DP ($5.00) on order #1832",
      "tier_at_time": "member",
      "multiplier_applied": 1.00,
      "created_at": "2026-04-10T14:22:00.000Z",
      "expires_at": null,
      "voided_at": null
    }
  ],
  "limit": 20,
  "hasMore": true,
  "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA0LTEwVDE0OjIyOjAwLjAwMFoiLCJpZCI6ImIyYzNkNGU1In0="
}
```

**Cursor encoding:** `base64url(JSON.stringify({ createdAt, id }))` — keyset pagination on `(created_at DESC, id DESC)`.

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 400 | `INVALID_CURSOR` | Malformed cursor |
| 400 | `INVALID_FILTER` | Invalid type/source value |
| 401 | `AUTHENTICATION_REQUIRED` | Missing or invalid token |

**Business Rules Enforced:**
- Users can only see their own ledger entries (WHERE `user_id = req.user.id`)
- Voided entries are included but marked with `voided_at` timestamp
- No PII in response — source references use IDs, not names

**Analytics Events:**
- `rewards.history.viewed` — `{ user_id, filter_type, filter_source }`

---

### 2.3 POST /rewards/redeem

Initiate a point redemption. Creates a pending redemption record and debits points from the user's balance. The redemption is later applied to an order during checkout, or expires if unused.

**Route:** `POST /api/rewards/redeem`

**Auth:** Required (Bearer JWT)

**Rate Limit:** 10 requests per 15 minutes per user

**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <uuid>
```

**Request Body:**
```json
{
  "points_amount": 500,
  "order_id": 1847
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `points_amount` | integer | Yes | Min 500, multiple of 100 | DP to redeem |
| `order_id` | integer | Yes | Must exist, status = 'completed' not required yet | Target order |

**Response: 201 Created**
```json
{
  "ok": true,
  "message": "Points redeemed successfully",
  "data": {
    "redemption_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "points_amount": 500,
    "dollar_value_minor": 500,
    "dollar_value_display": "$5.00",
    "balance_before": 1250,
    "balance_after": 750,
    "status": "pending",
    "expires_at": "2026-04-13T18:30:00.000Z"
  }
}
```

**Error Codes:**

| Status | Error Code | Message | When |
|--------|-----------|---------|------|
| 400 | `INVALID_POINTS_AMOUNT` | `Points amount must be at least 500 DP` | Below minimum |
| 400 | `INVALID_POINTS_AMOUNT` | `Points amount must be a multiple of 100` | Not a round number |
| 400 | `MISSING_ORDER_ID` | `order_id is required` | No order specified |
| 403 | `ACCOUNT_FROZEN` | `Your reward account is frozen. Contact support.` | Account frozen |
| 404 | `ORDER_NOT_FOUND` | `Order not found` | Invalid order_id |
| 409 | `DUPLICATE_REDEMPTION` | `A redemption is already pending for this order` | Same idempotency key or order |
| 422 | `INSUFFICIENT_BALANCE` | `You need at least 500 DP to redeem. Current balance: 320 DP` | Not enough points |
| 422 | `REDEMPTION_EXCEEDS_CAP` | `Maximum redemption is $20.00 (2000 DP) per order` | Exceeds $20 cap |
| 422 | `REDEMPTION_EXCEEDS_ORDER_PCT` | `Maximum redemption is 15% of order total` | Exceeds 15% rule |
| 429 | `RATE_LIMITED` | `Too many redemption attempts. Try again later.` | Rate limit hit |

**Business Rules Enforced (per Business Rules Specification):**
1. **Minimum redemption:** 500 DP ($5.00)
2. **Maximum per order:** Lesser of 15% of order total OR $20.00 (2000 DP)
3. **Balance check:** `points_amount <= reward_accounts.balance`
4. **Frozen check:** `reward_accounts.is_frozen = false`
5. **Idempotency:** Duplicate `Idempotency-Key` returns the original response (201 with `duplicate: true`)
6. **Atomic transaction:** Ledger debit + redemption record + balance update in single `BEGIN/COMMIT`
7. **Locking:** `SELECT ... FOR UPDATE` on `reward_accounts` row to prevent concurrent balance race

**Analytics Events:**
- `rewards.points.redeemed` — `{ user_id, amount, order_id, balance_after, tier_at_time }`

---

### 2.4 GET /referrals/code

Retrieve the authenticated user's active referral code, or generate one if none exists.

**Route:** `GET /api/referrals/code`

**Auth:** Required (Bearer JWT)

**Rate Limit:** Global (120/min)

**Request Headers:**
```
Authorization: Bearer <token>
```

**Response: 200 OK**
```json
{
  "data": {
    "code": "AHMED2026",
    "share_url": "https://deenly.com/r/AHMED2026",
    "is_active": true,
    "total_uses": 7,
    "monthly_uses": 3,
    "monthly_cap": 20,
    "monthly_remaining": 17,
    "created_at": "2026-01-15T12:00:00.000Z"
  }
}
```

> **Implementation note:** If no active `referral_codes` row exists, auto-generate a unique code (username + random suffix, e.g., `AHMED2026`), insert the row, and return it. Code generation is idempotent — repeated calls return the same active code.

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 401 | `AUTHENTICATION_REQUIRED` | Missing or invalid token |
| 403 | `ACCOUNT_FROZEN` | Account is frozen |

**Business Rules Enforced:**
- One active code per user (partial unique index on `referral_codes`)
- Monthly cap tracked by counting `referral_relationships` for current month where `referrer_user_id = req.user.id`
- Code format: 4–20 alphanumeric characters, uppercase

**Analytics Events:**
- `growth.referral.code_viewed` — `{ user_id, code, monthly_uses }`

---

### 2.5 POST /referrals/share

Record a referral share event (user shared their code via a specific channel). Used for attribution analytics — the actual referral link is generated client-side using the code from `GET /referrals/code`.

**Route:** `POST /api/referrals/share`

**Auth:** Required (Bearer JWT)

**Rate Limit:** 30 requests per 15 minutes per user

**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "channel": "whatsapp",
  "referral_code": "AHMED2026"
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `channel` | string | Yes | One of: `whatsapp`, `sms`, `email`, `instagram`, `twitter`, `facebook`, `copy_link`, `other` | How the code was shared |
| `referral_code` | string | Yes | Must match user's active code | The code that was shared |

**Response: 200 OK**
```json
{
  "ok": true,
  "message": "Share recorded"
}
```

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 400 | `INVALID_CHANNEL` | Invalid share channel |
| 400 | `INVALID_CODE` | Code doesn't match user's active code |
| 401 | `AUTHENTICATION_REQUIRED` | Missing or invalid token |

**Business Rules Enforced:**
- Share is analytics-only — it does not create a referral relationship (that happens at referee signup)
- No points are awarded for sharing — only for completed, qualified referrals

**Analytics Events:**
- `growth.referral.shared` — `{ user_id, channel, referral_code }`

---

### 2.6 GET /referrals/status

Retrieve the authenticated user's referral dashboard — their referrals, statuses, and pending rewards.

**Route:** `GET /api/referrals/status`

**Auth:** Required (Bearer JWT)

**Rate Limit:** Global (120/min)

**Request Headers:**
```
Authorization: Bearer <token>
```

**Query Params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `limit` | integer | No | 20 | Items per page (1–100) |
| `cursor` | string | No | — | Pagination cursor |
| `status` | string | No | — | Filter: `pending`, `qualified`, `rewarded`, `rejected`, `expired` |

**Response: 200 OK**
```json
{
  "summary": {
    "total_referrals": 12,
    "qualified": 7,
    "rewarded": 5,
    "pending": 3,
    "rejected": 1,
    "expired": 1,
    "total_earned_dp": 1250,
    "pending_reward_dp": 750,
    "monthly_uses": 3,
    "monthly_cap": 20
  },
  "items": [
    {
      "referral_id": "d4e5f6a7-b8c9-0123-def0-123456789abc",
      "referee_display_name": "Fatima K.",
      "status": "qualified",
      "created_at": "2026-04-01T10:00:00.000Z",
      "qualified_at": "2026-04-05T14:30:00.000Z",
      "reward": {
        "reward_id": "e5f6a7b8-c9d0-1234-ef01-23456789abcd",
        "amount": 250,
        "currency": "dp",
        "status": "held",
        "hold_until": "2026-04-19T14:30:00.000Z",
        "hold_days_remaining": 6
      }
    },
    {
      "referral_id": "f6a7b8c9-d0e1-2345-f012-3456789abcde",
      "referee_display_name": "Omar S.",
      "status": "rewarded",
      "created_at": "2026-03-10T08:00:00.000Z",
      "qualified_at": "2026-03-14T11:00:00.000Z",
      "reward": {
        "reward_id": "a7b8c9d0-e1f2-3456-0123-456789abcdef",
        "amount": 250,
        "currency": "dp",
        "status": "released",
        "released_at": "2026-03-28T11:00:00.000Z"
      }
    }
  ],
  "limit": 20,
  "hasMore": false,
  "nextCursor": null
}
```

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 400 | `INVALID_CURSOR` | Malformed cursor |
| 400 | `INVALID_STATUS_FILTER` | Invalid status value |
| 401 | `AUTHENTICATION_REQUIRED` | Missing or invalid token |

**Business Rules Enforced:**
- Users see only their own referrals (`referrer_user_id = req.user.id`)
- Referee names are display names only (no email, no phone — no PII leakage)
- `hold_days_remaining` computed as `MAX(0, CEIL(EXTRACT(EPOCH FROM hold_until - NOW()) / 86400))`
- Monthly cap: 20 referrals per calendar month per Business Rules spec

**Analytics Events:**
- `growth.referral.status_viewed` — `{ user_id, total_referrals, pending_count }`

---

## 3. Seller APIs

Module: `backend/src/modules/rewards/routes.js` (boost endpoints)
Module: `backend/src/modules/creator/routes.js` (seller analytics extensions)

---

### 3.1 POST /boosts/purchase

Purchase a boost campaign for a product listing. Deducts from seller's payment method via Stripe and creates an active boost.

**Route:** `POST /api/boosts/purchase`

**Auth:** Required (Bearer JWT). User must be the product's creator.

**Rate Limit:** 10 requests per 15 minutes per user

**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <uuid>
```

**Request Body:**
```json
{
  "product_id": 231,
  "boost_type": "standard",
  "budget_minor": 5000,
  "duration_days": 7
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `product_id` | integer | Yes | Must exist, creator must be req.user | Product to boost |
| `boost_type` | string | Yes | `standard`, `premium`, `featured` | Tier determines multiplier |
| `budget_minor` | integer | Yes | Min 500 ($5), max 1000000 ($10,000) | Budget in cents |
| `duration_days` | integer | No | 1–90, default 7 | Campaign duration |

**Boost type → multiplier mapping:**

| Boost Type | Multiplier | Min Budget |
|-----------|------------|------------|
| `standard` | 1.50× | $5.00 (500) |
| `premium` | 2.00× | $15.00 (1500) |
| `featured` | 3.00× | $50.00 (5000) |

**Response: 201 Created**
```json
{
  "ok": true,
  "message": "Boost campaign created",
  "data": {
    "boost_id": "a1b2c3d4-1234-5678-abcd-111111111111",
    "product_id": 231,
    "boost_type": "standard",
    "boost_multiplier": 1.50,
    "budget_minor": 5000,
    "spent_minor": 0,
    "status": "active",
    "starts_at": "2026-04-13T12:00:00.000Z",
    "ends_at": "2026-04-20T12:00:00.000Z",
    "stripe_payment_intent_id": "pi_3abc123..."
  }
}
```

**Error Codes:**

| Status | Error Code | Message | When |
|--------|-----------|---------|------|
| 400 | `INVALID_BOOST_TYPE` | `Boost type must be standard, premium, or featured` | Invalid type |
| 400 | `INVALID_BUDGET` | `Budget must be at least $5.00 (500 cents)` | Below minimum |
| 400 | `INVALID_DURATION` | `Duration must be 1–90 days` | Out of range |
| 403 | `NOT_PRODUCT_OWNER` | `You can only boost your own products` | Not the creator |
| 403 | `ACCOUNT_FROZEN` | `Your account is under review` | Trust flags active |
| 404 | `PRODUCT_NOT_FOUND` | `Product not found or not published` | Invalid/archived product |
| 409 | `DUPLICATE_BOOST` | `This product already has an active boost` | Active boost exists |
| 422 | `TRUST_SCORE_TOO_LOW` | `Boost requires a trust score of at least 400` | Trust band = critical |
| 422 | `PAYMENT_FAILED` | `Payment could not be processed` | Stripe declined |

**Business Rules Enforced:**
1. **Boost is a multiplier, not an override:** `visibility_score = organic_score × boost_multiplier × penalty_multiplier`. Zero organic = zero visibility even with boost.
2. **One active boost per product** at a time.
3. **Trust gate:** Seller must have trust_band ≠ 'critical' (trust_score ≥ 200).
4. **Product must be published** (`creator_products.status = 'published'`).
5. **Content safety:** Boosted product must pass content safety checks (existing middleware).
6. **Payment before activation:** Stripe PaymentIntent must succeed before boost goes `active`.
7. **Boost spend tracked in ledger:** All spend is transparent and auditable.

**Analytics Events:**
- `rewards.boost.purchased` — `{ user_id, product_id, boost_type, budget_minor, duration_days }`

---

### 3.2 GET /boosts/history

Retrieve the seller's boost campaign history.

**Route:** `GET /api/boosts/history`

**Auth:** Required (Bearer JWT)

**Rate Limit:** Global (120/min)

**Request Headers:**
```
Authorization: Bearer <token>
```

**Query Params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `limit` | integer | No | 20 | Items per page (1–100) |
| `cursor` | string | No | — | Pagination cursor |
| `status` | string | No | — | Filter: `active`, `paused`, `exhausted`, `cancelled`, `expired` |

**Response: 200 OK**
```json
{
  "items": [
    {
      "boost_id": "a1b2c3d4-1234-5678-abcd-111111111111",
      "product_id": 231,
      "product_title": "Handmade Prayer Beads",
      "boost_type": "standard",
      "boost_multiplier": 1.50,
      "budget_minor": 5000,
      "spent_minor": 2340,
      "remaining_minor": 2660,
      "impression_count": 1872,
      "cost_per_impression_minor": 1,
      "status": "active",
      "starts_at": "2026-04-10T12:00:00.000Z",
      "ends_at": "2026-04-17T12:00:00.000Z",
      "days_remaining": 4,
      "created_at": "2026-04-10T12:00:00.000Z"
    }
  ],
  "limit": 20,
  "hasMore": false,
  "nextCursor": null
}
```

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 400 | `INVALID_CURSOR` | Malformed cursor |
| 401 | `AUTHENTICATION_REQUIRED` | Missing or invalid token |

**Business Rules Enforced:**
- Sellers see only their own boosts (`seller_user_id = req.user.id`)
- `remaining_minor` = `budget_minor - spent_minor`
- `days_remaining` = `MAX(0, CEIL((ends_at - NOW()) / interval '1 day'))`

---

### 3.3 GET /seller/analytics/performance

Retrieve the seller's performance metrics used in organic ranking calculation.

**Route:** `GET /api/seller/analytics/performance`

**Auth:** Required (Bearer JWT)

**Rate Limit:** 60 requests per minute (search/analytics limiter)

**Request Headers:**
```
Authorization: Bearer <token>
```

**Query Params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `period` | string | No | `30d` | Time period: `7d`, `30d`, `90d` |

**Response: 200 OK**
```json
{
  "data": {
    "user_id": 42,
    "period": "30d",
    "period_start": "2026-03-14T00:00:00.000Z",
    "period_end": "2026-04-13T00:00:00.000Z",
    "sales": {
      "total_orders": 47,
      "total_revenue_minor": 235000,
      "average_order_minor": 5000,
      "conversion_rate": 0.082
    },
    "reviews": {
      "average_score": 4.6,
      "total_reviews": 31,
      "score_distribution": { "5": 18, "4": 8, "3": 3, "2": 1, "1": 1 }
    },
    "fulfillment": {
      "fulfillment_rate": 0.978,
      "average_ship_hours": 18.5,
      "return_rate": 0.021
    },
    "engagement": {
      "response_rate": 0.94,
      "average_response_minutes": 42,
      "product_views_total": 573
    },
    "trust": {
      "trust_score": 720,
      "trust_band": "good",
      "penalty_multiplier": 1.00,
      "flags_active": 0
    }
  }
}
```

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 400 | `INVALID_PERIOD` | Period not in `7d`, `30d`, `90d` |
| 401 | `AUTHENTICATION_REQUIRED` | Missing or invalid token |

**Business Rules Enforced:**
- Sellers can only see their own performance data
- Metrics pulled from `ranking_signals`, `seller_trust_profiles`, and existing `orders`/`reviews` tables
- `conversion_rate = total_orders / product_views_total` (rolling window)

**Analytics Events:**
- `seller.analytics.performance_viewed` — `{ user_id, period }`

---

### 3.4 GET /seller/analytics/ranking

Retrieve the seller's current ranking position and visibility score breakdown.

**Route:** `GET /api/seller/analytics/ranking`

**Auth:** Required (Bearer JWT)

**Rate Limit:** 60 requests per minute

**Request Headers:**
```
Authorization: Bearer <token>
```

**Query Params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `product_id` | integer | No | — | Specific product ranking. Omit for seller-level. |

**Response: 200 OK**
```json
{
  "data": {
    "user_id": 42,
    "product_id": null,
    "ranking": {
      "organic_score": 72.45,
      "boost_multiplier": 1.00,
      "penalty_multiplier": 1.00,
      "visibility_score": 72.45,
      "formula": "organic_score × boost_multiplier × penalty_multiplier"
    },
    "organic_breakdown": {
      "sales_volume": { "raw": 47, "weighted": 21.74, "weight": 0.30 },
      "conversion_rate": { "raw": 0.082, "weighted": 18.13, "weight": 0.25 },
      "avg_review_score": { "raw": 4.6, "weighted": 14.49, "weight": 0.20 },
      "return_rate_inv": { "raw": 0.979, "weighted": 7.24, "weight": 0.10 },
      "content_quality": { "raw": 0.85, "weighted": 7.24, "weight": 0.10 },
      "recency": { "raw": 0.92, "weighted": 3.62, "weight": 0.05 }
    },
    "active_boost": null,
    "computed_at": "2026-04-13T06:00:00.000Z"
  }
}
```

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 401 | `AUTHENTICATION_REQUIRED` | Missing or invalid token |
| 403 | `NOT_PRODUCT_OWNER` | Product doesn't belong to user |
| 404 | `PRODUCT_NOT_FOUND` | Invalid product_id |

**Business Rules Enforced:**
- Ranking formula: `visibility_score = organic_score × boost_multiplier × penalty_multiplier`
- Organic score components: sales_volume (30%), conversion_rate (25%), avg_review_score (20%), return_rate_inv (10%), content_quality (10%), recency (5%)
- Penalty multiplier from `seller_trust_profiles.penalty_multiplier`
- Ranking data may be up to 15 minutes stale (cron refresh interval)

**Analytics Events:**
- `seller.analytics.ranking_viewed` — `{ user_id, product_id, visibility_score }`

---

## 4. Checkout APIs

Module: `backend/src/modules/monetization/routes.js` (extensions to existing checkout flow)

These endpoints extend the existing checkout flow with reward hooks. They run within the same transaction boundary as order creation.

---

### 4.1 GET /checkout/rewards/eligibility

Check what reward options are available for the current user on a specific order — how many points they can redeem, what they'll earn, and whether a referral discount applies.

**Route:** `GET /api/checkout/rewards/eligibility`

**Auth:** Required (Bearer JWT)

**Rate Limit:** 30 requests per 15 minutes (checkout limiter)

**Request Headers:**
```
Authorization: Bearer <token>
```

**Query Params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `order_amount_minor` | integer | Yes | Order total in cents before any discount |
| `product_id` | integer | No | Product being purchased (for challenge matching) |
| `seller_user_id` | integer | No | Seller ID (for merchant challenge matching) |

**Response: 200 OK**
```json
{
  "data": {
    "user_id": 42,
    "order_amount_minor": 7500,
    "redemption": {
      "eligible": true,
      "balance_available": 1250,
      "max_redeemable_points": 1125,
      "max_redeemable_reason": "15% of order total ($75.00) = $11.25 = 1125 DP",
      "max_dollar_value_minor": 1125,
      "min_redemption_points": 500
    },
    "earning": {
      "eligible": true,
      "base_points": 75,
      "tier_multiplier": 1.25,
      "streak_multiplier": 2.00,
      "combined_multiplier": 2.50,
      "estimated_earn": 187,
      "daily_cap_remaining": 563,
      "earn_after_cap": 187,
      "tier": "member"
    },
    "referral_discount": {
      "eligible": false,
      "discount_minor": 0,
      "reason": null
    },
    "challenges_progressed": [
      {
        "challenge_id": "f1a2b3c4-d5e6-7890-abcd-222222222222",
        "title": "Buy from 3 different sellers",
        "current_progress": 2,
        "target": 3,
        "would_complete": true,
        "reward_points": 100
      }
    ]
  }
}
```

**Eligibility calculation detail:**

| Rule | Formula | Source |
|------|---------|--------|
| Min order to earn | `order_amount_minor >= 2500` ($25) | Business Rules |
| Base earn points | `FLOOR(order_amount_minor / 100) × points_per_dollar` | 10 DP/$1 |
| Tier multiplier | Lookup from `reward_rules_config` | 1.0×–3.0× |
| Streak multiplier | From `reward_accounts.streak_multiplier` | 1.0×–3.0× |
| Combined | `tier_multiplier × streak_multiplier` | Capped by daily earn cap |
| Max redeemable | `MIN(balance, FLOOR(order_amount_minor × 0.15), 2000)` | 15% or $20 cap |

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 400 | `INVALID_ORDER_AMOUNT` | `order_amount_minor` missing or ≤ 0 |
| 401 | `AUTHENTICATION_REQUIRED` | Missing or invalid token |

**Business Rules Enforced:**
- Minimum $25 order to earn points
- Max redemption: lesser of 15% of order total or $20 (2000 DP)
- Earning estimate accounts for daily cap — `earn_after_cap = MIN(estimated_earn, daily_cap_remaining)`
- Frozen accounts: `redemption.eligible = false`, `earning.eligible = false`
- Referral discount only on referee's first qualifying order (one-time)

**Analytics Events:**
- `checkout.rewards.eligibility_checked` — `{ user_id, order_amount_minor, redeemable_points, estimated_earn }`

---

### 4.2 POST /checkout/rewards/apply

Apply a point redemption to a checkout session. This locks in the discount — points are debited from balance and the redemption is marked as applied.

**Route:** `POST /api/checkout/rewards/apply`

**Auth:** Required (Bearer JWT)

**Rate Limit:** 10 requests per 15 minutes per user

**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <uuid>
```

**Request Body:**
```json
{
  "checkout_session_id": 892,
  "points_amount": 500
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `checkout_session_id` | integer | Yes | Must exist, status = 'created' | Checkout session to apply discount to |
| `points_amount` | integer | Yes | Min 500, max per eligibility rules | DP to redeem |

**Response: 200 OK**
```json
{
  "ok": true,
  "message": "Reward discount applied to checkout",
  "data": {
    "redemption_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "checkout_session_id": 892,
    "points_deducted": 500,
    "discount_minor": 500,
    "discount_display": "$5.00",
    "original_amount_minor": 7500,
    "adjusted_amount_minor": 7000,
    "balance_after": 750
  }
}
```

**Error Codes:**

| Status | Error Code | Message | When |
|--------|-----------|---------|------|
| 400 | `INVALID_POINTS_AMOUNT` | `Points amount must be at least 500 DP` | Below minimum |
| 400 | `INVALID_SESSION` | `Checkout session not found or already completed` | Bad session |
| 403 | `ACCOUNT_FROZEN` | `Your reward account is frozen` | Account frozen |
| 403 | `NOT_SESSION_OWNER` | `This checkout session does not belong to you` | Wrong user |
| 409 | `ALREADY_APPLIED` | `A reward discount is already applied to this session` | Duplicate |
| 422 | `INSUFFICIENT_BALANCE` | `Not enough points` | Balance too low |
| 422 | `REDEMPTION_EXCEEDS_CAP` | `Exceeds maximum redemption for this order` | Over cap |
| 429 | `RATE_LIMITED` | `Too many attempts` | Rate limit |

**Business Rules Enforced:**
1. Checkout session must exist and be in `created` status (not yet completed)
2. Buyer must own the session (`checkout_sessions.buyer_user_id = req.user.id`)
3. Same balance, cap, and minimum rules as `POST /rewards/redeem`
4. **Atomic:** Points debit + redemption record + session metadata update in one transaction
5. If checkout expires/fails, a cron job reverses the redemption and credits points back

**Analytics Events:**
- `checkout.rewards.applied` — `{ user_id, checkout_session_id, points_amount, discount_minor }`

---

### 4.3 POST /checkout/complete

Complete a checkout with reward hooks. This is an **extension to the existing checkout completion flow** — not a new endpoint. The existing `POST /monetization/webhooks/stripe` handler is extended to trigger reward calculations after successful payment.

**Route:** Internal hook — triggered by Stripe webhook `payment_intent.succeeded` via existing `POST /api/monetization/webhooks/stripe`

**Auth:** Stripe webhook signature verification (existing)

**Rate Limit:** Exempt (Stripe webhook)

**Trigger:** When `payment_intent.succeeded` fires and an order is created.

**Reward Hooks Executed (in order):**

```
1. Order created (existing monetization flow)
   │
   ├─ 2. EARN: Calculate & credit buyer points
   │     ├─ Check daily cap
   │     ├─ Apply tier × streak multiplier
   │     ├─ Insert reward_ledger_entries (credit)
   │     ├─ Update reward_accounts.balance, points_earned_today
   │     └─ Track: rewards.points.earned
   │
   ├─ 3. REFERRAL: Check if this qualifies a referral
   │     ├─ Is buyer a referee with status = 'pending'?
   │     ├─ Is order >= $25?
   │     ├─ Update referral_relationships.status = 'qualified'
   │     ├─ Create referral_rewards (held, hold_until = NOW + 14 days)
   │     ├─ Insert referral_events (first_purchase, qualified, hold_started)
   │     └─ Track: growth.referral.qualified
   │
   ├─ 4. CHALLENGE: Update challenge progress
   │     ├─ Find active user_challenges matching this purchase
   │     ├─ Increment progress
   │     ├─ If progress >= target → complete + credit reward
   │     └─ Track: rewards.challenge.progressed / rewards.challenge.completed
   │
   ├─ 5. RANKING: Update seller ranking signals
   │     ├─ Increment sales_count_30d, sales_volume_30d
   │     ├─ Recalculate conversion_rate
   │     ├─ Fraud filter (same-day account, device overlap, no browse history)
   │     └─ Track: merchant.transaction.processed
   │
   └─ 6. REDEMPTION: If points were applied
         ├─ Confirm redemption status = 'applied'
         ├─ Link redemption to order_id
         └─ Track: rewards.redemption.confirmed
```

**Reward Calculation Detail:**

```
Input:
  order_amount_minor = 7500  ($75.00)
  user_tier = "member"
  streak_multiplier = 2.00

Calculation:
  base_points = FLOOR(7500 / 100) × 10 = 750
  tier_multiplier = 1.25 (member)
  combined_multiplier = 1.25 × 2.00 = 2.50
  raw_earn = FLOOR(750 × 2.50) = 1875

  daily_cap = 750 (member)
  earned_today = 120
  remaining = 750 - 120 = 630

  final_earn = MIN(1875, 630) = 630

Output:
  Credit 630 DP to buyer
  balance_after = previous_balance + 630
```

**On Refund (charge.refunded webhook):**

```
1. Find reward_ledger_entries WHERE source = 'purchase' AND source_ref_id = order_id
2. Insert refund_clawback debit entry for same amount
3. Update reward_accounts.balance
4. If referral was qualified by this order:
   a. If hold period still active → extend hold by 14 more days
   b. If already released → create fraud_flag for manual review
5. Track: rewards.points.clawed_back
```

**Analytics Events (all fired in service layer, non-blocking):**
- `rewards.points.earned` — `{ user_id, amount, source: 'purchase', order_id, balance_after, multiplier_applied, tier_at_time }`
- `growth.referral.qualified` — `{ referrer_user_id, referee_user_id, order_id }` (if applicable)
- `rewards.challenge.progressed` — `{ user_id, challenge_id, progress, target }` (if applicable)
- `rewards.challenge.completed` — `{ user_id, challenge_id, reward_points }` (if applicable)
- `merchant.transaction.processed` — `{ seller_user_id, order_id, amount_minor }`
- `rewards.redemption.confirmed` — `{ user_id, redemption_id, order_id }` (if applicable)

---

## 5. Internal / Backend APIs

These endpoints are **not called by the mobile or web client**. They are called internally by other backend modules (service-to-service function calls within the monolith) or by cron jobs. Documented here as API contracts for module boundaries.

**Auth for all internal APIs:** Called via in-process function calls — no HTTP auth. The calling module passes `{ userId, ... }` directly.

---

### 5.1 POST /events/ingest

Internal service function for ingesting reward-relevant events from other modules. Not an HTTP endpoint — it's a function interface.

**Function Signature:**
```javascript
// Service: createRewardsEventIngester({ db, config, rewardsService, referralService, challengeService })
async function ingestEvent(eventType, payload)
```

**Event Types & Payloads:**

| Event Type | Payload | Action |
|-----------|---------|--------|
| `order.completed` | `{ order_id, buyer_user_id, seller_user_id, amount_minor, product_id }` | Trigger earn calculation, referral check, challenge progress, ranking signal update |
| `order.refunded` | `{ order_id, buyer_user_id, amount_minor, reason }` | Clawback points, extend referral holds, reverse ranking signals |
| `user.signup` | `{ user_id, referral_code?, device_fingerprint?, ip_address? }` | Create reward_account, attribute referral, credit signup bonus |
| `user.daily_active` | `{ user_id }` | Trigger streak check-in logic |
| `review.created` | `{ user_id, product_id, rating }` | Credit review points, update seller review signals |
| `user.deactivated` | `{ user_id }` | Freeze reward account, forfeit pending referrals |

**Response Shape:**
```javascript
{
  ok: true,
  actions_taken: ['points_credited', 'challenge_progressed'],
  points_earned: 630,
  new_balance: 1880
}
```

**Business Rules Enforced:**
- All event processing is idempotent — duplicate events (same `order_id`) are safe
- Events that fail are logged and do not block the calling module
- Point mutations use `SELECT ... FOR UPDATE` on `reward_accounts`

---

### 5.2 POST /rewards/calculate

Internal service function to calculate the points a user would earn from a transaction, without actually crediting them. Used by eligibility checks and the checkout flow.

**Function Signature:**
```javascript
// Service: createRewardsService({ db, config })
async function calculateEarn({ userId, amountMinor })
```

**Input:**
```javascript
{
  userId: 42,
  amountMinor: 7500  // $75.00
}
```

**Output:**
```javascript
{
  eligible: true,
  base_points: 750,
  tier: "member",
  tier_multiplier: 1.25,
  streak_multiplier: 2.00,
  combined_multiplier: 2.50,
  raw_earn: 1875,
  daily_cap: 750,
  earned_today: 120,
  daily_cap_remaining: 630,
  final_earn: 630,
  ineligible_reason: null
}
```

**Ineligible reasons:**
- `"order_below_minimum"` — order < $25
- `"account_frozen"` — reward account is frozen
- `"daily_cap_reached"` — already at daily earn cap
- `"account_not_found"` — no reward account (should auto-create)

**Business Rules Enforced:**
- Minimum order: $25.00 (2500 minor)
- Base rate: 10 DP per $1 spent
- Tier multiplier: Explorer 1.0×, Member 1.25×, Insider 1.5×, VIP 2.0×, Elite 3.0×
- Streak multiplier: Days 1–6: 1.0×, 7–13: 1.5×, 14–30: 2.0×, 31+: 3.0×
- Daily cap per tier: Explorer 500, Member 750, Insider 1000, VIP 1500, Elite 2500
- Combined multiplier = `tier_multiplier × streak_multiplier`
- Final earn = `MIN(FLOOR(base_points × combined_multiplier), daily_cap_remaining)`
- All values read from `reward_rules_config`, not hardcoded

---

### 5.3 POST /referrals/evaluate

Internal service function to evaluate a referral's qualification status and process hold/release/forfeit logic. Called by cron job and by order event handlers.

**Function Signature:**
```javascript
// Service: createReferralService({ db, config, rewardsService, analytics })
async function evaluateReferral({ referralId, triggerEvent })
```

**Input:**
```javascript
{
  referralId: "d4e5f6a7-b8c9-0123-def0-123456789abc",
  triggerEvent: "order_completed" // or "hold_expired", "order_refunded", "admin_review"
}
```

**Output:**
```javascript
{
  referral_id: "d4e5f6a7-b8c9-0123-def0-123456789abc",
  previous_status: "pending",
  new_status: "qualified",
  actions_taken: [
    "status_updated_to_qualified",
    "referrer_reward_held",
    "referee_discount_held",
    "referral_event_logged"
  ],
  rewards: [
    { beneficiary: "referrer", type: "referrer_points", amount: 250, status: "held", hold_until: "2026-04-27T14:30:00Z" },
    { beneficiary: "referee", type: "referee_discount", amount: 500, status: "held", hold_until: "2026-04-27T14:30:00Z" }
  ],
  fraud_checks: {
    self_referral: false,
    device_overlap: false,
    ip_overlap: false,
    monthly_cap_exceeded: false,
    passed: true
  }
}
```

**Evaluation Logic:**

```
IF triggerEvent = "order_completed":
  1. Check fraud signals (device overlap, IP overlap, self-referral)
  2. If fraud detected → create fraud_flag, set status = 'rejected'
  3. Check monthly cap (≤ 20 per month per referrer)
  4. If cap exceeded → reject
  5. Verify order >= $25 minimum
  6. Set status = 'qualified', create reward holds (14-day)
  7. Log referral_events: first_purchase, qualified, hold_started

IF triggerEvent = "hold_expired":
  1. Re-verify no disputes on qualifying order
  2. If clean → release rewards (credit to ledger)
  3. If disputed → extend hold by 14 days (max 3 extensions)
  4. If max extensions reached → forfeit

IF triggerEvent = "order_refunded":
  1. If hold active → extend hold by 14 days
  2. If already released → create fraud_flag for manual review
  3. Log referral_event: hold_extended or fraud_flagged
```

**Business Rules Enforced:**
- 14-day hold before release (configurable via `referral_hold_days`)
- $25 minimum purchase by referee to qualify
- 20 referrals per month per referrer
- Self-referral blocked (DB constraint + application check)
- Device/IP overlap detection
- Referrer reward: 250 DP. Referee discount: $5.00 (500 cents)
- Hold can be extended up to 3 times (42-day max hold)
- All from `reward_rules_config`, not hardcoded

---

### 5.4 POST /ranking/signals

Internal service function to recompute organic ranking signals for a seller. Called by cron (every 15 minutes) and on-demand after significant events (order, review, refund).

**Function Signature:**
```javascript
// Service: createRankingService({ db, config })
async function computeSignals({ sellerUserId, productId })
```

**Input:**
```javascript
{
  sellerUserId: 42,
  productId: null  // null = seller-level, integer = product-level
}
```

**Output:**
```javascript
{
  seller_user_id: 42,
  product_id: null,
  signal_type: "seller_overall",
  organic_score: 72.45,
  component_scores: {
    sales_volume:     { raw: 47, normalized: 0.724, weighted: 21.74, weight: 0.30 },
    conversion_rate:  { raw: 0.082, normalized: 0.725, weighted: 18.13, weight: 0.25 },
    avg_review_score: { raw: 4.6, normalized: 0.724, weighted: 14.49, weight: 0.20 },
    return_rate_inv:  { raw: 0.979, normalized: 0.724, weighted: 7.24, weight: 0.10 },
    content_quality:  { raw: 0.85, normalized: 0.724, weighted: 7.24, weight: 0.10 },
    recency:          { raw: 0.92, normalized: 0.724, weighted: 3.62, weight: 0.05 }
  },
  visibility_score: 72.45,
  boost_multiplier: 1.00,
  penalty_multiplier: 1.00,
  computed_at: "2026-04-13T06:00:00Z"
}
```

**Ranking Formula:**
```
organic_score = (sales_volume_norm × 0.30)
              + (conversion_rate_norm × 0.25)
              + (avg_review_score_norm × 0.20)
              + (return_rate_inv_norm × 0.10)
              + (content_quality_norm × 0.10)
              + (recency_norm × 0.05)

visibility_score = organic_score × boost_multiplier × penalty_multiplier
```

**Normalization:** Each raw signal is normalized to 0–100 using min-max scaling against platform-wide percentiles (computed weekly).

**Fraud Filters on Signal Updates:**
- Exclude orders from accounts created same day
- Exclude orders where buyer device matches seller device
- Exclude orders with no buyer browse history for seller's products
- Flag seller if order velocity increases >200% WoW from base < 20 orders

**Business Rules Enforced:**
- Boosts are **multipliers only** — zero organic = zero visibility regardless of boost
- Penalty multiplier from `seller_trust_profiles.penalty_multiplier` (0.00–1.00)
- Signals stored in `ranking_signals` with `UPSERT` semantics (unique on seller+product+type+period)

---

### 5.5 POST /trust/flag

Internal service function to create a fraud flag and optionally take automated action.

**Function Signature:**
```javascript
// Service: createTrustService({ db, config, analytics })
async function createFlag({ userId, flagType, severity, source, referenceType, referenceId, evidence, autoAction })
```

**Input:**
```javascript
{
  userId: 42,
  flagType: "velocity_breach",
  severity: "high",
  source: "velocity_check",
  referenceType: "ledger_entry",
  referenceId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  evidence: {
    transactions_in_hour: 15,
    limit: 10,
    transaction_ids: ["id1", "id2", "..."]
  },
  autoAction: "freeze_earning"
}
```

**Output:**
```javascript
{
  flag_id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  user_id: 42,
  flag_type: "velocity_breach",
  severity: "high",
  status: "open",
  auto_action_taken: "freeze_earning",
  trust_score_impact: {
    before: 720,
    after: 580,
    band_before: "good",
    band_after: "new"
  }
}
```

**Auto-Actions Available:**

| Auto Action | Effect |
|------------|--------|
| `none` | Flag only, no automated response |
| `freeze_earning` | Set `reward_accounts.is_frozen = true`, block new earns |
| `hold_pending_rewards` | Extend all pending referral reward holds by 14 days |
| `void_flagged_points` | Void the specific ledger entries referenced in evidence |
| `freeze_account` | Full account freeze — no earn, no redeem, no referral |

**Severity → Auto-Action Defaults:**

| Severity | Default Auto-Action |
|----------|-------------------|
| `low` | `none` |
| `medium` | `hold_pending_rewards` |
| `high` | `freeze_earning` |
| `critical` | `freeze_account` |

**Business Rules Enforced:**
- Flag creation always triggers trust score recalculation
- `critical` severity always triggers account freeze — no exception
- All auto-actions are logged in `admin_actions` with `source = 'system_auto'`
- Fraud flags update `seller_trust_profiles.flags_active` counter
- Trust score drop below 200 triggers automatic boost pause

**Analytics Events:**
- `trust.fraud.detected` — `{ user_id, flag_type, severity, auto_action_taken }`
- `trust.score.changed` — `{ user_id, before, after, band_before, band_after, reason }`

---

## 6. Admin APIs

Module: `backend/src/modules/admin/routes.js` (extensions)
Factory: Extends existing `createAdminRouter({ db, config, pushNotifications })`

**Auth for all admin endpoints:**
```
authenticate({ config, db })
  → authorize(["moderator", "admin"])
  → requireAdminOwner
```

All admin mutations log to `admin_actions` table.

---

### 6.1 GET /admin/rewards/ledger

Browse the rewards ledger with filters. Supports cross-user queries for investigation.

**Route:** `GET /api/admin/rewards/ledger`

**Auth:** Admin required

**Rate Limit:** Global (120/min)

**Query Params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `limit` | integer | No | 50 | Items per page (1–200) |
| `offset` | integer | No | 0 | Starting offset |
| `user_id` | integer | No | — | Filter by user |
| `type` | string | No | — | Filter: `credit`, `debit` |
| `source` | string | No | — | Filter by source |
| `from` | string (ISO 8601) | No | — | Start date |
| `to` | string (ISO 8601) | No | — | End date |
| `min_amount` | integer | No | — | Minimum amount |
| `max_amount` | integer | No | — | Maximum amount |
| `voided` | boolean | No | — | Filter voided entries only |

**Response: 200 OK**
```json
{
  "items": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "user_id": 42,
      "user_email": "ah***@example.com",
      "user_display_name": "Ahmed K.",
      "type": "credit",
      "amount": 630,
      "balance_after": 1880,
      "source": "purchase",
      "source_ref_type": "order",
      "source_ref_id": "1847",
      "description": "Points earned from order #1847",
      "tier_at_time": "member",
      "multiplier_applied": 2.50,
      "idempotency_key": "order-1847-earn",
      "metadata": { "order_amount_minor": 7500 },
      "voided_at": null,
      "created_at": "2026-04-12T18:30:00.000Z"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 15847
}
```

> **Note:** Admin responses include partial email (masked) and display name for identification. Full email is never shown in the ledger view — use the existing admin user detail endpoint for that.

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 400 | `INVALID_FILTER` | Invalid filter parameter |
| 401 | `AUTHENTICATION_REQUIRED` | Missing token |
| 403 | `INSUFFICIENT_PERMISSIONS` | Not admin |

---

### 6.2 POST /admin/rewards/override

Manually credit or debit points to a user's account, void specific ledger entries, freeze/unfreeze accounts, or override tier. Every action requires a reason and is immutably logged.

**Route:** `POST /api/admin/rewards/override`

**Auth:** Admin required

**Rate Limit:** 10 requests per 15 minutes per admin

**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "action": "manual_credit",
  "target_user_id": 42,
  "params": {
    "amount": 500,
    "description": "Compensation for service issue #4521"
  },
  "reason": "Customer support escalation — order delivery delayed 5 days, goodwill credit per policy"
}
```

**Action types & params:**

| Action | Params | Effect |
|--------|--------|--------|
| `manual_credit` | `{ amount: int, description: string }` | Credit DP to user. Creates ledger entry with source = 'manual_credit'. |
| `manual_debit` | `{ amount: int, description: string }` | Debit DP from user. Creates ledger entry with source = 'manual_debit'. |
| `void_points` | `{ ledger_entry_id: uuid }` | Set `voided_at = NOW()` on a specific ledger entry. Creates offsetting debit. |
| `freeze_account` | `{ frozen_reason: string }` | Set `is_frozen = true` on reward_accounts. |
| `unfreeze_account` | `{}` | Set `is_frozen = false`. |
| `tier_override` | `{ tier: string }` | Force-set user's tier (bypass qualification). |
| `streak_reset` | `{}` | Reset streak to 0. |
| `streak_shield_grant` | `{ shields: int }` | Add shields to user's streak. |

**Response: 200 OK**
```json
{
  "ok": true,
  "message": "Manual credit of 500 DP applied to user 42",
  "data": {
    "admin_action_id": "d4e5f6a7-b8c9-0123-def0-333333333333",
    "action": "manual_credit",
    "target_user_id": 42,
    "before_state": { "balance": 1250, "tier": "member" },
    "after_state": { "balance": 1750, "tier": "member" },
    "ledger_entry_id": "e5f6a7b8-c9d0-1234-ef01-444444444444",
    "created_at": "2026-04-13T15:30:00.000Z"
  }
}
```

**Error Codes:**

| Status | Error Code | Message | When |
|--------|-----------|---------|------|
| 400 | `INVALID_ACTION` | `Action must be one of: manual_credit, ...` | Unknown action |
| 400 | `MISSING_REASON` | `Reason is required for all admin actions` | Empty reason |
| 400 | `INVALID_AMOUNT` | `Amount must be a positive integer` | Bad amount |
| 400 | `INVALID_TIER` | `Tier must be explorer, member, insider, vip, or elite` | Bad tier |
| 404 | `USER_NOT_FOUND` | `Target user not found` | Invalid user_id |
| 404 | `LEDGER_ENTRY_NOT_FOUND` | `Ledger entry not found` | Invalid entry for void |
| 409 | `ALREADY_VOIDED` | `This ledger entry has already been voided` | Re-voiding |
| 422 | `DEBIT_EXCEEDS_BALANCE` | `Cannot debit more than user's current balance` | Overdraft |

**Business Rules Enforced:**
1. **Reason is mandatory** — `reason` field cannot be empty. Application rejects empty strings.
2. **Atomic audit trail** — `admin_actions` row is created in the same transaction as the mutation.
3. **Before/after state** — `before_state` and `after_state` are captured for full reversibility.
4. **No negative balance** — Manual debit cannot bring balance below 0.
5. **Void creates offset** — Voiding a credit creates an equal debit; voiding a debit creates an equal credit.

**Analytics Events:**
- `admin.rewards.override` — `{ admin_user_id, action, target_user_id, amount }`

---

### 6.3 GET /admin/referrals/queue

Retrieve referrals pending review — those flagged by fraud checks or awaiting manual approval.

**Route:** `GET /api/admin/referrals/queue`

**Auth:** Admin required

**Rate Limit:** Global (120/min)

**Query Params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `limit` | integer | No | 50 | Items per page (1–200) |
| `offset` | integer | No | 0 | Starting offset |
| `status` | string | No | `pending,qualified` | Comma-separated status filter |
| `flagged_only` | boolean | No | false | Show only fraud-flagged referrals |
| `sort` | string | No | `created_at_desc` | `created_at_asc`, `created_at_desc`, `hold_until_asc` |

**Response: 200 OK**
```json
{
  "items": [
    {
      "referral_id": "d4e5f6a7-b8c9-0123-def0-123456789abc",
      "referrer": {
        "user_id": 42,
        "display_name": "Ahmed K.",
        "email_masked": "ah***@example.com",
        "total_referrals": 12,
        "monthly_referrals": 3
      },
      "referee": {
        "user_id": 87,
        "display_name": "Fatima K.",
        "email_masked": "fa***@example.com",
        "signup_date": "2026-04-01T10:00:00.000Z",
        "first_purchase_date": "2026-04-05T14:30:00.000Z"
      },
      "status": "qualified",
      "device_fingerprint": "fp_abc123...",
      "signup_ip": "192.168.1.***",
      "fraud_signals": {
        "device_overlap": false,
        "ip_overlap": true,
        "same_household_likely": true,
        "flags_on_referrer": 0,
        "flags_on_referee": 0
      },
      "rewards": [
        {
          "reward_id": "e5f6a7b8-c9d0-1234-ef01-23456789abcd",
          "beneficiary_user_id": 42,
          "reward_type": "referrer_points",
          "amount": 250,
          "status": "held",
          "hold_until": "2026-04-19T14:30:00.000Z"
        }
      ],
      "events": [
        { "event_type": "code_used", "created_at": "2026-04-01T10:00:00.000Z" },
        { "event_type": "signup_completed", "created_at": "2026-04-01T10:05:00.000Z" },
        { "event_type": "first_purchase", "created_at": "2026-04-05T14:30:00.000Z" },
        { "event_type": "qualified", "created_at": "2026-04-05T14:30:00.000Z" },
        { "event_type": "hold_started", "created_at": "2026-04-05T14:30:00.000Z" }
      ],
      "created_at": "2026-04-01T10:00:00.000Z"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 8
}
```

> **Note:** IP addresses are partially masked in the queue view. Full IPs are available in the detail view for fraud investigation.

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 400 | `INVALID_FILTER` | Invalid parameters |
| 401 | `AUTHENTICATION_REQUIRED` | Missing token |
| 403 | `INSUFFICIENT_PERMISSIONS` | Not admin |

---

### 6.4 POST /admin/referrals/approve

Approve a referral and release its held rewards immediately (bypassing the remaining hold period).

**Route:** `POST /api/admin/referrals/approve`

**Auth:** Admin required

**Rate Limit:** 10 requests per 15 minutes per admin

**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "referral_id": "d4e5f6a7-b8c9-0123-def0-123456789abc",
  "reason": "IP overlap verified as same household — legitimate referral confirmed via support ticket #7821"
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `referral_id` | uuid | Yes | Must exist | Referral to approve |
| `reason` | string | Yes | Min 10 chars | Admin justification |

**Response: 200 OK**
```json
{
  "ok": true,
  "message": "Referral approved and rewards released",
  "data": {
    "admin_action_id": "f6a7b8c9-d0e1-2345-f012-555555555555",
    "referral_id": "d4e5f6a7-b8c9-0123-def0-123456789abc",
    "previous_status": "qualified",
    "new_status": "rewarded",
    "rewards_released": [
      { "reward_id": "...", "beneficiary_user_id": 42, "type": "referrer_points", "amount": 250 },
      { "reward_id": "...", "beneficiary_user_id": 87, "type": "referee_discount", "amount": 500 }
    ]
  }
}
```

**Error Codes:**

| Status | Error Code | Message | When |
|--------|-----------|---------|------|
| 400 | `MISSING_REASON` | `Reason is required (min 10 characters)` | No/short reason |
| 404 | `REFERRAL_NOT_FOUND` | `Referral not found` | Invalid ID |
| 409 | `REFERRAL_ALREADY_RESOLVED` | `This referral has already been rewarded` | Already resolved |
| 422 | `REFERRAL_NOT_QUALIFIED` | `Only qualified referrals can be approved` | Status not qualified |

**Business Rules Enforced:**
1. Referral must be in `qualified` status to approve
2. Approval releases ALL held rewards for this referral (both referrer and referee)
3. Reward release creates `reward_ledger_entries` credit with source = `referral_earned`
4. `referral_events` entry logged: `reward_released`
5. `admin_actions` entry logged with before/after state
6. Push notification sent to referrer: "Your referral reward of 250 DP has been credited!"

**Analytics Events:**
- `admin.referral.approved` — `{ admin_user_id, referral_id, referrer_user_id, referee_user_id }`
- `growth.referral.completed` — `{ referrer_user_id, referee_user_id, referrer_reward_dp: 250 }`

---

### 6.5 POST /admin/referrals/reject

Reject a referral and forfeit its held rewards.

**Route:** `POST /api/admin/referrals/reject`

**Auth:** Admin required

**Rate Limit:** 10 requests per 15 minutes per admin

**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "referral_id": "d4e5f6a7-b8c9-0123-def0-123456789abc",
  "reason": "Device fingerprint overlap — same device used by referrer and referee. Confirmed referral farming.",
  "create_fraud_flag": true,
  "fraud_severity": "high"
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `referral_id` | uuid | Yes | Must exist | Referral to reject |
| `reason` | string | Yes | Min 10 chars | Admin justification |
| `create_fraud_flag` | boolean | No | Default false | Also create a fraud flag |
| `fraud_severity` | string | No | `low`, `medium`, `high`, `critical` | Severity if creating flag |

**Response: 200 OK**
```json
{
  "ok": true,
  "message": "Referral rejected and rewards forfeited",
  "data": {
    "admin_action_id": "a7b8c9d0-e1f2-3456-0123-666666666666",
    "referral_id": "d4e5f6a7-b8c9-0123-def0-123456789abc",
    "previous_status": "qualified",
    "new_status": "rejected",
    "rewards_forfeited": 2,
    "fraud_flag_id": "b8c9d0e1-f2a3-4567-1234-777777777777"
  }
}
```

**Error Codes:**

| Status | Error Code | Message | When |
|--------|-----------|---------|------|
| 400 | `MISSING_REASON` | `Reason is required (min 10 characters)` | No/short reason |
| 400 | `INVALID_SEVERITY` | `Severity must be low, medium, high, or critical` | Bad severity |
| 404 | `REFERRAL_NOT_FOUND` | `Referral not found` | Invalid ID |
| 409 | `REFERRAL_ALREADY_RESOLVED` | `This referral has already been resolved` | Already resolved |

**Business Rules Enforced:**
1. Referral must be in `pending` or `qualified` status to reject
2. Rejection forfeits ALL held rewards for this referral
3. `referral_rewards.status` set to `forfeited`, `forfeit_reason` populated
4. `referral_events` entry logged: `rejected`
5. Optional fraud flag creation on the referrer's account
6. If fraud flag created, trust score is recalculated

**Analytics Events:**
- `admin.referral.rejected` — `{ admin_user_id, referral_id, reason_category, fraud_flag_created }`

---

### 6.6 GET /admin/fraud/flags

Browse fraud flags with filtering and sorting for the fraud review queue.

**Route:** `GET /api/admin/fraud/flags`

**Auth:** Admin required

**Rate Limit:** Global (120/min)

**Query Params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `limit` | integer | No | 50 | Items per page (1–200) |
| `offset` | integer | No | 0 | Starting offset |
| `status` | string | No | `open,investigating` | Comma-separated status filter |
| `severity` | string | No | — | Filter: `low`, `medium`, `high`, `critical` |
| `flag_type` | string | No | — | Filter by flag type |
| `user_id` | integer | No | — | Filter by flagged user |
| `sort` | string | No | `severity_desc,created_at_desc` | Sort order |

**Response: 200 OK**
```json
{
  "summary": {
    "total_open": 12,
    "critical": 2,
    "high": 4,
    "medium": 3,
    "low": 3,
    "oldest_unresolved_hours": 48
  },
  "items": [
    {
      "flag_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "user_id": 42,
      "user_display_name": "Ahmed K.",
      "user_email_masked": "ah***@example.com",
      "flag_type": "velocity_breach",
      "severity": "high",
      "source": "velocity_check",
      "reference_type": "ledger_entry",
      "reference_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "evidence": {
        "transactions_in_hour": 15,
        "limit": 10,
        "transaction_ids": ["id1", "id2"]
      },
      "status": "open",
      "auto_action_taken": "freeze_earning",
      "user_trust_score": 580,
      "user_trust_band": "new",
      "user_reward_balance": 3400,
      "user_total_flags": 3,
      "created_at": "2026-04-13T10:15:00.000Z",
      "age_hours": 5.25
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 12
}
```

**Error Codes:**

| Status | Error Code | When |
|--------|-----------|------|
| 400 | `INVALID_FILTER` | Invalid parameters |
| 401 | `AUTHENTICATION_REQUIRED` | Missing token |
| 403 | `INSUFFICIENT_PERMISSIONS` | Not admin |

**Business Rules Enforced:**
- Default sort: critical severity first, then by age (oldest first) — SLA-driven queue
- Summary includes `oldest_unresolved_hours` for ops SLA tracking
- User context (trust score, balance, total flags) included to enable quick triage

---

### 6.7 POST /admin/fraud/action

Take action on a fraud flag — resolve it, escalate it, or take corrective measures on the flagged user's account.

**Route:** `POST /api/admin/fraud/action`

**Auth:** Admin required

**Rate Limit:** 10 requests per 15 minutes per admin

**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "flag_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "action": "resolve_fraud",
  "corrective_actions": ["void_flagged_points", "freeze_account"],
  "reason": "Confirmed bot-like transaction pattern — 15 transactions in 12 minutes, all $25.01, all from same merchant. Voiding all points and freezing account pending full review."
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `flag_id` | uuid | Yes | Must exist, status ≠ resolved | Flag to act on |
| `action` | string | Yes | See enum below | Resolution action |
| `corrective_actions` | string[] | No | See enum below | Additional corrective measures |
| `reason` | string | Yes | Min 10 chars | Admin justification |
| `override_trust_score` | integer | No | 0–1000 | Manually set trust score |

**Action enum:**

| Action | Effect on Flag |
|--------|----------------|
| `resolve_legitimate` | Close flag as false positive. Unfreeze if auto-frozen. |
| `resolve_fraud` | Close flag as confirmed fraud. Apply corrective actions. |
| `escalate` | Set status to `investigating`. No account changes. |

**Corrective actions enum:**

| Corrective Action | Effect |
|-------------------|--------|
| `void_flagged_points` | Void the specific ledger entries referenced in the flag's evidence |
| `void_all_recent_points` | Void all credits in the last 24 hours for this user |
| `freeze_account` | Freeze reward account |
| `unfreeze_account` | Unfreeze reward account (for resolve_legitimate) |
| `ban_from_referrals` | Deactivate user's referral code, reject all pending referrals |
| `recalculate_trust` | Force trust score recalculation |
| `override_trust_score` | Set trust score to `override_trust_score` value |
| `pause_active_boosts` | Pause all seller's active boost campaigns |

**Response: 200 OK**
```json
{
  "ok": true,
  "message": "Fraud flag resolved — 2 corrective actions applied",
  "data": {
    "admin_action_id": "c9d0e1f2-a3b4-5678-2345-888888888888",
    "flag_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "previous_status": "open",
    "new_status": "resolved_fraud",
    "corrective_results": [
      {
        "action": "void_flagged_points",
        "success": true,
        "detail": "Voided 3 ledger entries totaling 1,890 DP"
      },
      {
        "action": "freeze_account",
        "success": true,
        "detail": "Reward account frozen"
      }
    ],
    "trust_score": {
      "before": 580,
      "after": 180,
      "band_before": "new",
      "band_after": "critical"
    }
  }
}
```

**Error Codes:**

| Status | Error Code | Message | When |
|--------|-----------|---------|------|
| 400 | `INVALID_ACTION` | `Action must be resolve_legitimate, resolve_fraud, or escalate` | Unknown action |
| 400 | `MISSING_REASON` | `Reason is required (min 10 characters)` | No/short reason |
| 400 | `INVALID_CORRECTIVE_ACTION` | `Unknown corrective action: xyz` | Bad corrective action |
| 400 | `INVALID_TRUST_SCORE` | `Trust score must be 0–1000` | Out of range |
| 404 | `FLAG_NOT_FOUND` | `Fraud flag not found` | Invalid ID |
| 409 | `FLAG_ALREADY_RESOLVED` | `This flag has already been resolved` | Re-resolving |

**Business Rules Enforced:**
1. **Reason mandatory** — every resolution requires justification
2. **Resolve_legitimate undoes auto-actions** — if the flag auto-froze the account, resolving as legitimate auto-unfreezes
3. **Resolve_fraud is irreversible** — once resolved as fraud, voided points cannot be un-voided (a manual_credit can compensate if later overturned)
4. **All corrective actions are atomic** — they all succeed or all fail within one transaction
5. **Admin action audit** — every action logged to `admin_actions` with before/after state
6. **Trust score recalculated** after every fraud resolution
7. **Push notification** sent to user if account is frozen: "Your reward account is under review. Contact support for details."

**Analytics Events:**
- `admin.fraud.action_taken` — `{ admin_user_id, flag_id, action, corrective_actions, user_id }`
- `trust.score.changed` — `{ user_id, before, after, reason: 'fraud_flag_resolved' }`

---

## 7. Shared Types

### 7.1 Enumerations

**Tier:**
```
"explorer" | "member" | "insider" | "vip" | "elite"
```

**Ledger entry type:**
```
"credit" | "debit"
```

**Ledger source (credit):**
```
"purchase" | "referral_earned" | "referral_bonus" | "streak_bonus" |
"challenge_reward" | "tier_bonus" | "manual_credit" | "signup_bonus" | "review"
```

**Ledger source (debit):**
```
"redemption" | "expiration" | "manual_debit" | "fraud_void" | "refund_clawback"
```

**Referral status:**
```
"pending" | "qualified" | "rewarded" | "rejected" | "expired"
```

**Referral reward status:**
```
"held" | "released" | "forfeited"
```

**Referral reward type:**
```
"referrer_points" | "referee_discount"
```

**Challenge type:**
```
"daily" | "weekly" | "monthly" | "merchant" | "special"
```

**Challenge status:**
```
"active" | "completed" | "claimed" | "expired" | "abandoned"
```

**Boost type:**
```
"standard" | "premium" | "featured"
```

**Boost status:**
```
"active" | "paused" | "exhausted" | "cancelled" | "expired"
```

**Trust band:**
```
"critical" | "low" | "new" | "good" | "excellent"
```

**Fraud flag type:**
```
"velocity_breach" | "daily_cap_breach" | "duplicate_transaction" |
"self_referral" | "device_overlap" | "ip_overlap" |
"referral_farming" | "refund_abuse" | "account_sharing" |
"suspicious_pattern" | "manual_flag" | "trust_score_drop"
```

**Fraud flag severity:**
```
"low" | "medium" | "high" | "critical"
```

**Fraud flag status:**
```
"open" | "investigating" | "resolved_legitimate" | "resolved_fraud" | "auto_resolved" | "expired"
```

### 7.2 Common Fields

**Cursor (string):** Base64url-encoded JSON: `{ "createdAt": "ISO8601", "id": "uuid" }`

**Timestamps:** All timestamps are ISO 8601 with timezone: `"2026-04-13T18:30:00.000Z"`

**Monetary amounts:** All amounts ending in `_minor` are cents (integers). $25.00 = `2500`.

**Point amounts:** All point fields are integers. 1 DP = 1 unit. No fractional points.

---

## 8. Error Reference

### 8.1 Standard HTTP Error Codes

| Status | Meaning | When |
|--------|---------|------|
| 200 | OK | Successful read or action |
| 201 | Created | Successful resource creation |
| 400 | Bad Request | Invalid input, missing fields, malformed cursor |
| 401 | Unauthorized | Missing or invalid Bearer token |
| 403 | Forbidden | Valid token but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate operation (idempotency conflict) |
| 422 | Unprocessable Entity | Valid input but business rule violation |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server failure |

### 8.2 Domain Error Codes

| Code | Domain | HTTP Status | Description |
|------|--------|-------------|-------------|
| `AUTHENTICATION_REQUIRED` | Auth | 401 | No or invalid token |
| `INSUFFICIENT_PERMISSIONS` | Auth | 403 | Not authorized for this action |
| `ACCOUNT_FROZEN` | Rewards | 403 | Reward account is frozen |
| `INSUFFICIENT_BALANCE` | Rewards | 422 | Not enough points for operation |
| `REDEMPTION_EXCEEDS_CAP` | Rewards | 422 | Over $20 or 15% order cap |
| `REDEMPTION_EXCEEDS_ORDER_PCT` | Rewards | 422 | Over 15% of order total |
| `INVALID_POINTS_AMOUNT` | Rewards | 400 | Below minimum or not a multiple |
| `DAILY_CAP_REACHED` | Rewards | 422 | Daily earn cap hit |
| `ORDER_BELOW_MINIMUM` | Rewards | 422 | Order < $25 |
| `DUPLICATE_REDEMPTION` | Rewards | 409 | Already redeemed for this order |
| `INVALID_CODE` | Referrals | 400 | Referral code invalid or inactive |
| `SELF_REFERRAL` | Referrals | 422 | Cannot refer yourself |
| `MONTHLY_CAP_EXCEEDED` | Referrals | 422 | Over 20 referrals this month |
| `REFERRAL_NOT_FOUND` | Referrals | 404 | Referral doesn't exist |
| `REFERRAL_ALREADY_RESOLVED` | Referrals | 409 | Already approved/rejected |
| `TRUST_SCORE_TOO_LOW` | Trust | 422 | Below threshold for action |
| `NOT_PRODUCT_OWNER` | Boost | 403 | Can't boost someone else's product |
| `DUPLICATE_BOOST` | Boost | 409 | Product already has active boost |
| `PAYMENT_FAILED` | Boost | 422 | Stripe payment failed |
| `FLAG_NOT_FOUND` | Fraud | 404 | Flag doesn't exist |
| `FLAG_ALREADY_RESOLVED` | Fraud | 409 | Already resolved |
| `MISSING_REASON` | Admin | 400 | Admin action requires a reason |

---

## 9. Rate Limiting Summary

All rate limits use `express-rate-limit` with `standardHeaders: true, legacyHeaders: false`. Limits are per-user (keyed on `req.user.id`) for authenticated endpoints, per-IP for unauthenticated.

| Endpoint Category | Window | Limit | Key |
|-------------------|--------|-------|-----|
| **Global default** | 60s | 120 req | Per IP |
| **Rewards read** (balance, history) | 60s | 120 req | Per IP (global) |
| **Rewards write** (redeem) | 15 min | 10 req | Per user |
| **Referral read** (code, status) | 60s | 120 req | Per IP (global) |
| **Referral write** (share) | 15 min | 30 req | Per user |
| **Boost write** (purchase) | 15 min | 10 req | Per user |
| **Seller analytics** | 60s | 60 req | Per IP (search limiter) |
| **Checkout rewards** (eligibility) | 15 min | 30 req | Per user |
| **Checkout rewards** (apply) | 15 min | 10 req | Per user |
| **Admin read** (ledger, queue, flags) | 60s | 120 req | Per IP (global) |
| **Admin write** (override, approve, reject, action) | 15 min | 10 req | Per user |
| **Stripe webhooks** | — | Exempt | — |

### Velocity Limits (Application Level, Not HTTP)

In addition to HTTP rate limits, the rewards service enforces business-level velocity limits:

| Check | Limit | Window | Action on Breach |
|-------|-------|--------|-----------------|
| Earn transactions per user | 10 | 1 hour | Reject earn, create `velocity_breach` fraud flag |
| Earn transactions per user | 50 | 1 day | Reject earn, create `velocity_breach` fraud flag |
| Daily earn cap | Tier-dependent | 1 day | Reject earn (soft rejection, no flag) |
| Duplicate transaction | Same user + merchant + amount | 5 min | Reject via idempotency, create `duplicate_transaction` flag |
| Referrals per user | 20 | 1 month | Reject referral |

---

*End of API Contracts — April 2026*
