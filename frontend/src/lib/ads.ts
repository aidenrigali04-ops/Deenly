import { apiRequest } from "@/lib/api";

export type BoostPackage = {
  id: string;
  label: string;
  description: string;
  durationDays: number;
  suggestedBudgetMinor: number;
  dailyCapImpressions: number;
  currency: string;
};

export type AdCampaignRow = {
  id: number;
  creator_user_id: number;
  post_id: number | null;
  event_id: number | null;
  status: string;
  budget_minor: number;
  spent_minor: number;
  currency: string;
  daily_cap_impressions: number;
  boost_funded_at?: string | null;
  review_status?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
};

export async function fetchBoostCatalog() {
  return apiRequest<{ items: BoostPackage[] }>("/ads/boost-catalog");
}

export async function createAdCampaign(body: {
  postId?: number;
  eventId?: number;
  packageId?: string;
  budgetMinor?: number;
}) {
  return apiRequest<AdCampaignRow>("/ads/campaigns", {
    method: "POST",
    auth: true,
    body
  });
}

export async function fetchMyAdCampaigns() {
  return apiRequest<{ items: AdCampaignRow[] }>("/ads/campaigns/me", { auth: true });
}

export type AdsAnalyticsSummary = {
  campaignCount: number;
  activeCampaigns: number;
  impressions: number;
  clicks: number;
};

export async function fetchMyAdsAnalyticsSummary() {
  return apiRequest<AdsAnalyticsSummary>("/ads/campaigns/me/analytics-summary", { auth: true });
}

export async function startBoostCheckout(campaignId: number) {
  return apiRequest<{ url: string; sessionId?: string }>(`/ads/campaigns/${campaignId}/boost-checkout`, {
    method: "POST",
    auth: true
  });
}

export async function fetchCampaignAnalytics(campaignId: number) {
  return apiRequest<{ campaignId: number; impressions: number; clicks: number }>(
    `/ads/campaigns/${campaignId}/analytics`,
    { auth: true }
  );
}
