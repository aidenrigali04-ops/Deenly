# Deenly Mobile (Expo)

Production-oriented React Native mobile app for Deenly with parity-focused architecture aligned to web APIs.

## Stack

- Expo + React Native + TypeScript
- React Navigation (native stack + bottom tabs)
- TanStack Query
- Zustand
- SecureStore + AsyncStorage token/session persistence fallback

## Setup

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
3. Set API base:
   - `EXPO_PUBLIC_API_BASE_URL`
4. Run app:
   - `npm run start`
   - `npm run ios` or `npm run android`

## Release scaffolding (iOS + Android)

- EAS profiles are defined in `eas.json` for both `preview` and `production`.
- Store and crash-reporting steps: [docs/STORE_RELEASE_CHECKLIST.md](docs/STORE_RELEASE_CHECKLIST.md).
- Ensure these env vars are set in EAS/CI:
  - `EXPO_PUBLIC_API_BASE_URL`
  - `EXPO_PUBLIC_WEB_APP_URL` (Terms/Privacy links in Settings)
  - `EXPO_PUBLIC_ADMIN_OWNER_EMAIL`
  - Optional: `EXPO_PUBLIC_SENTRY_DSN` after wiring [src/lib/crash-reporting.ts](src/lib/crash-reporting.ts)
- CI workflows:
  - `.github/workflows/mobile-ci.yml`
  - `.github/workflows/mobile-release-gates.yml`
  - `.github/workflows/mobile-e2e-smoke.yml`

## Scripts

- `npm run start`
- `npm run ios`
- `npm run android`
- `npm run web`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run test:e2e:smoke`
- `npm run doctor`
- `npm run verify:release-gates`

## Implemented parity foundation

- Auth: login/signup + session bootstrap
- Feed: cursor pagination + detail navigation
- Create: signed upload + media attach + post creation
- Interactions: benefited/comment/report on post detail
- Reflect later: list flow
- Notifications inbox
- Profile + follow/unfollow + sessions + onboarding interests
- Reliability: offline banner + queued critical mutation sync
- Admin/Beta/Support/Guidelines screens for parity coverage

## Next parity steps

- Native device E2E runner (Maestro/Detox) for UI automation
- Push notification delivery and background handling
