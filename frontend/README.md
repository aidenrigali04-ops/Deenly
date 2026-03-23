# Deenly Frontend (MVP-1)

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- TanStack Query
- Zustand

## Setup

1. Install:
   - `npm install`
2. Configure env:
   - `cp .env.example .env.local`
   - Set `NEXT_PUBLIC_API_BASE_URL`
   - Set `NEXT_PUBLIC_ADMIN_OWNER_EMAIL` to the only account allowed to see admin navigation
3. Run:
   - `npm run dev`

## Scripts

- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e`

## Implemented MVP Screens

- `/auth/login`
- `/auth/signup`
- `/feed` (cursor feed + filters)
- `/create` (post + signed upload + attach)
- `/posts/[id]` (detail + interactions + report)
- `/users/[id]` (profile + follow/unfollow)
- `/reflect-later` (saved reflections)
- `/onboarding` (interest selection)
- `/notifications` (in-app inbox)
- `/sessions` (session security controls)
- `/beta` (waitlist + invite redeem)
- `/support` (support ticket intake)
- `/admin` + `/admin/tables/[table]` (full backend table coverage)
- `/admin/analytics` (funnel/retention/feed-health dashboard)
- `/admin/moderation` + `/admin/operations` (warnings, restrictions, appeals, invites, support triage)
