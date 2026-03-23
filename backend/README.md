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
- `npm test`: unit + integration tests
- `npm run migrate:create -- migration_name`: generate migration
- `npm run migrate:up`: apply pending migrations
- `npm run migrate:down`: rollback latest migration

## Health and Ops Endpoints

- `GET /health`
- `GET /health/db`
- `GET /ready`
- `GET /ops/metrics` (moderator/admin auth required)

## API Versioning

- Stable client routes are under `/api/v1/*`
- Legacy routes remain under `/api/*` for compatibility
- OpenAPI contract: [`openapi.yaml`](openapi.yaml)

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
- `GET /api/v1/feed?limit=20&offset=0&postType=community`

### Interactions and Follows

- `POST /api/v1/interactions` (auth)
- `GET /api/v1/interactions/post/:postId`
- `POST /api/v1/follows/:userId` (auth)
- `DELETE /api/v1/follows/:userId` (auth)

### Media Pipeline

- `POST /api/v1/media/upload-signature` (auth)
- `POST /api/v1/media/posts/:postId/attach` (auth)
- `POST /api/v1/media/processing/post/:postId` (internal token)

### Moderation and Trust

- `POST /api/v1/reports` (auth)
- `GET /api/v1/reports/queue?status=open` (moderator/admin)
- `POST /api/v1/reports/:reportId/actions` (moderator/admin)
- `POST /api/v1/safety/block/:userId` (auth)
- `DELETE /api/v1/safety/block/:userId` (auth)
- `POST /api/v1/safety/mute/:userId` (auth)
- `DELETE /api/v1/safety/mute/:userId` (auth)

## Railway Deployment and Rollback Runbook

1. Push validated commit to `main`.
2. Ensure Railway backend service points to `backend` root.
3. Confirm required production env vars (see `.env.example`):
   - `NODE_ENV=production`
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `DB_SSL_MODE=no-verify` (Railway managed cert mode)
   - JWT secrets, CORS, media settings
4. Deploy service.
5. Run `npm run migrate:up` against target DB.
6. Smoke test:
   - `/health`
   - `/health/db`
   - `/ready`
   - register/login/session-me
   - post create + feed read

Rollback policy:

- If deploy fails before migration: rollback service to previous image/revision.
- If migration causes issue: run `npm run migrate:down` once, redeploy previous good revision, and verify smoke checks.
- Never run multiple down migrations in production without data review.

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
