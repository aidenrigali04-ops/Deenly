# Deenly Backend (Railway + PostgreSQL)

Production-focused Node/Express backend for the Deenly Muslim social platform.

## Prerequisites

- Node.js 20+
- PostgreSQL (local or Railway)

## Quick Start

1. Install dependencies: `npm install`
2. Copy env file: `cp .env.example .env`
3. Set core env values (`DATABASE_URL`, JWT secrets, CORS origins)
4. Apply migrations: `npm run migrate:up`
5. Start server: `npm run dev`

## Core Scripts

- `npm run dev`: local development server
- `npm start`: production server
- `npm run lint`: lint source and tests
- `npm test`: unit + integration tests (integration runs only when `DATABASE_URL` is set; see below)
- `npm run test:integration:local`: migrations up + full test run (requires `DATABASE_URL`; script: [`scripts/run-integration-local.sh`](scripts/run-integration-local.sh))
- Manual QA after deploy: [`docs/SMOKE_TEST_CHECKLIST.md`](../docs/SMOKE_TEST_CHECKLIST.md) (repo root)
- `npm run migrate:create -- migration_name`: generate migration
- `npm run migrate:up`: apply pending migrations
- `npm run migrate:down`: rollback latest migration

## Health and Ops Endpoints

- `GET /health`
- `GET /health/db`
- `GET /ready`
- `GET /ops/metrics` (moderator/admin auth required) — includes `requestErrorRate` (all paths with status ≥500), `apiRequestErrorRate` (only `/api` traffic, excludes `/ready`/`/health` noise), and `p95Ms`

## API Versioning

- Stable client routes are under `/api/v1/*`
- Legacy routes remain under `/api/*` for compatibility
- OpenAPI contract: [`openapi.yaml`](openapi.yaml)
- Frozen route groups for frontend compatibility:
  - `/api/v1/auth`
  - `/api/v1/users`
  - `/api/v1/posts`
  - `/api/v1/feed`
  - `/api/v1/interactions`
  - `/api/v1/reports`

## API Deprecation Policy

- `/api/v1/*` is backward-compatible by default.
- Breaking changes require:
  - a new versioned route group,
  - changelog entry in this README,
  - migration guidance for frontend clients.
- Deprecated fields or endpoints must stay available for at least one release cycle.

## Changelog

- 2026-03: Added post-MVP program foundations (admin table views, notifications, interests, support and beta flows, moderation warning/restriction/appeal lifecycle).

