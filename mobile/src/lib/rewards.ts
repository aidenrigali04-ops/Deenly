/**
 * Mobile API client for the Deenly Rewards & Growth Engine.
 *
 * Thin wrappers over `apiRequest` that match the contract in
 * docs/api-contracts-rewards-growth-engine.md. All functions return
 * the response body verbatim — React Query hooks live elsewhere.
 */

import { apiRequest } from "./api";
import type {
  RewardAccountState,
  PaginatedLedger,
  LedgerType,
  LedgerSource,
  TierInfo,
  StreakState,
  StreakCheckInResult,
  Challenge,
  UserChallenge,
  CheckoutEarnPreview,
  CheckoutRedemptionPreview,
  PreviewEarnRequest,
  PreviewRedemptionRequest,
  ReferralCode,
  ReferralSummary,
  ShareReferralRequest,
  AttributeReferralRequest,
  Boost,
  BoostStatus,
  CreateBoostRequest,
} from "../types/rewards";

// ---------- Balance & history ----------

export async function fetchRewardBalance(): Promise<{ data: RewardAccountState }> {
  return apiRequest<{ data: RewardAccountState }>(`/rewards/balance`);
}

export async function fetchRewardHistory(params: {
  limit?: number;
  cursor?: string | null;
  type?: LedgerType;
  source?: LedgerSource;
} = {}): Promise<PaginatedLedger> {
  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.type) q.set("type", params.type);
  if (params.source) q.set("source", params.source);
  const qs = q.toString();
  return apiRequest<PaginatedLedger>(`/rewards/history${qs ? `?${qs}` : ""}`);
}

// ---------- Tier ----------

export async function fetchTierInfo(): Promise<{ data: TierInfo }> {
  return apiRequest<{ data: TierInfo }>(`/rewards/tier`);
}

// ---------- Streak ----------

export async function fetchStreakState(): Promise<{ data: StreakState }> {
  return apiRequest<{ data: StreakState }>(`/rewards/streak`);
}

export async function submitDailyCheckIn(): Promise<{ data: StreakCheckInResult }> {
  return apiRequest<{ data: StreakCheckInResult }>(`/rewards/streak/check-in`, {
    method: "POST",
  });
}

// ---------- Challenges ----------

export async function fetchAvailableChallenges(params: {
  limit?: number;
  offset?: number;
  type?: string;
  category?: string;
} = {}): Promise<{ items: Challenge[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  if (params.type) q.set("type", params.type);
  if (params.category) q.set("category", params.category);
  const qs = q.toString();
  return apiRequest(`/rewards/challenges${qs ? `?${qs}` : ""}`);
}

export async function fetchMyChallenges(params: {
  limit?: number;
  offset?: number;
  status?: string;
} = {}): Promise<{ items: UserChallenge[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  if (params.status) q.set("status", params.status);
  const qs = q.toString();
  return apiRequest(`/rewards/challenges/mine${qs ? `?${qs}` : ""}`);
}

export async function enrollInChallenge(challengeId: string): Promise<{ data: UserChallenge }> {
  return apiRequest(`/rewards/challenges/${challengeId}/enroll`, {
    method: "POST",
  });
}

// ---------- Checkout preview ----------

export async function previewCheckoutEarn(
  body: PreviewEarnRequest
): Promise<{ data: CheckoutEarnPreview }> {
  return apiRequest(`/rewards/checkout/preview-earn`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function previewCheckoutRedemption(
  body: PreviewRedemptionRequest
): Promise<{ data: CheckoutRedemptionPreview }> {
  return apiRequest(`/rewards/checkout/preview-redemption`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------- Referrals ----------

export async function fetchReferralCode(): Promise<{ data: ReferralCode }> {
  return apiRequest(`/referrals/code`);
}

export async function fetchReferralStatus(): Promise<{ data: ReferralSummary }> {
  return apiRequest(`/referrals/status`);
}

export async function recordReferralShare(
  body: ShareReferralRequest
): Promise<{ data: { id: string } }> {
  return apiRequest(`/referrals/share`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function attributeReferral(
  body: AttributeReferralRequest
): Promise<{ data: { id: string; status: string } }> {
  return apiRequest(`/referrals/attribute`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------- Boosts (seller) ----------

export async function fetchBoosts(params: {
  status?: BoostStatus;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: Boost[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiRequest(`/boosts${qs ? `?${qs}` : ""}`);
}

export async function fetchBoost(boostId: string): Promise<{ data: Boost }> {
  return apiRequest(`/boosts/${boostId}`);
}

export async function createBoost(body: CreateBoostRequest): Promise<{ data: Boost }> {
  return apiRequest(`/boosts`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function activateBoost(
  boostId: string,
  paymentReference?: string
): Promise<{ data: Boost }> {
  return apiRequest(`/boosts/${boostId}/activate`, {
    method: "POST",
    body: JSON.stringify({ payment_reference: paymentReference ?? null }),
  });
}

export async function pauseBoost(boostId: string): Promise<{ data: Boost }> {
  return apiRequest(`/boosts/${boostId}/pause`, { method: "POST" });
}

export async function resumeBoost(boostId: string): Promise<{ data: Boost }> {
  return apiRequest(`/boosts/${boostId}/resume`, { method: "POST" });
}

export async function cancelBoost(
  boostId: string,
  reason?: string
): Promise<{ data: Boost }> {
  return apiRequest(`/boosts/${boostId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? null }),
  });
}

// ---------- React Query keys ----------

export const rewardsQueryKeys = {
  balance: () => ["rewards-balance"] as const,
  history: (params: Record<string, unknown> = {}) =>
    ["rewards-history", params] as const,
  tier: () => ["rewards-tier"] as const,
  streak: () => ["rewards-streak"] as const,
  availableChallenges: (params: Record<string, unknown> = {}) =>
    ["rewards-challenges-available", params] as const,
  myChallenges: (params: Record<string, unknown> = {}) =>
    ["rewards-challenges-mine", params] as const,
  referralCode: () => ["referrals-code"] as const,
  referralStatus: () => ["referrals-status"] as const,
  boosts: (params: Record<string, unknown> = {}) => ["boosts", params] as const,
  boost: (boostId: string) => ["boost", boostId] as const,
};
