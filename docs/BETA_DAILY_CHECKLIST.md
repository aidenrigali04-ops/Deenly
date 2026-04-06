# Private beta — daily checklist

Operational companion to [backend/PRIVATE_BETA_EXECUTION_PACK.md](../backend/PRIVATE_BETA_EXECUTION_PACK.md). Complete each day during the beta; keep notes in your incident or ops channel.

## Metrics (5 min)

- [ ] Activation funnel: signup → first follow → first post → first interaction (from `/admin/analytics` or analytics export)
- [ ] Retention: D1 / D7 cohorts if tracked
- [ ] Feed health: error rate on `GET /api/v1/feed`, anecdotal quality
- [ ] Moderation: open reports count; any older than 24h without first action?
- [ ] Support: open tickets / email; any older than 24h without first response?

## Triage labels (use in issue tracker)

- `core-loop` — auth, posting, feed, interactions reliability
- `safety` — moderation queue, abuse, restrictions
- `analytics` — dashboards, experiments, rollout guardrails

## Escalation

- **SEV2** if ≥10% of active beta users are impacted (per execution pack)

## Wave gates

- Wave 2 (+15 users): 3 consecutive healthy days after Wave 1
- Wave 3 (+15): moderation and support SLAs still met

## Links

- Release gates: [backend/RELEASE_GATES.md](../backend/RELEASE_GATES.md)
- On-call: [backend/ONCALL_RUNBOOK.md](../backend/ONCALL_RUNBOOK.md)
- Rollout analytics: `GET /api/v1/analytics/rollout-status` (authenticated admin/analytics surfaces)
