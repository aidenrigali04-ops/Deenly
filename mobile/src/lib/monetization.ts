import { apiRequest } from "./api";

export type MonetizationConnectStatus = {
  connected: boolean;
  stripeAccountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  dashboardUrl?: string;
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

export async function createSupportCheckout(creatorUserId: number, amountMinor: number) {
  return apiRequest<{ checkoutUrl: string }>(`/monetization/checkout/support/${creatorUserId}`, {
    method: "POST",
    auth: true,
    body: { amountMinor, currency: "usd" }
  });
}

export async function createGuestProductCheckout(productId: number, body?: { guestEmail?: string; smsOptIn?: boolean }) {
  return apiRequest<{ checkoutUrl: string }>(`/monetization/checkout/product/${productId}/guest`, {
    method: "POST",
    body: { guestEmail: body?.guestEmail, smsOptIn: body?.smsOptIn }
  });
}

export async function createProductCheckout(productId: number, opts?: { smsOptIn?: boolean }) {
  return apiRequest<{ checkoutUrl: string }>(`/monetization/checkout/product/${productId}`, {
    method: "POST",
    auth: true,
    body: { smsOptIn: opts?.smsOptIn }
  });
}

export async function createTierCheckout(tierId: number) {
  return apiRequest<{ checkoutUrl: string }>(`/monetization/checkout/tier/${tierId}`, {
    method: "POST",
    auth: true,
    body: {}
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
};

export async function fetchMyProducts() {
  return apiRequest<{ items: CreatorProductRow[] }>("/monetization/products/me", { auth: true });
}

export type ProductImportDraft = {
  title: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  productType: "digital" | "service" | "subscription";
  websiteUrl: string | null;
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
  productType: "digital" | "service" | "subscription";
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

export async function fetchMyEarnings() {
  return apiRequest<{ totals: { balance_minor: number }; items: Record<string, unknown>[] }>(
    "/monetization/earnings/me",
    { auth: true }
  );
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
