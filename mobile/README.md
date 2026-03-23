# Deenly Mobile (Expo)

Production-oriented React Native mobile app for Deenly with parity-focused architecture aligned to web APIs.

## Stack

- Expo + React Native + TypeScript
- React Navigation (native stack + bottom tabs)
- TanStack Query
- Zustand
- AsyncStorage token/session persistence

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

## Scripts

- `npm run start`
- `npm run ios`
- `npm run android`
- `npm run web`
- `npm run typecheck`

## Implemented parity foundation

- Auth: login/signup + session bootstrap
- Feed: cursor pagination + detail navigation
- Create: text post creation
- Interactions: benefited/comment/report on post detail
- Reflect later: list flow
- Notifications inbox
- Profile + follow/unfollow + sessions + onboarding interests

## Next parity steps

- Signed media upload flow in mobile create screen
- Admin mobile surfaces (as needed by role)
- Offline queue/retry UX polish and push notifications
