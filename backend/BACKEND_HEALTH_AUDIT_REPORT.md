# Backend Health Audit Report

Date: 2026-03-24

## Runtime Baseline (Production)

- `GET /health` -> 200 OK
- `GET /ready` -> 200 OK
- `GET /api/v1/feed?limit=5` -> 200 OK with populated payload
- `GET /api/v1/auth/session/me` without token -> 401 Authentication required
- `GET /ops/metrics` without token -> 401 Authentication required

Conclusion: service is up, database is reachable, feed path is healthy, protected endpoints enforce auth.

## Architecture/Auth/Feed Findings

1. **JWT fallback secret drift risk (fixed)**
   - Auth and feed token verification previously allowed `dev-*` fallback secrets.
   - Risk: inconsistent verification across environments and accidental acceptance/rejection behavior.
   - Fix: removed fallback usage in auth middleware/feed helper/auth service and require configured secrets.

2. **Users route auth config inconsistency (fixed)**
   - `users` router built auth middleware with a partial config fallback.
   - Risk: different token verification behavior compared to global app config.
   - Fix: route now always uses the injected app `config`.

3. **Ops metrics token parsing ergonomics (fixed)**
   - Script previously only checked generic missing message and did not normalize accidental `Bearer ` prefixes.
   - Risk: false negatives during CI secret setup and repeated operator errors.
   - Fix: script now trims env values, normalizes optional `Bearer ` prefix, and reports exact missing variable names.

## Schema/Migration Audit

Migration chain present and ordered:

1. `1730000000000_create_users_and_profiles.js`
2. `1730000001000_create_posts.js`
3. `1730000002000_create_interactions_and_follows.js`
4. `1730000003000_add_media_pipeline_fields.js`
5. `1730000004000_add_moderation_tables.js`
6. `1730000005000_add_analytics_events_table.js`
7. `1730000006000_add_feed_indexes_and_post_views.js`
8. `1730000007000_add_username_to_users.js`
9. `1730000008000_add_growth_program_tables.js`
10. `1730000009000_add_messages_and_search_indexes.js`

Recent migration risks (table drop order / duplicate indexes) were already addressed before this audit.

## Backtesting Hardening

Implemented:

- Added integration coverage for refresh/logout token lifecycle:
  - refresh succeeds with valid refresh token
  - logout revokes token
  - refresh fails with revoked token

- Strengthened integration DB cleanup:
  - explicitly truncates `conversations`, `messages`, and `conversation_participants` to avoid cross-test residue in message/search paths.

## Verification Steps

Run these to validate the remediation set:

- `cd backend && npm run lint`
- `cd backend && npm run test -- --runInBand`
- `cd backend && npm run migrate:up`
- Optional strict ops check:
  - set `OPS_METRICS_URL` and `OPS_METRICS_BEARER_TOKEN`
  - `cd backend && OPS_METRICS_STRICT=true npm run ops:check-metrics`

## Residual Risks / Follow-ups

- Admin router still applies auth/authorize both at mount and route-level (redundant, not broken).
- Feed optional-auth path still performs local token decode in route logic (now secret-consistent, but still duplicated logic path compared to middleware).
- Consider adding explicit API tests for `/api/v1/analytics/*` and admin table endpoints.
