# Deenly schema notes

## Existing (reference only)

Document tables that already exist in `backend/migrations/` as the source of truth. Highlights relevant to planning:

- **`analytics_events`**: `event_name`, `payload` jsonb — growth funnel / client experiment events; **not** the rewards balance source of truth.
- **Monetization**: creator products, orders, `earnings_ledger`, etc. — **cash** semantics; keep separate from reward points naming.

## Rewards + Growth Engine (applied migrations)

Source of truth: `backend/migrations/*.js`.

| Table | Purpose |
| ----- | ------- |
| `reward_accounts` | One row per user; ledger sums derive balance. |
| `reward_ledger_entries` | Append-only earn/spend/reversal; idempotency per account. |
| `referral_codes` | One primary code per referrer (`referrer_user_id` unique), redemption cap. |
| `referral_attributions` | Referee ↔ code relationship; statuses include `pending_purchase`, `pending_clear`, `qualified`, `voided`, `expired`, etc. |
| `checkout_reward_redemptions` | Product checkout reward spend: Stripe session id, buyer, points spent, fiat discount, link to `reward_ledger_entries` spend row; `active` / `reversed`. |
| `reward_fraud_flags` | Typed fraud / risk queue for rewards (distinct from generic trust flags when a rewards FK is needed). |
| `rewards_admin_actions` | Append-only audit log for moderator/admin actions on rewards entities. |

**Rule:** Do not overload `analytics_events` for balances. Mirror events there only if dashboards need them.
