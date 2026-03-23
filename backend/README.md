# Deenly Backend (Railway + PostgreSQL)

Production-focused Node/Express backend for the Deenly Muslim social platform.

## Prerequisites

- Node.js 20+
- PostgreSQL (local or Railway service)

## Quick Start

1. Install dependencies:
   - `npm install`
2. Create local environment file:
   - `cp .env.example .env`
3. Set local values in `.env`:
   - `NODE_ENV=development`
   - `PORT=3000`
   - `DATABASE_URL=postgresql://...`
   - `DB_SSL_MODE=disable`
   - `CORS_ORIGINS=http://localhost:3000`
   - `JWT_ACCESS_SECRET=...`
   - `JWT_REFRESH_SECRET=...`
4. Run migrations:
   - `npm run migrate:up`
5. Start backend:
   - `npm run dev`

## Core Scripts

- `npm run dev`: run server with watch mode
- `npm start`: run production server
- `npm run lint`: static checks
- `npm test`: unit/integration tests
- `npm run migrate:create -- migration_name`: create migration
- `npm run migrate:up`: apply migrations
- `npm run migrate:down`: rollback last migration

## Health and Readiness

- `GET /health`: app liveness and DB configured flag
- `GET /health/db`: direct DB connectivity check
- `GET /ready`: readiness (returns 503 if DB is required but unavailable)

## API Surface (MVP)

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

### Profiles

- `GET /api/profiles/me` (auth)
- `PUT /api/profiles/me` (auth)
- `GET /api/profiles/:userId`

### Posts

- `POST /api/posts` (auth)
- `GET /api/posts/:postId`

### Interactions

- `POST /api/interactions` (auth)
- `GET /api/interactions/post/:postId`

### Follows

- `POST /api/follows/:userId` (auth)
- `DELETE /api/follows/:userId` (auth)

### Feed

- `GET /api/feed?limit=20&offset=0&postType=community`

## Railway Deployment

1. Connect GitHub repository in Railway.
2. Set backend service root directory to `backend`.
3. Add a Railway PostgreSQL service.
4. Configure backend service variables:
   - `NODE_ENV=production`
   - `PORT` (Railway injects automatically)
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `DB_SSL_MODE=no-verify`
   - `CORS_ORIGINS=https://your-web-domain.com,https://your-mobile-deeplink-domain.com`
   - `JWT_ACCESS_SECRET=<long-random-secret>`
   - `JWT_REFRESH_SECRET=<different-long-random-secret>`
   - `JWT_ACCESS_TTL=15m`
   - `JWT_REFRESH_TTL=30d`
   - `LOG_LEVEL=info`
   - `TRUST_PROXY=true`
5. Deploy service from `main`.
6. Run migrations against production database:
   - `npm run migrate:up`
7. Verify:
   - `/health`
   - `/health/db`
   - `/ready`

## CI/CD Guardrails

The GitHub Actions workflow runs:

- lint
- test
- migration syntax validation (bootstraps a PostgreSQL service and runs migrations)

Recommended branch protections for `main`:

- Require pull request before merging
- Require status checks to pass (`backend-ci`)
- Restrict direct pushes
- Require up-to-date branch before merge

## Staging and Production Rollout Order

1. Merge into `main` only through pull requests with `backend-ci` passing.
2. Deploy to staging Railway service first (same `backend` root, separate staging DB).
3. Run `npm run migrate:up` against staging database.
4. Smoke test staging endpoints (`/health`, `/health/db`, `/ready`, auth flows).
5. Promote same commit to production.
6. Run `npm run migrate:up` against production database before traffic verification.
7. Verify production endpoints and monitor logs/error rate for 10-15 minutes.

## Security Notes

- CORS is restricted by `CORS_ORIGINS` in production.
- Rate limiting and security headers are enabled globally.
- JWT secrets are required in production.
- Refresh tokens are hashed in database and rotated on refresh.
