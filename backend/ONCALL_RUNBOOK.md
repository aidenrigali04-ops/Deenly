# Deenly On-Call Runbook

This runbook defines the minimum response path for launch hardening and private beta.

## On-call rotation

- Primary: Engineering owner (weekly)
- Secondary: Backup engineer (weekly)
- Moderator liaison: moderation/admin owner for trust-and-safety incidents

## Alert sources

- Scheduled GitHub workflow: `ops-metrics-alert-check`
- Platform uptime alerts (Railway/Vercel)
- Manual post-deploy checks from `RELEASE_CHECKLIST.md`

## Severity levels

- **SEV1**: full outage, auth unavailable, data corruption risk
- **SEV2**: elevated 5xx or severe latency degradation affecting core flows
- **SEV3**: partial feature degradation with workarounds

## First 15 minutes playbook

1. Acknowledge the incident and open a response thread.
2. Capture timestamp, impacted services, and initial blast radius.
3. Check:
   - `/health`
   - `/health/db`
   - `/ready`
   - `/ops/metrics`
4. Decide immediate action:
   - rollback deploy
   - disable non-critical feature path
   - restart service
5. Post first status update.

## Escalation and communication

- Escalate SEV1/SEV2 immediately to secondary on-call and product owner.
- For moderation incidents, page moderator liaison.
- Post updates every 15 minutes until mitigation.

## Closure checklist

- Confirm recovery and verify core loop: signup/login, create post, feed, interact/report.
- Record root cause and timeline in incident template.
- Create follow-up tasks with owners and deadlines.
