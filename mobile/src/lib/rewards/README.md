# Mobile rewards barrel

Re-exports [`shared/rewards`](../../../../shared/rewards) so app code uses `import { … } from "@/lib/rewards"` without duplicating constants.

Metro watches the repo `shared/` directory via `metro.config.js`.

**APIs:** `mobile/src/lib/rewards-api.ts` mirrors the web client for `GET /rewards/*`, `GET /referrals/*`, and referral code preview — same contracts as [docs/api-contracts.md](../../../../docs/api-contracts.md). Product checkout points redemption UI is not in this repo yet; reuse the monetization preview/apply contract when mobile checkout ships.
