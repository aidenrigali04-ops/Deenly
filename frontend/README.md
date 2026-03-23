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
3. Run:
   - `npm run dev`

## Scripts

- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Implemented MVP Screens

- `/auth/login`
- `/auth/signup`
- `/feed` (cursor feed + filters)
- `/create` (post + signed upload + attach)
- `/posts/[id]` (detail + interactions + report)
- `/users/[id]` (profile + follow/unfollow)
