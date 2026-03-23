# Deenly Release Gates

This file defines measurable criteria for progressing releases across environments.

## Environment progression

1. Internal dogfood
2. Closed alpha
3. Private beta
4. Public soft launch

## Gate 1: Internal dogfood -> Closed alpha

- Uptime in staging >= 99% over 5 days.
- 0 unresolved P0/P1 backend defects.
- Auth integration tests pass in CI on every merge.
- Migration up/down checks pass in CI.
- Moderation queue endpoint is operational.

## Gate 2: Closed alpha -> Private beta

- Median API latency < 250ms for core routes (`/api/v1/feed`, `/api/v1/posts`, `/api/v1/auth/login`).
- Error rate < 1% for rolling 7 days.
- Report response SLA: first moderator action within 24h for >= 95% reports.
- Media upload signature success >= 99%.
- No unresolved security-critical findings.

## Gate 3: Private beta -> Public soft launch

- 14-day crash-free backend releases.
- End-to-end smoke checks pass after every deploy:
  - `/health`
  - `/health/db`
  - `/ready`
  - register/login/session-me
  - create-post/feed
- On-call runbook rehearsed with one rollback drill.
- Branch protection enabled on `main` with `backend-ci` required.

## Ongoing SLO monitoring

- Availability: 99.9% monthly target.
- p95 API latency: < 500ms.
- Moderation SLA: 24h first action target.
- Authentication abuse trend: monitor repeated failed attempts per IP/email.
