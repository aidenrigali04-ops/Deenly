# UX / UI clutter reduction plan

This plan aligns web and mobile around clearer hierarchy, fewer equal-weight controls on one screen, and shared patterns. Execute in order; each phase should be shippable on its own.

## Goals

- **One primary focus per screen** (e.g. Profile = identity + content; not a link farm).
- **Progressive disclosure**: secondary destinations live under Settings / More, not repeated as many peer buttons.
- **Consistent IA** between web and mobile so users learn once.

## Phase 1 — Mobile: Settings hub (highest impact)

**Problem:** `ProfileScreen` exposes many `Pressable` rows of the same visual weight (Sessions, Logout, Creator, Dhikr, Quran, Salah, Beta, Support, Guidelines, admin ×4).

**Actions:**

1. Add a **Settings** stack screen (or tab entry) that mirrors web `account/settings` grouping:
   - **Account:** Sessions, Purchases (if applicable), Logout.
   - **Creator:** Creator economy, Instagram block (or link to existing flows).
   - **Deen tools:** Dhikr, Salah settings, Quran reader.
   - **Help & info:** Support, Guidelines, Beta.
2. **Profile tab:** keep header, posts grid, essential CTAs (Edit/setup, Add business), **one** row: “Settings” → navigates to hub.
3. **Admin:** replace four top-level buttons with one **Admin** row opening a sub-screen or list (moderation, operations, analytics, tables).

**Success:** Profile scroll length drops; scan path is obvious.

## Phase 2 — Web: tighten Account + nav

**Actions:**

1. **Account page:** group “Edit profile / Purchases / Creator” vs informational (stats, Deen strip). Consider moving “Purchases / Creator hub” into settings card if the hero feels crowded.
2. **Deen strip:** keep as a distinct card; avoid duplicating the same links in the rail elsewhere.
3. **Duplicate business entry points:** keep one **primary** CTA (“Add business”); treat modal and Search entry as **shortcuts** with shorter copy so it does not feel like three different features.

**Success:** Fewer competing primary buttons above the fold.

## Phase 3 — Shared components and copy

**Actions:**

1. Extract **settings section** primitive (title + list rows with chevron) on mobile; reuse for each group.
2. Centralize **onboarding option labels** (interests, intents, feed tab, app landing) in a small shared module or JSON consumed by web and mobile to avoid drift and repeated strings.
3. Align **Profile vs Settings** naming with web (“Setup & feed” / onboarding link in one place only on profile).

**Success:** Less duplicate UI code and inconsistent wording.

## Phase 4 — Polish and metrics

**Actions:**

1. Optional **analytics events** on Settings sections to see which links matter before removing anything contentious.
2. **Empty states** and **loading** unified (same components/patterns) to reduce visual noise during transitions.
3. **Accessibility pass:** heading order, touch targets, focus rings on web after consolidating buttons into lists.

## Out of scope (explicit)

- **Dhikr / Salah daily ticks** on web profile strip remain device-local by design unless product decides to sync to account (separate schema + API).

## References in repo

- Web account hub: `frontend/src/app/account/settings/page.tsx`, `frontend/src/app/account/page.tsx`
- Mobile profile clutter: `mobile/src/screens/app/ProfileScreen.tsx`
- App shell / nav: `frontend/src/components/app-shell.tsx`, `frontend/src/components/nav.tsx`

---

_Last updated: 2026-03-29_

## Implementation status

Phases 1–3 are implemented in the repo (mobile Settings + Admin hub, slimmer Profile, shared `shared/onboarding-options.ts`, web account/settings/personalizer cleanup, `metro.config.js` + `next.config` `externalDir` for shared imports). Phase 4 remains optional (analytics, deeper empty-state unification, full a11y audit).
