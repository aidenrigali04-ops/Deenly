# Backend Release Checklist

Use this checklist for every production deploy.

## Pre-deploy

- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] `npm run migrate:up` ran successfully on staging.
- [ ] `backend/openapi.yaml` reviewed and updated for any `/api/v1` contract changes.
- [ ] No breaking change in frozen routes: `/api/v1/auth`, `/api/v1/users`, `/api/v1/posts`, `/api/v1/feed`, `/api/v1/interactions`, `/api/v1/reports`.
- [ ] `CORS_ORIGINS` includes deployed frontend origins.
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` set in production.

## Deploy

- [ ] Deploy backend revision.
- [ ] Run `npm run migrate:up` on production database.
- [ ] Run smoke checks:
  - [ ] `GET /health`
  - [ ] `GET /health/db`
  - [ ] `GET /ready`
  - [ ] signup/login/session
  - [ ] create post/feed load
  - [ ] **Events (when `EVENTS_FEATURE_ENABLED=true`)**: `GET /api/v1/events/near?lat=…&lng=…` returns 200 with `{ "items": [] }` or populated events; authenticated `POST /api/v1/events` only when `EVENTS_CREATE_ENABLED=true`; `GET /api/v1/feed` For You may include event cards when `EVENTS_READ_ENABLED=true` and ranking inserts allow.
  - [ ] **Monetization**: authenticated `GET /api/v1/monetization/purchases/me` returns 200; product checkout session creation returns 200/409 as expected for a test product (seller Connect state).
  - [ ] **Promoted boosts (when Stripe is configured)**: `POST /api/v1/ads/campaigns/:id/boost-checkout` returns a Checkout `url` for an owned, unfunded campaign; Stripe test webhook `checkout.session.completed` with `metadata.kind=ad_boost` updates `boost_funded_at` (see `docs/MONETIZATION_PROMOTED_AND_EVENTS.md`).
  - [ ] **AI assist (when `OPENAI_API_KEY` is set)**: authenticated `POST /api/v1/ai/assist/post-text` with `{ "draft": "hello", "intent": "polish" }` returns 200 and a suggestion; when key is unset, expect 503 (confirm clients degrade gracefully).
  - [ ] **Account data**: authenticated `GET /api/v1/users/me/data-export` returns 200 JSON; `DELETE /api/v1/users/me` with `{ "confirm": "DELETE" }` returns 204 on a throwaway test account only.

## Post-deploy

- [ ] `/ops/metrics` confirms no abnormal 5xx spike.
- [ ] p95 latency under release gate thresholds.
- [ ] Moderation queue and analytics dashboard respond.
- [ ] Rollback decision window closed (no P0/P1 found).
