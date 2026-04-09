# Promoted posts and event boosts

## Catalog

- **Config:** `backend/src/config/boost-catalog.js` defines preset packages (labels, suggested budgets, impression caps).
- **API:** `GET /api/v1/ads/boost-catalog` returns `{ items: [...] }` (unauthenticated).
- **Campaigns:** `POST /api/v1/ads/campaigns` accepts optional `packageId` to default `budgetMinor` and `dailyCapImpressions` when omitted. Provide **exactly one** of `postId` or `eventId` (after migration `1730000038000_ad_campaigns_event_target`).

## Review and delivery

- New campaigns start as `draft` with `ad_creative_reviews.status = pending`. Moderators approve or reject before activation.
- Feed insertion uses `getSponsoredCampaign` in `backend/src/modules/feed/routes.js` (post-backed and, for **For You**, event-backed campaigns).
- Impression and click accounting: `POST /api/v1/ads/events/impression` and `POST /api/v1/ads/events/click` (authenticated).

## Money (Stripe prepay)

- **Column:** `ad_campaigns.boost_funded_at` (timestamptz, nullable). New rows start unfunded until Checkout completes.
- **Checkout:** `POST /api/v1/ads/campaigns/:id/boost-checkout` (owner) returns Stripe Checkout `url`. Session metadata uses `kind: ad_boost` and `adCampaignId`. Optional JSON body `{ "returnClient": "web" }` (default) uses `APP_BASE_URL` success/cancel pages; `{ "returnClient": "mobile_app" }` (alias `app`) uses native return URLs `deenly:///checkout/success` and `deenly:///checkout/cancel` so Stripe redirects back into the app.
- **Webhook:** On `checkout.session.completed`, when `metadata.kind === ad_boost`, the handler verifies amount, buyer, and campaign, sets `boost_funded_at`, and sets `status` to `active` only if creative review is already **approved** (otherwise stays `draft`).
- **Gates:** Creator `PATCH` to `active` requires approved review **and** `boost_funded_at`. Admin review approve / moderation approve only promotes `draft` → `active` when funded.
- **Return URLs:** Boost checkout uses `APP_BASE_URL` success/cancel URLs with `kind=ad_boost` and `campaign_id` so the web app can show contextual copy (`/checkout/success`, `/checkout/cancel`) and deep-link back to **Creator hub → Grow**.
- **Mobile:** `PromotePost` stack screen (`creator/promote` deep link when logged in) and `mobile/src/lib/ads.ts` — pick post + package, create draft, open Stripe in the in-app browser with `returnClient: mobile_app` so Stripe can redirect to `deenly:///checkout/success` or `/cancel`.
- **Grow UI (web + mobile):** Choose **Post** or **Scheduled event**; events load from `GET /events?hostUserId=…`. Event boosts default to package `event_highlight_7d` when switching targets.
- **Aggregate analytics:** `GET /api/v1/ads/campaigns/me/analytics-summary` (auth) returns `campaignCount`, `activeCampaigns`, `impressions`, `clicks` across all of the creator’s campaigns.
- **Deep links:** `/account/creator?tab=grow&promotePost=<id>` and `&promoteEvent=<id>` open Grow with the target pre-selected (query params are stripped after apply). Post and event detail pages show **Promote in feed** when the viewer is the author/host and `can_access_creator_hub`.
- **Notifications:** In-app (and optional Expo push when configured) types: `ad_boost_live`, `ad_boost_approve_pay`, `ad_boost_payment_received`, `ad_boost_rejected` — sent from admin creative approve/reject (and moderation ad actions) and from the Stripe `ad_boost` webhook after a successful fund. Respects the same prayer quiet-window suppression as other notifications. Duplicate `ad_boost_live` rows for the same campaign are suppressed within `AD_BOOST_LIVE_NOTIFY_DEDUPE_MINUTES` (default 3) so approve and payment handlers landing close together do not double-notify.

## Production hardening

- **Rate limits:** Authenticated `POST /ads/campaigns` and `POST /ads/campaigns/:id/boost-checkout` are limited per user (see `ADS_*_RATE_LIMIT_*` in `backend/.env.example`). Limits are disabled in `NODE_ENV=test`.
- **Admin moderation list:** `GET /admin/moderation/ads` includes `boost_funded_at`, `event_id`, and `currency` for triage. Raw table `GET /admin/tables/ad_campaigns` includes `boost_funded_at`.
- **Contract:** `backend/openapi.yaml` documents public ads endpoints used by web and mobile clients.
- **Mobile checkout:** Prefer in-app browser (`expo-web-browser`) for Stripe. Pass `returnClient: mobile_app` on boost-checkout so success/cancel open `BoostCheckoutReturn` via deep link (`deenly:///checkout/...`); the screen invalidates campaign queries and returns to **Promote in feed**.
- **Integration tests:** With `DATABASE_URL` set, `backend/test/integration/api.integration.test.js` exercises `POST /api/v1/monetization/webhooks/stripe` for `checkout.session.completed` + `metadata.kind === ad_boost` using Stripe’s `generateTestHeaderString` (no live Stripe calls). Default test config uses placeholder `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` unless overridden in the environment.

## Still to do for full production launch (outside this repo’s code)

- **Stripe live:** Live secret key, live webhook signing secret, Dashboard endpoint URL pointing at production API, Connect live onboarding, and reconciliation/alerts on failed webhooks.
- **Client builds:** EAS (or CI) production profiles for iOS/Android with `EXPO_PUBLIC_*` secrets; Next.js production deploy with `NEXT_PUBLIC_API_BASE_URL` and `APP_BASE_URL` aligned to real domains and CORS.
- **Optional product integrations:** Email (e.g. SendGrid) for boost receipts or rejections; push notification tuning. **Return-to-app** after mobile boost checkout is implemented via `returnClient: mobile_app` and `deenly:///checkout/…` (see above); universal links to `https` success URLs remain optional if you want the same flow from the system browser without the custom scheme.
- **Operations:** Runbook for moderation SLA, monitoring on ads webhook path and DB `webhook_events`, and periodic review of rate limits and catalog packages.

## Production fee

- Set `MONETIZATION_PLATFORM_FEE_BPS=500` (5%) in production for marketplace checkout; see `backend/.env.example`.
