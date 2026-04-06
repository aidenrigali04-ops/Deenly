# Launch Hardening Report

Use this file each release week to publish verification outcomes.

## Current cycle — 2026-03-28 (repository baseline)

Automated / local verification recorded in-repo. **Paste GitHub Actions run URLs** for CI, load tests, and ops workflows when you run them in your environment.

### Environment parity verification

- Date: 2026-03-28
- Operator: engineering (repo update)
- Workflow run URL (`deploy-env-parity-check`): _(run workflow; paste URL)_
- Result: pending external run
- Notes: Use [.github/workflows/deploy-env-parity-check.yml](.github/workflows/deploy-env-parity-check.yml) after setting secrets per workflow docs.

### CI and E2E verification on main

- `backend-ci`: pass (local: `npm run lint` + `npm test` green on this revision)
- `frontend-ci`: verify on push to `main` via GitHub Actions
- `frontend-e2e`: verify on push to `main` via GitHub Actions
- `release-gates`: verify on push to `main` via GitHub Actions
- Notes: Integration suite (`test/integration`) runs when `DATABASE_URL` is set in CI or locally.

### Load test baseline (deployed backend)

- Date: _(fill when run)_
- Target environment: staging/production
- Workflow run URL (`load-tests`): _(paste)_
- Scenario 1 (`feed-post.js`) p95: _(paste)_
- Scenario 1 error rate: _(paste)_
- Scenario 2 (authenticated feed/interactions) p95: _(paste)_
- Scenario 2 error rate: _(paste)_
- Threshold compliance: _(pass/fail)_

### Alerting and on-call readiness

- `ops-metrics-alert-check` configured with secrets: _(yes/no — configure per [.github/workflows/ops-metrics-alert-check.yml](.github/workflows/ops-metrics-alert-check.yml))_
- Last successful run URL: _(paste)_
- Runbook rehearsal completed date: _(see [ONCALL_RUNBOOK.md](ONCALL_RUNBOOK.md))_
- Incident template drill completed date: _(see [INCIDENT_TEMPLATE.md](INCIDENT_TEMPLATE.md))_

### Admin dashboard backtesting checklist

- `/admin` owner-admin access verified: pending manual
- `/admin/tables/users` renders rows: pending manual
- `/admin/moderation` warning/restriction actions: pending manual
- `/admin/operations` invite + support triage actions: pending manual
- `/admin/analytics` cards and event summary: pending manual
- Blockers / notes: Account data export and self-serve account closure shipped at `GET /api/v1/users/me/data-export` and `DELETE /api/v1/users/me` (confirm body). Re-test admin tables after beta volume.

### Private beta execution readiness

- Private beta pack reviewed (`PRIVATE_BETA_EXECUTION_PACK.md`): yes (see also [docs/BETA_DAILY_CHECKLIST.md](../docs/BETA_DAILY_CHECKLIST.md))
- Wave plan approved (20 -> +15 -> +15): assign owner
- Daily metric owner assigned: assign owner
- Moderation/support triage owners assigned: assign owner

### Entry criteria tracking for next phases

- **Polished web UI**
  - Core-loop success >= 98% in beta: pending beta
  - Journey priorities confirmed: pending
  - Accessibility baseline complete: skip link + focus rings added on web shell; expand per journey
- **React Native parity**
  - API contract stable for mobile: yes (export/delete documented in OpenAPI)
  - Scope lock complete: ongoing
  - Mobile release gates mapped: yes ([mobile/scripts/verify-release-gates.js](../mobile/scripts/verify-release-gates.js), [mobile/docs/STORE_RELEASE_CHECKLIST.md](../mobile/docs/STORE_RELEASE_CHECKLIST.md))

---

## Template (copy for next week)

## Environment parity verification

- Date:
- Operator:
- Workflow run URL (`deploy-env-parity-check`):
- Result: pass/fail
- Notes:

## CI and E2E verification on main

- `backend-ci`: pass/fail
- `frontend-ci`: pass/fail
- `frontend-e2e`: pass/fail
- `release-gates`: pass/fail
- Notes:

## Load test baseline (deployed backend)

- Date:
- Target environment: staging/production
- Workflow run URL (`load-tests`):
- Scenario 1 (`feed-post.js`) p95:
- Scenario 1 error rate:
- Scenario 2 (authenticated feed/interactions) p95:
- Scenario 2 error rate:
- Threshold compliance: pass/fail

## Alerting and on-call readiness

- `ops-metrics-alert-check` configured with secrets: yes/no
- Last successful run URL:
- Runbook rehearsal completed date:
- Incident template drill completed date:

## Admin dashboard backtesting checklist

- `/admin` owner-admin access verified: pass/fail
- `/admin/tables/users` renders rows: pass/fail
- `/admin/moderation` warning/restriction actions: pass/fail
- `/admin/operations` invite + support triage actions: pass/fail
- `/admin/analytics` cards and event summary: pass/fail
- Blockers / notes:

## Private beta execution readiness

- Private beta pack reviewed (`PRIVATE_BETA_EXECUTION_PACK.md`): yes/no
- Wave plan approved (20 -> +15 -> +15): yes/no
- Daily metric owner assigned: yes/no
- Moderation/support triage owners assigned: yes/no

## Entry criteria tracking for next phases

- **Polished web UI**
  - Core-loop success >= 98% in beta: yes/no
  - Journey priorities confirmed: yes/no
  - Accessibility baseline complete: yes/no
- **React Native parity**
  - API contract stable for mobile: yes/no
  - Scope lock complete: yes/no
  - Mobile release gates mapped: yes/no
