import { apiRequest } from "@/lib/api";

export type ConnectStatus = {
  connected: boolean;
  stripeAccountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  /** Present when Stripe allows an Express login link for this account */
  dashboardUrl?: string | null;
  feePolicy?: {
    feeExperimentEnabled?: boolean;
    tiers?: Array<{
      key: BoostTier;
      label: string;
      platformFeeBps: number;
      enabled: boolean;
      description: string;
    }>;
  };
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

/** Published catalog rows from GET /monetization/products/creator/:id (no delivery_media_key). */
export type PublicCreatorProduct = Omit<CreatorProduct, "delivery_media_key">;

/** GET /monetization/catalog/products/:id — published only; includes creator display fields. */
export type PublicCatalogProduct = PublicCreatorProduct & {
  creator_username?: string;
  creator_display_name?: string | null;
  creator_avatar_url?: string | null;
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

export type PlaidStatusResponse = {
  configured: boolean;
  linked?: boolean;
  itemId?: string;
  institutionName?: string | null;
  updatedAt?: string;
};

export async function fetchPlaidStatus() {
  return apiRequest<PlaidStatusResponse>("/monetization/plaid/status", { auth: true });
}

export async function createPlaidLinkToken() {
  return apiRequest<{ linkToken: string }>("/monetization/plaid/link-token", { method: "POST", auth: true, body: {} });
}

export type PlaidExchangeResponse = {
  itemId: string;
  institutionName: string | null;
  accounts: { id: string; mask: string | null; name: string | null; subtype: string | null; type: string | null }[];
};

export async function exchangePlaidPublicToken(publicToken: string) {
  return apiRequest<PlaidExchangeResponse>("/monetization/plaid/exchange", {
    method: "POST",
    auth: true,
    body: { publicToken }
  });
}

export async function attachPlaidStripePayout(accountId: string) {
  return apiRequest<{ attached: boolean; stripeExternalAccountId?: string | null; last4?: string | null }>(
    "/monetization/plaid/attach-stripe-payout",
    {
      method: "POST",
      auth: true,
      body: { accountId }
    }
  );
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

export async function fetchCreatorProducts(creatorUserId: number) {
  return apiRequest<{ items: PublicCreatorProduct[] }>(`/monetization/products/creator/${creatorUserId}`);
}

export async function fetchPublicProduct(productId: number) {
  return apiRequest<PublicCatalogProduct>(`/monetization/catalog/products/${productId}`);
}

export type ProductImportDraft = {
  title: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  productType: "digital" | "service" | "subscription";
  websiteUrl: string | null;
  serviceDetails?: string | null;
  deliveryMethod?: string | null;
  audienceTarget?: "b2b" | "b2c" | "both" | null;
  businessCategory?: string | null;
};

export type StripeProductImportRow = {
  stripePriceId: string;
  stripeProductId: string;
  title: string;
  priceMinor: number;
  currency: string;
  recurring: { interval: string; intervalCount: number } | null;
  productActive: boolean;
};

export type StripeProductIdImportResponse =
  | { draft: ProductImportDraft; provenance: { stripeProductId: string; stripePriceId: string } }
  | {
      message: string;
      stripeProductId: string;
      needsPriceSelection: true;
      items: StripeProductImportRow[];
    };

export async function fetchStripeProductImportList(params?: { limit?: number; startingAfter?: string | null }) {
  const qs = new URLSearchParams();
  if (params?.limit != null) {
    qs.set("limit", String(params.limit));
  }
  if (params?.startingAfter) {
    qs.set("startingAfter", params.startingAfter);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiRequest<{ items: StripeProductImportRow[]; hasMore: boolean; nextStartingAfter: string | null }>(
    `/monetization/products/import/stripe${suffix}`,
    { auth: true }
  );
}

export async function importProductDraftFromStripe(body: { stripeProductId: string; stripePriceId: string }) {
  return apiRequest<{ draft: ProductImportDraft; provenance: { stripeProductId: string; stripePriceId: string } }>(
    "/monetization/products/import/stripe",
    { method: "POST", auth: true, body }
  );
}

export async function importProductDraftFromStripeProductId(stripeProductId: string) {
  return apiRequest<StripeProductIdImportResponse>("/monetization/products/import/stripe/product-id", {
    method: "POST",
    auth: true,
    body: { stripeProductId }
  });
}

export async function importProductDraftFromUrl(url: string) {
  return apiRequest<{
    draft: ProductImportDraft;
    sourceUrl: string;
    confidence: string;
    warnings: string[];
    hints: { ogImage: string | null };
  }>("/monetization/products/import/url", { method: "POST", auth: true, body: { url } });
}

export async function createProduct(input: {
  title: string;
  description?: string;
  priceMinor: number;
  currency?: string;
  deliveryMediaKey?: string;
  productType?: "digital" | "service";
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
    productType: "digital" | "service";
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

export async function createGuestProductCheckout(
  productId: number,
  body?: { guestEmail?: string; smsOptIn?: boolean; affiliateCode?: string }
) {
  return apiRequest<{ checkoutSessionId: string; checkoutUrl: string }>(
    `/monetization/checkout/product/${productId}/guest`,
    {
      method: "POST",
      body: {
        guestEmail: body?.guestEmail,
        smsOptIn: body?.smsOptIn,
        affiliateCode: body?.affiliateCode
      }
    }
  );
}

export async function createProductCheckout(
  productId: number,
  opts?: { affiliateCode?: string; smsOptIn?: boolean }
) {
  return apiRequest<{ checkoutSessionId: string; checkoutUrl: string }>(
    `/monetization/checkout/product/${productId}`,
    {
      method: "POST",
      auth: true,
      body: { affiliateCode: opts?.affiliateCode, smsOptIn: opts?.smsOptIn }
    }
  );
}

export async function createEventTicketCheckout(eventId: number) {
  return apiRequest<{ checkoutSessionId: string; checkoutUrl: string }>(
    `/monetization/checkout/event/${eventId}`,
    { method: "POST", auth: true, body: {} }
  );
}

export type PurchaseAccessPayload = {
  orderId: number;
  productId: number;
  title: string;
  productType: string;
  websiteUrl: string | null;
  hasDigitalDelivery: boolean;
};

export async function fetchPurchaseAccess(token: string) {
  return apiRequest<PurchaseAccessPayload>(
    `/monetization/purchase/access?token=${encodeURIComponent(token)}`
  );
}

export async function claimPurchaseAttach(token: string) {
  return apiRequest<{ attached: boolean; alreadyYours?: boolean }>("/monetization/purchase/claim/attach", {
    method: "POST",
    auth: true,
    body: { token }
  });
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

export type MyPurchaseRow = {
  order_id: number;
  kind: "product" | "support" | "subscription";
  status: string;
  amount_minor: number;
  currency: string;
  created_at: string;
  seller_user_id: number;
  seller_username: string;
  seller_display_name: string;
  product_id: number | null;
  product_title: string | null;
  product_type: "digital" | "service" | "subscription" | null;
  tier_title: string | null;
};

export async function fetchMyPurchases(params?: { limit?: number; offset?: number }) {
  const limit = params?.limit ?? 20;
  const offset = params?.offset ?? 0;
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return apiRequest<{ limit: number; offset: number; items: MyPurchaseRow[] }>(
    `/monetization/purchases/me?${qs.toString()}`,
    { auth: true }
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

export function estimateCreatorNet(
  amountMinor: number,
  platformFeeBps: number,
  affiliateCommissionBps = 700,
  includeAffiliate = false
) {
  const normalizedAmount = Math.max(0, Number(amountMinor) || 0);
  const feeBps = Math.max(0, Number(platformFeeBps) || 0);
  const affiliateBps = Math.max(0, Number(affiliateCommissionBps) || 0);
  const platformFeeMinor = Math.max(0, Math.round((normalizedAmount * feeBps) / 10000));
  const affiliateMinor = includeAffiliate ? Math.max(0, Math.round((normalizedAmount * affiliateBps) / 10000)) : 0;
  const creatorNetMinor = Math.max(0, normalizedAmount - platformFeeMinor - affiliateMinor);
  return { platformFeeMinor, affiliateMinor, creatorNetMinor };
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
