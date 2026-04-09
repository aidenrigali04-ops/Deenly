# Manual smoke checklist (backend → web → mobile)

Use after **migrations** are applied and **API / web / mobile** env vars match your environment (see `backend/.env.example`, `frontend` and `mobile` env docs).

## Automated gate (local, matches CI)

1. Start PostgreSQL 16 with database `deenly_ci` (see `backend/scripts/run-integration-local.sh` for Docker or Homebrew hints).
2. `export DATABASE_URL=...` must match a **running** server. Port **5433** is only for the Docker `-p 5433:5432` example; local Homebrew Postgres is usually **5432**. Reuse the same `DATABASE_URL` as `backend/.env` if `npm run migrate:up` already works.
3. From `backend/`: `./scripts/run-integration-local.sh`  
   - Expect: migrations apply, **all Jest suites pass** (integration runs when `DATABASE_URL` is set).

## Backend (running API)

- `GET /health` and `GET /health/db` return OK.
- Register → login → `GET /api/v1/auth/session/me` with bearer token.
- `GET /api/v1/feed?limit=5&feedTab=for_you` (authenticated) returns items without 500.
- `GET /api/v1/ads/boost-catalog` returns `{ items: [...] }` (no auth).
- If you use push: `EXPO_ACCESS_TOKEN` set → `POST /api/v1/notifications/push/devices` with valid Expo token returns 201 (otherwise 503 is expected when not configured).

## Web (Next.js)

- Home loads, feed renders; **Explore** nav goes to `/search`.
- Open a post → **Share** (native share or clipboard message).
- Report form shows moderation copy; submit still works when signed in.
- If a **sponsored event** slot is active in feed (rare in dev): card links to `/events/[id]`.

## Mobile (Expo)

- Cold start → session restores or auth flow works.
- After login, device/simulator with **physical device + permissions**: push registration runs (no crash); 503 from API if push not configured is OK.
- **Explore** screen opens from home; post detail **Share** opens system sheet.
- Home feed: normal posts + optional **event** promo card opens event detail.

## Ads / monetization (optional dev paths)

- Create campaign with `postId` **or** `eventId` (host must own event); requires DB migration for `event_id` on `ad_campaigns`.
- Moderation approves creative → campaign can be set `active` per existing admin/mod flows.

## Known gaps (not covered by smoke above)

- Stripe checkout and boost **prepay** (planned; not required for this checklist).
- Full E2E in browser/device automation (run separately if you add Playwright / Detox).
