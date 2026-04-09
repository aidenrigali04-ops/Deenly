/**
 * Stripe Checkout return URLs for ad boost prepay (web vs native app deep link).
 */

function normalizeBoostCheckoutReturnClient(raw) {
  const s = String(raw == null ? "web" : raw)
    .trim()
    .toLowerCase();
  if (s === "mobile_app" || s === "app") {
    return "mobile_app";
  }
  if (s === "web" || s === "") {
    return "web";
  }
  return null;
}

function resolveAdBoostStripeReturnUrls({ appBaseUrl, campaignId, returnClient }) {
  const client = normalizeBoostCheckoutReturnClient(returnClient);
  if (client === "mobile_app") {
    const id = Number(campaignId);
    if (!Number.isInteger(id) || id <= 0) {
      return { successUrl: null, cancelUrl: null };
    }
    return {
      successUrl: `deenly:///checkout/success?kind=ad_boost&campaign_id=${id}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `deenly:///checkout/cancel?kind=ad_boost&campaign_id=${id}`
    };
  }
  const appBase = String(appBaseUrl || "").replace(/\/+$/, "");
  if (!appBase) {
    return { successUrl: null, cancelUrl: null };
  }
  const id = Number(campaignId);
  if (!Number.isInteger(id) || id <= 0) {
    return { successUrl: null, cancelUrl: null };
  }
  return {
    successUrl: `${appBase}/checkout/success?kind=ad_boost&campaign_id=${id}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appBase}/checkout/cancel?kind=ad_boost&campaign_id=${id}`
  };
}

module.exports = {
  normalizeBoostCheckoutReturnClient,
  resolveAdBoostStripeReturnUrls
};
