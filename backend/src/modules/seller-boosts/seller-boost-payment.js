/**
 * Payment integration boundary for seller boosts.
 * Production: Stripe Checkout session is created via {@link monetizationGateway.createCheckoutSession}
 * (`kind: "seller_boost"`); webhooks call {@link createSellerBoostService}#recordPaymentCompleted.
 *
 * @typedef {object} SellerBoostPaymentPort
 * @property {string} provider
 * @property {() => Promise<{ checkoutUrl: string | null, clientSecret: string | null }>} [createHostedCheckout] Optional alternate checkout path.
 */

/**
 * @returns {SellerBoostPaymentPort}
 */
function createStubSellerBoostPaymentPort() {
  return {
    provider: "stub",
    /**
     * Placeholder for future hosted checkout creation (Stripe Checkout, etc.).
     * @returns {Promise<{ checkoutUrl: null, clientSecret: null }>}
     */
    async createHostedCheckout() {
      return { checkoutUrl: null, clientSecret: null };
    }
  };
}

module.exports = {
  createStubSellerBoostPaymentPort
};
