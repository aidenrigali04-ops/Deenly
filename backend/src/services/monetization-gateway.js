const Stripe = require("stripe");
const { httpError } = require("../utils/http-error");

function createMonetizationGateway({ config }) {
  const stripeSecretKey = String(config?.stripeSecretKey || "");
  const appBaseUrl = String(config?.appBaseUrl || "").replace(/\/+$/, "");
  const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

  /** API calls that need Stripe (Connect, webhooks). Does not require APP_BASE_URL. */
  function requireStripeClient() {
    if (!stripe) {
      throw httpError(503, "Monetization is not configured");
    }
    return stripe;
  }

  /** Checkout and hosted redirect URLs need a public web app base URL. */
  function requireAppBaseUrl() {
    if (!appBaseUrl) {
      throw httpError(503, "APP_BASE_URL is not configured");
    }
    return appBaseUrl;
  }

  function normalizeCurrency(value) {
    return String(value || "usd")
      .trim()
      .toLowerCase()
      .slice(0, 3);
  }

  async function createConnectedAccount({ email, country = "US" }) {
    const client = requireStripeClient();
    return client.accounts.create({
      type: "express",
      country,
      email
    });
  }

  async function retrieveConnectedAccount(accountId) {
    const client = requireStripeClient();
    return client.accounts.retrieve(accountId);
  }

  async function createOnboardingLink(accountId) {
    const client = requireStripeClient();
    const base = requireAppBaseUrl();
    return client.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${base}/account/creator?connect=refresh`,
      return_url: `${base}/account/creator?connect=return`
    });
  }

  async function createDashboardLink(accountId) {
    const client = requireStripeClient();
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
    recurringInterval = "month",
    connectedAccountId = null,
    applicationFeeAmountMinor = null,
    platformFeeBps = null,
    customerEmail = null,
    collectPhone = false,
    metadataExtra = null
  }) {
    const client = requireStripeClient();
    const base = requireAppBaseUrl();
    const normalizedMode = mode === "subscription" ? "subscription" : "payment";
    const paymentIntentData = {};
    if (
      normalizedMode === "payment" &&
      connectedAccountId &&
      typeof applicationFeeAmountMinor === "number" &&
      applicationFeeAmountMinor >= 0
    ) {
      paymentIntentData.transfer_data = { destination: connectedAccountId };
      if (applicationFeeAmountMinor > 0) {
        paymentIntentData.application_fee_amount = applicationFeeAmountMinor;
      }
    }
    const extra =
      metadataExtra && typeof metadataExtra === "object"
        ? Object.fromEntries(
            Object.entries(metadataExtra).map(([k, v]) => [k, v == null ? "" : String(v).slice(0, 500)])
          )
        : {};
    return client.checkout.sessions.create({
      mode: normalizedMode,
      success_url: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/checkout/cancel`,
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
      ...(Object.keys(paymentIntentData).length ? { payment_intent_data: paymentIntentData } : {}),
      ...(customerEmail ? { customer_email: String(customerEmail).trim().slice(0, 255) } : {}),
      ...(collectPhone ? { phone_number_collection: { enabled: true } } : {}),
      metadata: {
        kind,
        mode: normalizedMode,
        buyerUserId: String(buyerUserId || ""),
        sellerUserId: String(sellerUserId),
        productId: productId ? String(productId) : "",
        tierId: tierId ? String(tierId) : "",
        affiliateCodeId: affiliateCodeId ? String(affiliateCodeId) : "",
        platformFeeBps: platformFeeBps != null ? String(platformFeeBps) : "",
        ...extra
      }
    });
  }

  function constructWebhookEvent({ rawBody, signature, webhookSecret }) {
    if (!signature || !webhookSecret) {
      throw httpError(401, "Missing webhook signature configuration");
    }
    const client = requireStripeClient();
    return client.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  async function retrieveCheckoutSession(sessionId) {
    const client = requireStripeClient();
    return client.checkout.sessions.retrieve(sessionId);
  }

  /**
   * List active prices on a Connect account (expanded product) for import UI.
   */
  async function listConnectAccountPrices({ stripeAccountId, limit = 30, startingAfter = null }) {
    const client = requireStripeClient();
    const cap = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return client.prices.list(
      {
        active: true,
        limit: cap,
        starting_after: startingAfter || undefined,
        expand: ["data.product"]
      },
      { stripeAccount: stripeAccountId }
    );
  }

  async function retrieveConnectAccountPrice({ stripeAccountId, priceId }) {
    const client = requireStripeClient();
    return client.prices.retrieve(
      priceId,
      { expand: ["product"] },
      { stripeAccount: stripeAccountId }
    );
  }

  async function retrieveConnectAccountProduct({ stripeAccountId, productId }) {
    const client = requireStripeClient();
    return client.products.retrieve(productId, {}, { stripeAccount: stripeAccountId });
  }

  return {
    createConnectedAccount,
    retrieveConnectedAccount,
    createOnboardingLink,
    createDashboardLink,
    createCheckoutSession,
    constructWebhookEvent,
    retrieveCheckoutSession,
    listConnectAccountPrices,
    retrieveConnectAccountPrice,
    retrieveConnectAccountProduct
  };
}

module.exports = {
  createMonetizationGateway
};
