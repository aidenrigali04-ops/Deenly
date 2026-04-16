/**
 * TypeScript types for the Deenly Rewards & Growth Engine.
 * Mirrors the backend API contracts (see docs/api-contracts-rewards-growth-engine.md).
 */

export type RewardTier =
  | "explorer"
  | "member"
  | "insider"
  | "vip"
  | "elite";

export type TrustBand =
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "high_risk";

export type LedgerType = "credit" | "debit";

export type LedgerSource =
  | "order_earn"
  | "order_redemption"
  | "streak_bonus"
  | "challenge_reward"
  | "referral_reward"
  | "referral_bonus"
  | "admin_adjustment"
  | "fraud_void"
  | "refund_clawback"
  | "expiration";

export type BoostType = "listing_boost" | "store_boost" | "featured_listing";

export type BoostStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type ReferralStatus =
  | "pending"
  | "qualifying"
  | "held"
  | "released"
  | "forfeited"
  | "rejected";

export type ChallengeType = "daily" | "weekly" | "monthly" | "merchant";
export type ChallengeCategory =
  | "engagement"
  | "purchase"
  | "social"
  | "streak"
  | "referral";
export type ChallengeStatus = "active" | "completed" | "expired" | "abandoned";

export type ShareChannel =
  | "sms"
  | "whatsapp"
  | "email"
  | "twitter"
  | "facebook"
  | "instagram"
  | "copy_link"
  | "qr_code";

// ---------- Core domain objects ----------

export interface RewardAccountState {
  user_id: number;
  balance: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
  tier: RewardTier;
  tier_multiplier: number;
  rolling_12m_points: number;
  frozen: boolean;
  frozen_reason?: string | null;
  earnings_suspended?: boolean;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  user_id: number;
  amount: number;
  type: LedgerType;
  source: LedgerSource;
  reference_id: string | null;
  reference_type: string | null;
  balance_after: number;
  tier_at_earn: RewardTier | null;
  multiplier_applied: number | null;
  metadata: Record<string, unknown>;
  voided_at: string | null;
  created_at: string;
}

export interface PaginatedLedger {
  items: LedgerEntry[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface TierInfo {
  tier: RewardTier;
  tier_multiplier: number;
  rolling_12m_points: number;
  next_tier: RewardTier | null;
  points_to_next_tier: number | null;
  threshold_current: number;
  threshold_next: number | null;
  grace_period_ends_at: string | null;
}

export interface StreakState {
  current_streak_days: number;
  longest_streak_days: number;
  last_check_in_date: string | null;
  next_check_in_available_at: string | null;
  multiplier: number;
  shields_available: number;
  shields_used: number;
  next_milestone_days: number | null;
}

export interface StreakCheckInResult {
  streak_days: number;
  multiplier: number;
  bonus_points: number;
  balance_after: number;
  already_checked_in: boolean;
  ledger_entry_id?: string;
}

export interface Challenge {
  id: string;
  name: string;
  description: string;
  type: ChallengeType;
  category: ChallengeCategory;
  reward_points: number;
  criteria: Record<string, unknown>;
  starts_at: string;
  ends_at: string;
  max_participants: number | null;
  participants_count: number;
}

export interface UserChallenge {
  id: string;
  challenge: Challenge;
  status: ChallengeStatus;
  progress: Record<string, number>;
  progress_percent: number;
  enrolled_at: string;
  completed_at: string | null;
  reward_awarded: boolean;
}

export interface CheckoutEarnPreview {
  earn_points: number;
  base_points: number;
  tier_multiplier: number;
  streak_multiplier: number;
  daily_cap: number;
  earned_today: number;
  capped: boolean;
}

export interface CheckoutRedemptionPreview {
  eligible: boolean;
  reason?: string;
  balance: number;
  max_points: number;
  requested_points: number;
  discount_minor: number;
  min_order_minor: number;
  max_redemption_ratio: number;
}

export interface ReferralCode {
  code: string;
  share_url: string;
  is_active: boolean;
  monthly_uses: number;
  monthly_cap: number;
  monthly_remaining: number;
}

export interface ReferralSummary {
  total_invited: number;
  total_signed_up: number;
  total_qualified: number;
  total_released: number;
  pending_points: number;
  earned_points: number;
  referrals: Referral[];
}

export interface Referral {
  id: string;
  code: string;
  referred_user_id: number | null;
  referred_username: string | null;
  status: ReferralStatus;
  reward_points: number;
  held_until: string | null;
  released_at: string | null;
  rejected_reason: string | null;
  created_at: string;
}

export interface TrustProfile {
  user_id: number;
  score: number;
  band: TrustBand;
  components: {
    identity: number;
    behavioral: number;
    transaction: number;
    social: number;
    device: number;
  };
  last_calculated_at: string;
  updated_at: string;
}

export interface Boost {
  id: string;
  seller_id: number;
  listing_id: string | number | null;
  store_id: string | number | null;
  type: BoostType;
  status: BoostStatus;
  budget_minor: number;
  spent_minor: number;
  remaining_minor: number;
  multiplier: number;
  duration_hours: number;
  starts_at: string | null;
  ends_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Request payloads ----------

export interface PreviewEarnRequest {
  cart_total_minor: number;
}

export interface PreviewRedemptionRequest {
  cart_total_minor: number;
  requested_points?: number;
}

export interface CreateBoostRequest {
  listing_id?: string | number;
  store_id?: string | number;
  type: BoostType;
  budget_minor: number;
  multiplier: number;
  duration_hours: number;
}

export interface ShareReferralRequest {
  channel: ShareChannel;
  metadata?: Record<string, unknown>;
}

export interface AttributeReferralRequest {
  code: string;
  device_fingerprint?: string;
}
