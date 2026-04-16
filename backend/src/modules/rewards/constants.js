/* eslint-disable camelcase */

/**
 * Reward engine domain constants.
 *
 * Every array here matches the CHECK constraints in the migration files exactly.
 * If you change a value here, you MUST also create a migration to update the
 * database constraint. These are frozen — no runtime mutation.
 */

const TIERS = Object.freeze(["explorer", "member", "insider", "vip", "elite"]);

const TIER_ORDER = Object.freeze({
  explorer: 0,
  member: 1,
  insider: 2,
  vip: 3,
  elite: 4
});

const LEDGER_TYPES = Object.freeze(["credit", "debit"]);

const LEDGER_CREDIT_SOURCES = Object.freeze([
  "purchase",
  "referral_earned",
  "referral_bonus",
  "streak_bonus",
  "challenge_reward",
  "tier_bonus",
  "manual_credit",
  "signup_bonus",
  "review"
]);

const LEDGER_DEBIT_SOURCES = Object.freeze([
  "redemption",
  "expiration",
  "manual_debit",
  "fraud_void",
  "refund_clawback"
]);

const LEDGER_SOURCES = Object.freeze([
  ...LEDGER_CREDIT_SOURCES,
  ...LEDGER_DEBIT_SOURCES
]);

const REFERRAL_STATUSES = Object.freeze([
  "pending",
  "qualified",
  "rewarded",
  "rejected",
  "expired"
]);

const REFERRAL_REWARD_TYPES = Object.freeze([
  "referrer_points",
  "referee_discount"
]);

const REFERRAL_REWARD_STATUSES = Object.freeze([
  "held",
  "released",
  "forfeited"
]);

const REFERRAL_EVENT_TYPES = Object.freeze([
  "code_used",
  "signup_completed",
  "first_purchase",
  "qualified",
  "hold_started",
  "hold_extended",
  "reward_released",
  "reward_forfeited",
  "fraud_flagged",
  "fraud_cleared",
  "rejected"
]);

const CHALLENGE_TYPES = Object.freeze([
  "daily",
  "weekly",
  "monthly",
  "merchant",
  "special"
]);

const CHALLENGE_CATEGORIES = Object.freeze([
  "general",
  "purchase",
  "social",
  "streak",
  "exploration",
  "merchant"
]);

const CHALLENGE_STATUSES = Object.freeze([
  "active",
  "completed",
  "claimed",
  "expired",
  "abandoned"
]);

const BOOST_TYPES = Object.freeze(["standard", "premium", "featured"]);

const BOOST_STATUSES = Object.freeze([
  "active",
  "paused",
  "exhausted",
  "cancelled",
  "expired"
]);

const BOOST_MULTIPLIERS = Object.freeze({
  standard: 1.5,
  premium: 2.0,
  featured: 3.0
});

const BOOST_MIN_BUDGETS = Object.freeze({
  standard: 500,
  premium: 1500,
  featured: 5000
});

const TRUST_BANDS = Object.freeze([
  "critical",
  "low",
  "new",
  "good",
  "excellent"
]);

const FRAUD_FLAG_TYPES = Object.freeze([
  "velocity_breach",
  "daily_cap_breach",
  "duplicate_transaction",
  "self_referral",
  "device_overlap",
  "ip_overlap",
  "referral_farming",
  "refund_abuse",
  "account_sharing",
  "suspicious_pattern",
  "manual_flag",
  "trust_score_drop"
]);

const FRAUD_SEVERITIES = Object.freeze(["low", "medium", "high", "critical"]);

const FRAUD_FLAG_STATUSES = Object.freeze([
  "open",
  "investigating",
  "resolved_legitimate",
  "resolved_fraud",
  "auto_resolved",
  "expired"
]);

const FRAUD_SOURCES = Object.freeze([
  "system_auto",
  "admin_manual",
  "trust_engine",
  "velocity_check",
  "referral_check"
]);

const ADMIN_ACTION_TYPES = Object.freeze([
  "manual_credit",
  "manual_debit",
  "freeze_account",
  "unfreeze_account",
  "void_points",
  "tier_override",
  "streak_reset",
  "streak_shield_grant",
  "referral_approve",
  "referral_reject",
  "referral_hold_extend",
  "challenge_create",
  "challenge_cancel",
  "challenge_modify",
  "boost_pause",
  "boost_cancel",
  "boost_refund",
  "fraud_flag_resolve",
  "fraud_flag_create",
  "trust_score_override",
  "config_update",
  "bulk_action",
  "account_ban",
  "account_unban"
]);

const ADMIN_TARGET_TYPES = Object.freeze([
  "reward_account",
  "ledger_entry",
  "referral",
  "challenge",
  "boost",
  "trust_profile",
  "fraud_flag",
  "config",
  "user"
]);

const SHARE_CHANNELS = Object.freeze([
  "whatsapp",
  "sms",
  "email",
  "instagram",
  "twitter",
  "facebook",
  "copy_link",
  "other"
]);

/** Maximum hold extensions for referral rewards before auto-forfeit */
const MAX_REFERRAL_HOLD_EXTENSIONS = 3;

module.exports = {
  TIERS,
  TIER_ORDER,
  LEDGER_TYPES,
  LEDGER_CREDIT_SOURCES,
  LEDGER_DEBIT_SOURCES,
  LEDGER_SOURCES,
  REFERRAL_STATUSES,
  REFERRAL_REWARD_TYPES,
  REFERRAL_REWARD_STATUSES,
  REFERRAL_EVENT_TYPES,
  CHALLENGE_TYPES,
  CHALLENGE_CATEGORIES,
  CHALLENGE_STATUSES,
  BOOST_TYPES,
  BOOST_STATUSES,
  BOOST_MULTIPLIERS,
  BOOST_MIN_BUDGETS,
  TRUST_BANDS,
  FRAUD_FLAG_TYPES,
  FRAUD_SEVERITIES,
  FRAUD_FLAG_STATUSES,
  FRAUD_SOURCES,
  ADMIN_ACTION_TYPES,
  ADMIN_TARGET_TYPES,
  SHARE_CHANNELS,
  MAX_REFERRAL_HOLD_EXTENSIONS
};
