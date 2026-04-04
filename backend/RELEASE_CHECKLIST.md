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

## Post-deploy

- [ ] `/ops/metrics` confirms no abnormal 5xx spike.
- [ ] p95 latency under release gate thresholds.
- [ ] Moderation queue and analytics dashboard respond.
- [ ] Rollback decision window closed (no P0/P1 found).
