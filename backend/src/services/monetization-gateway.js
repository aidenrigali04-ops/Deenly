const Stripe = require("stripe");
const { httpError } = require("../utils/http-error");

function createMonetizationGateway({ config }) {
  const stripeSecretKey = String(config?.stripeSecretKey || "");
  const appBaseUrl = String(config?.appBaseUrl || "").replace(/\/+$/, "");
  const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

  function requireStripe() {
    if (!stripe) {
      throw httpError(503, "Monetization is not configured");
    }
    if (!appBaseUrl) {
      throw httpError(503, "APP_BASE_URL is not configured");
    }
    return stripe;
  }

  function normalizeCurrency(value) {
    return String(value || "usd")
      .trim()
      .toLowerCase()
      .slice(0, 3);
  }

  async function createConnectedAccount({ email, country = "US" }) {
    const client = requireStripe();
    return client.accounts.create({
      type: "express",
      country,
      email
    });
  }

  async function retrieveConnectedAccount(accountId) {
    const client = requireStripe();
    return client.accounts.retrieve(accountId);
  }

  async function createOnboardingLink(accountId) {
    const client = requireStripe();
    return client.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${appBaseUrl}/account/creator?connect=refresh`,
      return_url: `${appBaseUrl}/account/creator?connect=return`
    });
  }

  async function createDashboardLink(accountId) {
    const client = requireStripe();
    return client.accounts.createLoginLink(accountId);
  }

  async function createCheckoutSession({
    kind,
    mode = "payment",
    amountMinor,
    currency,
    buyerUserId,
    sellerUserId,
    productId = null,
    tierId = null,
    affiliateCodeId = null,
    title,
    description,
    recurringInterval = "month"
  }) {
    const client = requireStripe();
    const normalizedMode = mode === "subscription" ? "subscription" : "payment";
    return client.checkout.sessions.create({
      mode: normalizedMode,
      success_url: `${appBaseUrl}/account/creator?checkout=success`,
      cancel_url: `${appBaseUrl}/account/creator?checkout=cancel`,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: normalizeCurrency(currency),
            ...(normalizedMode === "subscription"
              ? {
                  recurring: {
                    interval: recurringInterval
                  }
                }
              : {
                  unit_amount: amountMinor
                }),
            product_data: {
              name: title,
              description: description || undefined
            }
          }
        }
      ],
      metadata: {
        kind,
        mode: normalizedMode,
        buyerUserId: String(buyerUserId || ""),
        sellerUserId: String(sellerUserId),
        productId: productId ? String(productId) : "",
        tierId: tierId ? String(tierId) : "",
        affiliateCodeId: affiliateCodeId ? String(affiliateCodeId) : ""
      }
    });
  }

  function constructWebhookEvent({ rawBody, signature, webhookSecret }) {
    const client = requireStripe();
    if (!signature || !webhookSecret) {
      throw httpError(401, "Missing webhook signature configuration");
    }
    return client.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  async function retrieveCheckoutSession(sessionId) {
    const client = requireStripe();
    return client.checkout.sessions.retrieve(sessionId);
  }

  return {
    createConnectedAccount,
    retrieveConnectedAccount,
    createOnboardingLink,
    createDashboardLink,
    createCheckoutSession,
    constructWebhookEvent,
    retrieveCheckoutSession
  };
}

module.exports = {
  createMonetizationGateway
};
