# Apple Pay (buyers) and Plaid (sellers)

## Buyers — Apple Pay via Stripe Checkout

Checkout still runs on **Stripe Checkout** (hosted). Wallets (including **Apple Pay** on Safari / compatible mobile browsers) appear when:

1. **Stripe Dashboard** → Settings → Payment methods — Wallets / Apple Pay enabled.  
2. **Apple Pay domain verification** completed for your web origin (Stripe guides you through a file on your site).  
3. The buyer uses a **supported browser/device** (e.g. Safari with Apple Pay set up).

The API uses `payment_method_types: ["card"]` with card 3DS options; Stripe surfaces Apple Pay as a card wallet where allowed. **In-app WebViews** may not show Apple Pay; opening Checkout in **Safari / Chrome** is most reliable.

## Sellers — Plaid → Stripe Connect bank account

When `PLAID_CLIENT_ID` and `PLAID_SECRET` are set:

- **POST** `/api/v1/monetization/plaid/link-token` — Plaid Link token (auth, creator capability).  
- **POST** `/api/v1/monetization/plaid/exchange` — body `{ "publicToken": "..." }` — stores encrypted Plaid access token, returns bank **accounts** to choose from.  
- **POST** `/api/v1/monetization/plaid/attach-stripe-payout` — body `{ "accountId": "<plaid account_id>" }` — creates a Stripe **processor token** and attaches it as the Connect account **external account**.

Requirements:

- Creator has a **Stripe Connect** row (`creator_payout_accounts`) before attach.  
- **US** institutions only in the current config (`country_codes: [US]`, `auth` product).  
- Set **`PLAID_TOKEN_ENCRYPTION_KEY`** in production (32-byte base64 or 64 hex chars) so Plaid access tokens are not derived from JWT secrets.

### UI

- **Web:** Creator hub → Payouts → **Plaid** block (`PlaidPayoutLinkSection`), uses `react-plaid-link`.  
- **Mobile:** Creator hub → **Link bank (Plaid)** — Plaid Link in a **WebView** (behavior can vary; official Plaid RN SDK is an alternative for production hardening).

### Sandbox

Use [Plaid Sandbox](https://dashboard.plaid.com/overview/sandbox) credentials and `PLAID_ENV=sandbox`.
