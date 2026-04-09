#!/usr/bin/env bash
# Run the same flow as .github/workflows/backend-ci.yml on your machine:
# migrations up → full Jest (including integration when DATABASE_URL is set).
#
# DATABASE_URL must point at a *running* Postgres. Port 5433 is ONLY for the Docker
# example below; Homebrew / local installs almost always use 5432.
#
# If `npm run migrate:up` already works in this folder, reuse the SAME DATABASE_URL
# (see backend/.env). Do not use 5433 unless something is actually listening there.
#
# --- Postgres options ---
#
# A) Docker (port 5433 on the host → 5432 in the container):
#    docker run --rm -d --name deenly-ci-pg \
#      -e POSTGRES_DB=deenly_ci -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
#      -p 5433:5432 postgres:16
#    export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/deenly_ci'
#
# B) Homebrew (typical: port 5432, often no password for local user):
#    brew services start postgresql@16
#    createdb deenly_ci   # once
#    export DATABASE_URL='postgresql://YOUR_MAC_USERNAME@127.0.0.1:5432/deenly_ci'
#
# WARNING: integration tests TRUNCATE many tables. Use a disposable DB (e.g. deenly_ci),
# never production.
#
# Optional: run `npm run migrate:down` afterward to roll back one migration batch (CI does this).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "Use the same URI as backend/.env if migrations already work, e.g.:"
  echo "  export DATABASE_URL='postgresql://USER@127.0.0.1:5432/deenly_ci'"
  echo "Port 5433 only if you started Postgres via Docker with -p 5433:5432."
  exit 1
fi

export NODE_ENV="${NODE_ENV:-test}"
export DB_SSL_MODE="${DB_SSL_MODE:-disable}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000}"
export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-local-test-access}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-local-test-refresh}"

echo "==> checking Postgres connection"
if ! node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect()
  .then(() => c.end())
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
"; then
  echo ""
  echo "ERROR: Cannot connect with DATABASE_URL (refused / timeout / auth)."
  echo "  - ECONNREFUSED: wrong port (try 5432) or Postgres not running."
  echo "  - Match the URL you use for successful: npm run migrate:up"
  exit 1
fi

echo "==> migrate:up"
npm run migrate:up

echo "==> npm test (unit + integration)"
npm test

echo "Done. Integration tests run only when DATABASE_URL points at a migrated database."
