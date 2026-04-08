# User readiness review

Use this before TestFlight/App Store cuts and after major flows change. Complements [mobile/docs/STORE_RELEASE_CHECKLIST.md](../mobile/docs/STORE_RELEASE_CHECKLIST.md) and [UX_CLUTTER_REDUCTION_PLAN.md](./UX_CLUTTER_REDUCTION_PLAN.md).

## Release loop (full flow)

1. **Actor** — Who is this for? (new user, creator, buyer, moderator.)
2. **Job** — What should they complete in one session? (One sentence.)
3. **Success** — What observable outcome means “done”? (e.g. message sent, checkout opened, post published.)
4. **Steps** — List 5–15 steps from app open to success. Do not skip “obvious” taps.
5. **Friction score (per step)**  
   - **0** — Automatic or invisible  
   - **1** — One clear action  
   - **2** — Hesitation (unclear label, hidden control, jargon)  
   - **3** — Blocker (error, dead end, no feedback)
6. **Rules** — Any step **≥2** needs a ticket; **3** on pay, messaging, or safety is **P0** before release.
7. **Empty / loading / error** — First-time empty states: explanation + **one** primary next action. Loading: bounded wait or cancel. Errors: human copy + **Retry** or fix path.
8. **Permissions** — Explain **why** before the system prompt; handle denial with a fallback.
9. **Analytics (minimal)** — Optional funnel counts on critical steps (signup → first post → first message → checkout). Avoid PII in event payloads.
10. **Go / no-go** — P0 cleared; no friction-3 on critical paths; privacy copy matches actual behavior.

## Micro-audit (small UI changes)

For a single control, row, or screen corner, check:

| Lens | Question |
|------|------------|
| Discoverability | Would a first-timer find it without help? |
| Affordance | Does it read as tappable or editable? |
| Feedback | Press → loading / success / error / haptic? |
| Copy | Verbs for actions; no internal IDs exposed? |
| Consistency | Same pattern as similar screens? |
| Accessibility | ≥44pt targets; `accessibilityLabel` where needed? |
| Performance | Jank, double-submit, stale lists? |
| Safety | Spam, confusion, or data leak risk? |

Score the **interaction** 0–3 the same way as release steps.

## Prioritization

**Score** = `(Impact × Severity) / Effort`  

- **Impact** (1–5): Share of users who hit this on a critical path.  
- **Severity** (1–5): Friction score or blocker weight.  
- **Effort** (1–5): Higher = more work.

Sort descending. Use for small polish so it competes fairly with large features.

## Cadence

- **Weekly** — One critical path + one tab or settings area.  
- **Pre–TestFlight** — Full pass on signup, feed, search, messages, pay handoff, settings.  
- **Per PR (UI)** — Micro-audit only surfaces touched by the diff.

## Deenly-specific critical paths (examples)

- Auth: welcome → login/signup → home feed visible.  
- Create: tab → post or product → success state.  
- Marketplace: tab → scroll → buy → Stripe in browser → return.  
- Messages: new chat by ID → send → inbox updates.  
- Search: query → open profile or post.  
- Settings: export / privacy links load.

## Related docs

- [mobile/docs/STORE_RELEASE_CHECKLIST.md](../mobile/docs/STORE_RELEASE_CHECKLIST.md) — builds, env, store listings.  
- [UX_CLUTTER_REDUCTION_PLAN.md](./UX_CLUTTER_REDUCTION_PLAN.md) — IA and clutter.  
- Post-MVP execution items: [PLATFORM_BACKLOG.md](./PLATFORM_BACKLOG.md).
