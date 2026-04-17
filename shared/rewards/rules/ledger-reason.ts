import type { RewardEarnReasonKey } from "../types";
import type { EarnActionKey } from "./types";

/**
 * Maps rule earn actions → ledger / analytics `RewardEarnReasonKey` (stable taxonomy).
 */
export function earnActionToRewardEarnReasonKey(action: EarnActionKey): RewardEarnReasonKey {
  switch (action) {
    case "signup_complete":
      return "signup_complete";
    case "first_post_published":
      return "first_post_published";
    case "qualified_comment":
    case "qualified_reaction":
      return "qualified_engagement";
    case "referral_qualified":
      return "referral_qualified";
    case "purchase_completed":
      return "purchase_completed";
    case "daily_active_streak":
      return "daily_active_streak";
    case "admin_grant":
      return "admin_grant";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
