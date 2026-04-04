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
- On-call runbook rehearsed with one rollback drill (see `ONCALL_RUNBOOK.md`).
- Branch protection enabled on `main` with `backend-ci` required.

## Events: MVP → full production

`EVENTS_FEATURE_ENABLED` is the master switch; `EVENTS_READ_ENABLED`, `EVENTS_CREATE_ENABLED`, and `EVENTS_CHAT_ENABLED` gate discovery, host creation/edits, and chat surfaces independently. When any dependent flag is off, affected routes return **404** (intentional hide, not a client bug). `ROLLOUT_STAGE` and `ROLLOUT_COHORT_PERCENT` drive **analytics** experiment guardrails (`GET /analytics/rollout-status`); they do **not** replace the `EVENTS_*` toggles.

**Recommended progression**

1. Ship DB migrations; keep `EVENTS_READ_ENABLED=true`, `EVENTS_CREATE_ENABLED=false`, `EVENTS_CHAT_ENABLED=false` until hosts are trained and moderation is ready.
2. Enable `EVENTS_CREATE_ENABLED` for a pilot cohort; monitor RSVPs, cancellations, and report volume.
3. Enable `EVENTS_CHAT_ENABLED`; confirm `EVENTS_CHAT_GRACE_HOURS` matches product policy.
4. Tune feed surfacing with `FEED_EVENT_INSERT_EVERY` and `FEED_EVENT_CANDIDATES_LIMIT` so For You is not oversaturated.

**Gate criteria before “full” events**

- Event list/near/detail and RSVP flows pass smoke checks in staging and production (see `RELEASE_CHECKLIST.md`).
- No sustained 5xx on `/api/v1/events/*` after deploy; chat moderation endpoints behave when `event_chat_*` tables exist (otherwise fallback path is documented in code).
- If using growth experiments, `GET /analytics/rollout-status` shows no guardrail breach for 24h before expanding `ROLLOUT_COHORT_PERCENT` or advancing `ROLLOUT_STAGE`.

## Ongoing SLO monitoring

- Availability: 99.9% monthly target.
- p95 API latency: < 500ms.
- Moderation SLA: 24h first action target.
- Authentication abuse trend: monitor repeated failed attempts per IP/email.
- Incident documentation must use `INCIDENT_TEMPLATE.md`.
