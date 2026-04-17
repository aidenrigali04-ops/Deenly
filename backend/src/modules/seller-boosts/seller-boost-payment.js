/**
 * Payment integration boundary for seller boosts.
 * Wire Stripe Checkout / webhooks here later; callers complete purchases via
 * {@link createSellerBoostService}#recordPaymentCompleted when payment is confirmed.
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
