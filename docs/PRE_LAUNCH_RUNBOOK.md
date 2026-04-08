# Pre-launch runbook (App Store + broader users)

Use this **in order** before external TestFlight groups or App Store submission. It ties together env, QA, and store work.

## 1. Environment and builds

1. **Production API** — `EXPO_PUBLIC_API_BASE_URL` is your live `https://…/api/v1` in EAS production (and matches Railway). See [mobile/eas.json](../mobile/eas.json).
2. **Web origin** — `EXPO_PUBLIC_WEB_APP_URL` matches deployed Terms/Privacy (Settings links). See [mobile/.env.example](../mobile/.env.example).
3. **Run quality gates** — From `mobile/`: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run verify:release-gates` (as applicable).

## 2. Product QA (flows)

Run the friction checklist in [USER_READINESS.md](./USER_READINESS.md) on:

- Sign up / log in → home feed  
- Create post (and marketplace path if you promote products)  
- Search → open profile / post  
- Messages → start chat (user ID **or** username lookup) → send  
- Purchase handoff (Stripe in browser) if you ship monetization  
- Settings → legal links open in browser  

Fix any **friction 3** on those paths before wide testing.

## 3. Store submission

Follow [mobile/docs/STORE_RELEASE_CHECKLIST.md](../mobile/docs/STORE_RELEASE_CHECKLIST.md): version/build numbers, screenshots, privacy policy URL, support URL, demo account for reviewers if login is required.

## 4. Observability (recommended before scale)

- Set `EXPO_PUBLIC_SENTRY_DSN` after installing `@sentry/react-native` and wiring [mobile/src/lib/crash-reporting.ts](../mobile/src/lib/crash-reporting.ts) per vendor docs.  
- Watch backend `/ops/metrics` and hosting dashboards after release.

## 5. Post-MVP (not blocking a first store build)

Track in [PLATFORM_BACKLOG.md](./PLATFORM_BACKLOG.md): message requests, staging environment, search polish, moderation at scale, etc.

## Related

- [USER_READINESS.md](./USER_READINESS.md) — detailed review algorithm.  
- [PLATFORM_BACKLOG.md](./PLATFORM_BACKLOG.md) — ordered backlog after MVP.
