# `shared/rewards`

TypeScript **types**, **central config defaults**, **runtime validation**, and **shape metadata** for Deenly Points + growth tuning. This package is the **single source of policy constants** consumed by Node earn/checkout code and by web/mobile clients.

- **Web:** import via `@deenly/rewards` (see `frontend/tsconfig.json`).
- **Mobile:** import via `@/lib/rewards` (re-export + Metro `watchFolders`).

## Rules engine (`rules/`)

Pure evaluation: earn pipeline, caps, redemption checks, reversal planner, anti-farming gates. Import `@deenly/rewards` / `@/lib/rewards` — symbols include `evaluateEarnPipeline`, `DEFAULT_REWARDS_RULES_CONFIG`, `mergeRewardsRulesConfig`.

Do not duplicate numeric policy in feature files — import from this package.

## Runtime behavior (Node)

Server-side enforcement (caps, ledger writes, webhooks) lives under **`backend/src/modules/rewards/`** — see [backend/src/modules/rewards/README.md](../../backend/src/modules/rewards/README.md) for what is wired vs deferred. Env toggles are parsed in `backend/src/config/env.js` (`REWARDS_*`, `REFERRALS_*`, trust thresholds).
