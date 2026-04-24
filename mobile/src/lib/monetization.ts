import { apiRequest } from "./api";

export type MonetizationConnectStatus = {
  connected: boolean;
  stripeAccountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  dashboardUrl?: string;
  feePolicy?: {
    feeExperimentEnabled?: boolean;
    tiers?: {
      key: MonetizationBoostTier;
      label: string;
      platformFeeBps: number;
      enabled: boolean;
      description: string;
    }[];
  };
};

export type MonetizationTier = {
  id: number;
  creator_user_id: number;
  title: string;
  description: string | null;
  monthly_price_minor: number;
  currency: string;
  status: "draft" | "published" | "archived";
};

export async function fetchConnectStatus() {
  return apiRequest<MonetizationConnectStatus>("/monetization/connect/status", { auth: true });
}

export async function createConnectAccount() {
  return apiRequest("/monetization/connect/account", {
    method: "POST",
    auth: true,
    body: {}
  });
}

export async function createOnboardingLink() {
  return apiRequest<{ url: string }>("/monetization/connect/onboarding-link", {
    method: "POST",
    auth: true,
    body: {}
  });
}

export async function createSupportCheckout(
  creatorUserId: number,
  amountMinor: number,
  opts?: { checkoutVariant?: string }
) {
  return apiRequest<{ checkoutUrl: string }>(`/monetization/checkout/support/${creatorUserId}`, {
    method: "POST",
    auth: true,
    body: { amountMinor, currency: "usd", checkoutVariant: opts?.checkoutVariant }
  });
}

export async function createGuestProductCheckout(
  productId: number,
  body?: { guestEmail?: string; smsOptIn?: boolean; checkoutVariant?: string }
) {
  return apiRequest<{ checkoutUrl: string }>(`/monetization/checkout/product/${productId}/guest`, {
    method: "POST",
    body: { guestEmail: body?.guestEmail, smsOptIn: body?.smsOptIn, checkoutVariant: body?.checkoutVariant }
  });
}

export async function createProductCheckout(
  productId: number,
  opts?: {
    smsOptIn?: boolean;
    checkoutVariant?: string;
    redeemMaxPoints?: boolean;
    redeemPointsMinor?: number;
    redeemClientRequestId?: string;
  }
) {
  return apiRequest<{ checkoutUrl: string }>(`/monetization/checkout/product/${productId}`, {
    method: "POST",
    auth: true,
    body: {
      smsOptIn: opts?.smsOptIn,
      checkoutVariant: opts?.checkoutVariant,
      redeemMaxPoints: opts?.redeemMaxPoints,
      redeemPointsMinor: opts?.redeemPointsMinor,
      redeemClientRequestId: opts?.redeemClientRequestId
    }
  });
}

export type ProductRewardsCheckoutPreview = {
  eligible: boolean;
  denyReasons: string[];
  balanceMinor: number;
  lastRedemptionAtIso: string | null;
  pointsToSpend: number;
  discountMinor: number;
  chargedMinor: number;
  listPriceMinor: number;
  productRewardsEligible: boolean;
};

export async function fetchProductCheckoutRewardsPreview(
  productId: number,
  params?: { redeemPointsMinor?: number | null; redeemEnabled?: boolean }
) {
  const sp = new URLSearchParams();
  if (params?.redeemPointsMinor != null) {
    sp.set("redeemPointsMinor", String(Math.max(0, Math.floor(params.redeemPointsMinor))));
  }
  if (params?.redeemEnabled != null) {
    sp.set("redeemEnabled", params.redeemEnabled ? "true" : "false");
  }
  const q = sp.toString();
  return apiRequest<ProductRewardsCheckoutPreview>(
    `/monetization/checkout/product/${productId}/rewards-preview${q ? `?${q}` : ""}`,
    {
      auth: true
    }
  );
}

export async function createEventTicketCheckout(eventId: number) {
  return apiRequest<{ checkoutUrl: string }>(`/monetization/checkout/event/${eventId}`, {
    method: "POST",
    auth: true,
    body: {}
  });
}

export async function createTierCheckout(tierId: number, opts?: { checkoutVariant?: string }) {
  return apiRequest<{ checkoutUrl: string }>(`/monetization/checkout/tier/${tierId}`, {
    method: "POST",
    auth: true,
    body: { checkoutVariant: opts?.checkoutVariant }
  });
}

export async function fetchCreatorTiers(creatorUserId: number) {
  return apiRequest<{ items: MonetizationTier[] }>(`/monetization/tiers/creator/${creatorUserId}`);
}

export async function fetchSubscriptionAccess(creatorUserId: number) {
  return apiRequest<{ subscribed: boolean; tierId?: number; status?: string }>(
    `/monetization/subscriptions/creator/${creatorUserId}/access`,
    { auth: true }
  );
}

export type MonetizationBoostTier = "standard" | "boosted" | "aggressive";

export type CreatorProductRow = {
  id: number;
  creator_user_id: number;
  title: string;
  description: string | null;
  price_minor: number;
  currency: string;
  product_type: "digital" | "service" | "subscription";
  status: "draft" | "published" | "archived";
  platform_fee_bps: number;
  boost_tier?: string | null;
  business_category?: string | null;
  audience_target?: string | null;
  service_details?: string | null;
  delivery_method?: string | null;
  website_url?: string | null;
  delivery_media_key?: string | null;
};

