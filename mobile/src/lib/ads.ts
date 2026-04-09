import { apiRequest } from "./api";

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
  post_id: number | null;
  event_id: number | null;
  status: string;
  budget_minor: number;
  currency: string;
  boost_funded_at?: string | null;
  review_status?: string | null;
};

export async function fetchBoostCatalog() {
  return apiRequest<{ items: BoostPackage[] }>("/ads/boost-catalog");
}

export async function createAdCampaign(body: { postId?: number; eventId?: number; packageId: string }) {
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

export type BoostCheckoutReturnClient = "web" | "mobile_app";

export async function startBoostCheckout(
  campaignId: number,
  options?: { returnClient?: BoostCheckoutReturnClient }
) {
  const body =
    options?.returnClient && options.returnClient !== "web"
      ? { returnClient: options.returnClient }
      : undefined;
  return apiRequest<{ url: string; sessionId?: string }>(`/ads/campaigns/${campaignId}/boost-checkout`, {
    method: "POST",
    auth: true,
    body
  });
}