## API Surface (MVP + Safety + Media)

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/session/me`

### Profiles

- `GET /api/v1/profiles/me` (auth)
- `PUT /api/v1/profiles/me` (auth)
- `GET /api/v1/profiles/:userId`
- `GET /api/v1/profiles?search=&limit=&offset=`

### Posts and Feed

- `POST /api/v1/posts` (auth)
- `GET /api/v1/posts/:postId`
- `GET /api/v1/posts?postType=&authorId=&limit=&offset=`
- `GET /api/v1/feed?limit=20&feedTab=for_you&postType=post`

### Interactions and Follows

- `POST /api/v1/interactions` (auth)
- `GET /api/v1/interactions/post/:postId`
- `GET /api/v1/interactions/me?type=reflect_later` (auth)
- `POST /api/v1/follows/:userId` (auth)
- `DELETE /api/v1/follows/:userId` (auth)
- `GET /api/v1/follows/:userId/followers`
- `GET /api/v1/follows/:userId/following`

### Media Pipeline

- `POST /api/v1/media/upload-signature` (auth)
- `POST /api/v1/media/posts/:postId/attach` (auth)
- `POST /api/v1/media/processing/post/:postId` (internal token)

### Moderation and Trust

- `POST /api/v1/reports` (auth)
- `GET /api/v1/reports/queue?status=open` (moderator/admin)
- `POST /api/v1/reports/:reportId/actions` (moderator/admin)
- `GET /api/v1/reports/:reportId/actions` (moderator/admin)
- `POST /api/v1/reports/appeals` (auth)
- `POST /api/v1/safety/block/:userId` (auth)
- `DELETE /api/v1/safety/block/:userId` (auth)
- `POST /api/v1/safety/mute/:userId` (auth)
- `DELETE /api/v1/safety/mute/:userId` (auth)

### Notifications, Sessions, Beta, and Support

- `GET /api/v1/notifications` (auth)
- `POST /api/v1/notifications/:notificationId/read` (auth)
- `GET /api/v1/users/me/interests` (auth)
- `PUT /api/v1/users/me/interests` (auth)
- `GET /api/v1/users/me/sessions` (auth)
- `POST /api/v1/users/me/sessions/:sessionId/revoke` (auth)
- `POST /api/v1/beta/waitlist`
- `POST /api/v1/beta/invite/redeem` (auth)
- `POST /api/v1/support/tickets`
- `GET /api/v1/support/my-tickets` (auth)

### Events (feature-flagged; see `EVENTS_*` in `.env.example` and `RELEASE_GATES.md`)

- `GET /api/v1/events/near` — geo discovery (optional auth for RSVP-aware fields)
- `GET /api/v1/events`, `POST /api/v1/events` (auth), `GET/PATCH /api/v1/events/:id`
- `POST /api/v1/events/:id/rsvp`, `GET /api/v1/events/:id/rsvp/me`, host `DELETE /api/v1/events/:id/rsvps/:userId`
- `GET/POST /api/v1/events/:id/chat` and moderation routes under `/api/v1/events/:id/chat/*` when chat is enabled

### Creator analytics (auth)

- `GET /api/v1/creator/analytics/overview` — optional `creatorUserId` (defaults to self; moderators/admins may query others)
- `GET /api/v1/creator/analytics/conversion`
- `GET /api/v1/creator/analytics/seller-boosts/summary`
- `GET /api/v1/creator/analytics/seller-boosts`
- `GET /api/v1/creator/analytics/seller-boosts/:purchaseId`

### Admin Console APIs (moderator/admin)

- `GET /api/v1/admin/tables/:table` (full DB table coverage)
- `POST /api/v1/admin/warnings`
- `POST /api/v1/admin/restrictions`
- `POST /api/v1/admin/appeals/:appealId/review`
- `POST /api/v1/admin/invites`
- `POST /api/v1/admin/support/:ticketId`
- Deenly Rewards ops (also requires `ADMIN_OWNER_EMAIL` on `/api/v1/admin/*`):
  - `GET /api/v1/admin/rewards/ledger-entries`, `GET /api/v1/admin/rewards/ledger-entries/:id`
  - `GET /api/v1/admin/rewards/referrals/queue`, `GET /api/v1/admin/rewards/referrals/attributions/:id`, `POST /api/v1/admin/rewards/referrals/attributions/:id/review`
  - `GET /api/v1/admin/rewards/fraud-flags`, `GET /api/v1/admin/rewards/redemptions`
- **Moderator/admin team mirror** (same contracts, **no** `ADMIN_OWNER_EMAIL` requirement): `GET` (and `POST` where applicable) under `/api/v1/monetization/admin/rewards/*` — e.g. `/api/v1/monetization/admin/rewards/ledger-entries`, `/api/v1/monetization/admin/rewards/fraud-flags`, etc.

## Railway Deployment and Rollback Runbook

1. Push validated commit to `main`.
2. Ensure Railway backend service points to `backend` root.
3. Confirm required production env vars (see `.env.example`):
   - `NODE_ENV=production`
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `DB_SSL_MODE=no-verify` (Railway managed cert mode)
   - JWT secrets, CORS, media settings
   - `ADMIN_OWNER_EMAIL` set to the only account allowed on `/api/v1/admin/*` (use `/api/v1/monetization/admin/rewards/*` for moderator/admin rewards tooling without the owner email)
4. Deploy service.
5. Run `npm run migrate:up` against target DB.
6. Smoke test:
   - `/health`
   - `/health/db`
   - `/ready`
   - register/login/session-me
   - post create + feed read
   - events near/list (if enabled)

Rollback policy:

- If deploy fails before migration: rollback service to previous image/revision.
- If migration causes issue: run `npm run migrate:down` once, redeploy previous good revision, and verify smoke checks.
- Never run multiple down migrations in production without data review.
- Follow [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) before and after every production release.

## CI/CD Guardrails

The `backend-ci` workflow validates:

- lint
- migrations up
- tests (including real DB integration tests)
- migrations down

Recommended protections for `main`:

- PR required
- `backend-ci` required
- no direct push
- branch up-to-date before merge

## Release Gates

Measurable launch criteria are defined in [`RELEASE_GATES.md`](RELEASE_GATES.md).

## Launch Hardening Artifacts

- Weekly verification log: [`LAUNCH_HARDENING_REPORT.md`](LAUNCH_HARDENING_REPORT.md)
- On-call response path: [`ONCALL_RUNBOOK.md`](ONCALL_RUNBOOK.md)
- Incident report template: [`INCIDENT_TEMPLATE.md`](INCIDENT_TEMPLATE.md)
- Private beta execution + next-phase entry criteria: [`PRIVATE_BETA_EXECUTION_PACK.md`](PRIVATE_BETA_EXECUTION_PACK.md)

## Hardening Workflows

- `backend-ci` for lint/migrations/tests and env contract checks.
- `frontend-ci` + `frontend-e2e` for web quality gates.
- `deploy-env-parity-check` for Railway/Vercel env parity before release.
- `load-tests` for baseline and authenticated load scenarios.
- `ops-metrics-alert-check` for scheduled latency/error-rate monitoring.
