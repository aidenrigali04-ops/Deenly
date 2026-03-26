import { apiRequest } from "@/lib/api";

export type ConnectStatus = {
  connected: boolean;
  stripeAccountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  /** Present when Stripe allows an Express login link for this account */
  dashboardUrl?: string | null;
};

export type BoostTier = "standard" | "boosted" | "aggressive";

export type CreatorProduct = {
  id: number;
  creator_user_id: number;
  title: string;
  description: string | null;
  price_minor: number;
  currency: string;
  delivery_media_key: string | null;
  product_type: "digital" | "service" | "subscription";
  service_details?: string | null;
  delivery_method?: string | null;
  website_url?: string | null;
  audience_target: "b2b" | "b2c" | "both";
  business_category: string | null;
  platform_fee_bps: number;
  boost_tier: string | null;
  status: "draft" | "published" | "archived";
  created_at: string;
  updated_at: string;
};

export type SubscriptionTier = {
  id: number;
  creator_user_id: number;
  title: string;
  description: string | null;
  monthly_price_minor: number;
  currency: string;
  status: "draft" | "published" | "archived";
  created_at: string;
  updated_at: string;
};

export type EarningsSummary = {
  credits_minor: number;
  debits_minor: number;
  balance_minor: number;
};

export type AffiliateSummary = {
  gross_referred_minor: number;
  commission_earned_minor: number;
  conversions_count: number;
};

export async function fetchConnectStatus() {
  return apiRequest<ConnectStatus>("/monetization/connect/status", { auth: true });
}

export async function createConnectAccount() {
  return apiRequest("/monetization/connect/account", { method: "POST", auth: true, body: {} });
}

export async function createOnboardingLink() {
  return apiRequest<{ url: string; expiresAt: number }>("/monetization/connect/onboarding-link", {
    method: "POST",
    auth: true,
    body: {}
  });
}

export async function fetchMyProducts() {
  return apiRequest<{ items: CreatorProduct[] }>("/monetization/products/me", { auth: true });
}

export async function createProduct(input: {
  title: string;
  description?: string;
  priceMinor: number;
  currency?: string;
  deliveryMediaKey?: string;
  productType?: "digital" | "service" | "subscription";
  serviceDetails?: string;
  deliveryMethod?: string;
  websiteUrl?: string;
  audienceTarget?: "b2b" | "b2c" | "both";
  businessCategory?: string;
  platformFeeBps?: number;
  boostTier?: BoostTier | null;
}) {
  return apiRequest<CreatorProduct>("/monetization/products", {
    method: "POST",
    auth: true,
    body: input
  });
}

export async function updateProduct(
  productId: number,
  input: Partial<{
    title: string;
    description: string | null;
    priceMinor: number;
    currency: string;
    deliveryMediaKey: string | null;
    productType: "digital" | "service" | "subscription";
    serviceDetails: string | null;
    deliveryMethod: string | null;
    websiteUrl: string | null;
    audienceTarget: "b2b" | "b2c" | "both";
    businessCategory: string | null;
    status: "draft" | "published" | "archived";
    platformFeeBps: number;
    boostTier: BoostTier | null;
  }>
) {
  return apiRequest<CreatorProduct>(`/monetization/products/${productId}`, {
    method: "PATCH",
    auth: true,
    body: input
  });
}

export async function publishProduct(productId: number) {
  return apiRequest<CreatorProduct>(`/monetization/products/${productId}/publish`, {
    method: "POST",
    auth: true,
    body: {}
  });
}

export async function fetchMyTiers() {
  return apiRequest<{ items: SubscriptionTier[] }>("/monetization/tiers/me", { auth: true });
}

export async function fetchCreatorTiers(creatorUserId: number) {
  return apiRequest<{ items: SubscriptionTier[] }>(`/monetization/tiers/creator/${creatorUserId}`);
}

export async function createTier(input: {
  title: string;
  description?: string;
  monthlyPriceMinor: number;
  currency?: string;
}) {
  return apiRequest<SubscriptionTier>("/monetization/tiers", {
    method: "POST",
    auth: true,
    body: input
  });
}

export async function publishTier(tierId: number) {
  return apiRequest<SubscriptionTier>(`/monetization/tiers/${tierId}/publish`, {
    method: "POST",
    auth: true,
    body: {}
  });
}

export async function attachProductToPost(postId: number, productId: number) {
  return apiRequest(`/monetization/posts/${postId}/product-attach`, {
    method: "POST",
    auth: true,
    body: { productId }
  });
}

export async function createProductCheckout(productId: number, affiliateCode?: string) {
  return apiRequest<{ checkoutSessionId: string; checkoutUrl: string }>(
    `/monetization/checkout/product/${productId}`,
    {
      method: "POST",
      auth: true,
      body: { affiliateCode }
    }
  );
}

export async function createSupportCheckout(creatorUserId: number, amountMinor: number, affiliateCode?: string) {
  return apiRequest<{ checkoutSessionId: string; checkoutUrl: string }>(
    `/monetization/checkout/support/${creatorUserId}`,
    {
      method: "POST",
      auth: true,
      body: { amountMinor, currency: "usd", affiliateCode }
    }
  );
}

export async function createTierCheckout(tierId: number, affiliateCode?: string) {
  return apiRequest<{ checkoutSessionId: string; checkoutUrl: string }>(
    `/monetization/checkout/tier/${tierId}`,
    {
      method: "POST",
      auth: true,
      body: { affiliateCode }
    }
  );
}

export async function fetchProductAccess(productId: number) {
  return apiRequest<{ canAccess: boolean; hasPurchased: boolean; isOwner: boolean }>(
    `/monetization/products/${productId}/access`,
    { auth: true }
  );
}

export async function fetchCreatorSubscriptionAccess(creatorUserId: number) {
  return apiRequest<{ subscribed: boolean; tierId?: number; status?: string }>(
    `/monetization/subscriptions/creator/${creatorUserId}/access`,
    { auth: true }
  );
}

export async function requestProductDownloadLink(productId: number) {
  return apiRequest<{ downloadUrl: string }>(`/monetization/products/${productId}/download-link`, {
    method: "POST",
    auth: true,
    body: {}
  });
}

export async function fetchEarnings() {
  return apiRequest<{ totals: EarningsSummary; items: Array<Record<string, unknown>> }>(
    "/monetization/earnings/me",
    { auth: true }
  );
}

export async function createAffiliateCode(code?: string) {
  return apiRequest("/monetization/affiliate/codes", {
    method: "POST",
    auth: true,
    body: { code }
  });
}

export async function fetchMyAffiliateCodes() {
  return apiRequest<{ items: Array<{ id: number; code: string; is_active: boolean; uses_count: number }> }>(
    "/monetization/affiliate/codes/me",
    { auth: true }
  );
}

export async function fetchMyAffiliatePerformance() {
  return apiRequest<{ summary: AffiliateSummary; items: Array<Record<string, unknown>> }>(
    "/monetization/affiliate/performance/me",
    { auth: true }
  );
}

export async function fetchCreatorRankings(limit = 20) {
  return apiRequest<{ items: Array<Record<string, unknown>> }>(`/monetization/rankings/top?limit=${limit}`);
}

export function formatMinorCurrency(valueMinor: number, currency = "usd") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase()
  }).format((Number(valueMinor) || 0) / 100);
}

export type PostDistributionMetrics = {
  postId: number;
  viewCount: number;
  avgWatchTimeMs: number;
  avgCompletionRate: number;
};

export async function fetchPostDistribution(postId: number) {
  return apiRequest<PostDistributionMetrics>(`/posts/${postId}/distribution`, { auth: true });
}
