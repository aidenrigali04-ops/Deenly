# Post-MVP platform backlog

Ordered backlog for **user readiness** and production maturity. Each row can become its own issue/PR. Not tied to a single release.

## Product / UX

- Username or profile-based DM start (reduce reliance on numeric user ID).  
- Message requests / safety for unsolicited chats.  
- Search: debounced queries, recent searches, clearer zero-result guidance.  
- Marketplace: category/price filters when listing volume justifies them.  
- Optional: thread screen on stack (Messages) instead of inline scroll-only thread.

## Reliability

- Dedicated **staging** environment; document URLs in team wiki.  
- Run [backend/scripts/verify-deploy-env-parity.js](../backend/scripts/verify-deploy-env-parity.js) in CI or before releases; align `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` with production.

## Observability

- Set `EXPO_PUBLIC_SENTRY_DSN` and wire [mobile/src/lib/crash-reporting.ts](../mobile/src/lib/crash-reporting.ts) for production iOS/Android builds.  
- Backend: ensure `/ops/metrics` and logs are monitored for releases.  
- Funnel events (privacy-minimal): signup completed, first post, first message sent, checkout started/completed.

## Trust / safety

- App Store / Play **Data safety** and in-app privacy copy aligned with actual collection.  
- Consistent **report** / **block** entry points on UGC surfaces (posts, profiles, chat).  
- Moderation queue health checks if volume grows.

## Web parity

- Continue [UX_CLUTTER_REDUCTION_PLAN.md](./UX_CLUTTER_REDUCTION_PLAN.md) Phase 2–3 when mobile IA changes (account, nav, business entry points).

## References

- [USER_READINESS.md](./USER_READINESS.md) — review process.  
- [mobile/docs/STORE_RELEASE_CHECKLIST.md](../mobile/docs/STORE_RELEASE_CHECKLIST.md) — store submission.
