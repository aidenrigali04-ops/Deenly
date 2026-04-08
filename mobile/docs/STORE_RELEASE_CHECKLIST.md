# Mobile store release checklist

Use with [backend/RELEASE_CHECKLIST.md](../../backend/RELEASE_CHECKLIST.md) and [backend/LAUNCH_HARDENING_REPORT.md](../../backend/LAUNCH_HARDENING_REPORT.md).

## EAS Build

- [ ] `eas.json` has `preview` and `production` profiles for **iOS** and **Android** (validated by `npm run verify:release-gates` in CI).
- [ ] Version and build numbers bumped per store rules (`app.json` / `app.config`).
- [ ] `EXPO_PUBLIC_API_BASE_URL` points at production `https://…/api/v1`.
- [ ] `EXPO_PUBLIC_WEB_APP_URL` set to the live web origin (Terms/Privacy links in Settings).

## Quality gates

- [ ] `npm run typecheck` and `npm run lint` pass locally.
- [ ] `npm run test` passes.
- [ ] Smoke: login, feed, create post, notifications path, settings → data export (if applicable).

## Crash reporting

- [ ] Optional: set `EXPO_PUBLIC_SENTRY_DSN` and wire `initCrashReporting` in [mobile/src/lib/crash-reporting.ts](../src/lib/crash-reporting.ts) after installing your SDK.
- [ ] Confirm source maps / symbol upload if using Sentry (EAS + Sentry integration).

## Store listings

- [ ] App Store: description, screenshots, privacy policy URL (use deployed `/privacy`).
- [ ] Google Play: Data safety form aligned with [Privacy Policy](https://your-domain/privacy).
- [ ] Support URL and contact email.

## Phased rollout

- [ ] Start with **internal testing** / **TestFlight** / **Play internal track**.
- [ ] Expand to production with staged percentage or country rollout; watch backend `/ops/metrics` and crash dashboards.

## User readiness (product QA)

Before external testers or store review, run the flow checklist in [docs/USER_READINESS.md](../../docs/USER_READINESS.md) on critical paths (auth, feed, search, messages, checkout handoff). Track post-MVP work in [docs/PLATFORM_BACKLOG.md](../../docs/PLATFORM_BACKLOG.md).