export type CatalogProductRow = {
  id: number;
  creator_user_id: number;
  title: string;
  description: string | null;
  price_minor: number;
  currency: string;
  product_type: "digital" | "service" | "subscription";
  service_details: string | null;
  delivery_method: string | null;
  website_url: string | null;
  audience_target: string | null;
  business_category: string | null;
  platform_fee_bps: number;
  boost_tier: string | null;
  status: "published";
  created_at: string;
  updated_at: string;
  creator_username: string | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
};

export async function fetchMyProducts(params?: { limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.limit != null) {
    qs.set("limit", String(params.limit));
  }
  if (params?.offset != null) {
    qs.set("offset", String(params.offset));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiRequest<{ items: CreatorProductRow[] }>(`/monetization/products/me${suffix}`, { auth: true });
}

export async function fetchCreatorProducts(creatorUserId: number) {
  return apiRequest<{ items: CreatorProductRow[] }>(`/monetization/products/creator/${creatorUserId}`);
}

export async function fetchCatalogProduct(productId: number) {
  return apiRequest<CatalogProductRow>(`/monetization/catalog/products/${productId}`);
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
  productType: "digital" | "service";
  deliveryMediaKey?: string;
  serviceDetails?: string;
  deliveryMethod?: string;
  websiteUrl?: string;
  audienceTarget?: "b2b" | "b2c" | "both";
  businessCategory?: string;
  boostTier?: MonetizationBoostTier;
}) {
  return apiRequest<CreatorProductRow>("/monetization/products", {
    method: "POST",
    auth: true,
    body: { ...input, currency: input.currency || "usd" }
  });
}

/** Full row as returned by GET /products/:id (snake_case from API). */
export type CreatorProductDetail = {
  id: number;
  title: string;
  description: string | null;
  price_minor: number;
  currency: string;
  product_type: "digital" | "service" | "subscription";
  status: "draft" | "published" | "archived";
  delivery_media_key: string | null;
  service_details: string | null;
  delivery_method: string | null;
  website_url: string | null;
  audience_target: string | null;
  business_category: string | null;
  boost_tier: string | null;
};

export async function fetchMyProductById(productId: number) {
  return apiRequest<CreatorProductDetail>(`/monetization/products/${productId}`, { auth: true });
}

export async function patchProduct(
  productId: number,
  input: {
    title?: string;
    description?: string;
    priceMinor?: number;
    currency?: string;
    productType?: "digital" | "service";
    deliveryMediaKey?: string | null;
    serviceDetails?: string;
    deliveryMethod?: string;
    websiteUrl?: string;
    audienceTarget?: "b2b" | "b2c" | "both";
    businessCategory?: string;
    boostTier?: MonetizationBoostTier;
    status?: "draft" | "published" | "archived";
  }
) {
  return apiRequest<CreatorProductRow>(`/monetization/products/${productId}`, {
    method: "PATCH",
    auth: true,
    body: input
  });
}

export async function publishProduct(productId: number) {
  return apiRequest<CreatorProductRow>(`/monetization/products/${productId}/publish`, {
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

export async function fetchMyTiers() {
  return apiRequest<{ items: MonetizationTier[] }>("/monetization/tiers/me", { auth: true });
}

export async function createTier(input: {
  title: string;
  description?: string;
  monthlyPriceMinor: number;
  currency?: string;
}) {
  return apiRequest<MonetizationTier>("/monetization/tiers", {
    method: "POST",
    auth: true,
    body: input
  });
}

export async function publishTier(tierId: number) {
  return apiRequest<MonetizationTier>(`/monetization/tiers/${tierId}/publish`, {
    method: "POST",
    auth: true,
    body: {}
  });
}

export async function fetchMyEarnings() {
  return apiRequest<{ totals: { balance_minor: number }; items: Record<string, unknown>[] }>(
    "/monetization/earnings/me",
    { auth: true }
  );
}

export type MyPurchaseRow = {
  order_id: number;
  kind: string;
  status: string;
  amount_minor: number;
  currency: string;
  created_at: string;
  seller_username: string;
  seller_display_name: string | null;
  product_id: number | null;
  product_title: string | null;
  product_type: string | null;
  tier_title: string | null;
};

export async function fetchMyPurchases(params?: { limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.limit != null) {
    qs.set("limit", String(params.limit));
  }
  if (params?.offset != null) {
    qs.set("offset", String(params.offset));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiRequest<{ items: MyPurchaseRow[] }>(`/monetization/purchases/me${suffix}`, { auth: true });
}

export async function fetchAffiliateCodes() {
  return apiRequest<{ items: { id: number; code: string; uses_count: number }[] }>(
    "/monetization/affiliate/codes/me",
    { auth: true }
  );
}

export async function createAffiliateCode() {
  return apiRequest("/monetization/affiliate/codes", {
    method: "POST",
    auth: true,
    body: {}
  });
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
