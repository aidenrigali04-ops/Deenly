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

export async function createProductCheckout(productId: number) {
  return apiRequest<{ checkoutUrl: string }>(`/monetization/checkout/product/${productId}`, {
    method: "POST",
    auth: true,
    body: {}
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

export async function fetchMyProducts() {
  return apiRequest<{ items: Record<string, unknown>[] }>("/monetization/products/me", { auth: true });
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
