# `shared/rewards`

TypeScript-only **types**, **central config defaults**, **runtime validation**, and **shape metadata** for Deenly Rewards + growth tuning.

- **Web:** import via `@deenly/rewards` (see `frontend/tsconfig.json`).
- **Mobile:** import via `@/lib/rewards` (re-export + Metro `watchFolders`).

## Rules engine (`rules/`)

Pure evaluation: earn pipeline, caps, redemption checks, reversal planner, anti-farming gates. Import `@deenly/rewards` / `@/lib/rewards` — symbols include `evaluateEarnPipeline`, `DEFAULT_REWARDS_RULES_CONFIG`, `mergeRewardsRulesConfig`.

Do not duplicate numeric policy in feature files — import from this package.
