# Private Beta Execution Pack

This pack defines how to run a safe 20-50 user beta after launch hardening.

## Entry Criteria

- Week-1 hardening checks are complete:
  - Railway/Vercel env parity verified
  - CI + E2E green on `main`
  - Load-test baseline recorded
  - Alerting + on-call minimums active
- Admin dashboard backtesting is complete for owner-admin account.
- No unresolved P0/P1 defects in core loop (`auth`, `posting`, `feed`, `interactions`).

## Rollout Waves

1. Wave 1: 20 invited users
2. Wave 2: +15 users only if metrics are healthy for 3 consecutive days
3. Wave 3: +15 users only if moderation/support SLAs remain healthy

## Daily Beta Review

- Activation funnel: `signup -> first follow -> first post -> first interaction`
- Retention: D1 and D7
- Feed health: average watch time, completion rate, interaction quality
- Moderation: first action within 24 hours
- Support: first response within 24 hours

## Triage Rules

- Label `core-loop`: auth/posting/feed/interactions reliability issues
- Label `safety`: moderation queue and abuse-response issues
- Label `analytics`: dashboard/data correctness issues
- Escalate as SEV2 if >=10% beta users are impacted

## Exit Criteria To Polished Web UI

- Core-loop success rate >= 98% during beta
- Top-traffic journeys validated by feedback:
  - `feed`
  - `posts/[id]`
  - `create`
  - `notifications`
  - `admin/moderation`
- Accessibility baseline complete (focus visibility, keyboard nav, contrast)

## Entry Criteria To React Native Parity Phase

- `/api/v1` contract stable and documented
- Mobile scope locked for parity:
  - auth/session
  - feed
  - create
  - post detail
  - notifications
- Mobile release and observability gates mapped to web standards
