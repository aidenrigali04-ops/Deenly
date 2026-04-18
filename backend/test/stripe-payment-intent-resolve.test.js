const {
  disputeClosedMerchantLost,
  resolvePaymentIntentIdFromDispute,
  isFullDisputeAgainstCharge
} = require("../src/modules/monetization/stripe-payment-intent-resolve");

describe("stripe-payment-intent-resolve", () => {
  it("disputeClosedMerchantLost matches Stripe terminal loss outcomes", () => {
    expect(disputeClosedMerchantLost("lost")).toBe(true);
    expect(disputeClosedMerchantLost("charge_refunded")).toBe(true);
    expect(disputeClosedMerchantLost("won")).toBe(false);
    expect(disputeClosedMerchantLost("needs_response")).toBe(false);
  });

  it("resolvePaymentIntentIdFromDispute prefers explicit payment_intent without calling Stripe", async () => {
    const { paymentIntentId, charge } = await resolvePaymentIntentIdFromDispute({
      dispute: { payment_intent: "pi_123" },
      retrieveCharge: async () => {
        throw new Error("retrieveCharge should not run when payment_intent is set and no charge id");
      }
    });
    expect(paymentIntentId).toBe("pi_123");
    expect(charge).toBeNull();
  });

  it("resolvePaymentIntentIdFromDispute loads charge when only charge id is a string", async () => {
    const { paymentIntentId, charge } = await resolvePaymentIntentIdFromDispute({
      dispute: { payment_intent: "pi_top", charge: "ch_x", amount: 1 },
      retrieveCharge: async (chargeId) => {
        expect(chargeId).toBe("ch_x");
        return { id: "ch_x", amount: 5000, payment_intent: "pi_top" };
      }
    });
    expect(paymentIntentId).toBe("pi_top");
    expect(charge && charge.id).toBe("ch_x");
  });

  it("resolvePaymentIntentIdFromDispute loads PI from charge id when missing on dispute", async () => {
    const { paymentIntentId, charge } = await resolvePaymentIntentIdFromDispute({
      dispute: { charge: "ch_abc", amount: 5000 },
      retrieveCharge: async (chargeId) => {
        expect(chargeId).toBe("ch_abc");
        return { id: "ch_abc", amount: 5000, payment_intent: "pi_from_charge" };
      }
    });
    expect(paymentIntentId).toBe("pi_from_charge");
    expect(charge && charge.id).toBe("ch_abc");
  });

  it("resolvePaymentIntentIdFromDispute expands embedded charge object", async () => {
    const { paymentIntentId, charge } = await resolvePaymentIntentIdFromDispute({
      dispute: {
        amount: 100,
        charge: { id: "ch_emb", amount: 100, payment_intent: "pi_emb" }
      },
      retrieveCharge: async () => {
        throw new Error("retrieveCharge should not run when charge is expanded");
      }
    });
    expect(paymentIntentId).toBe("pi_emb");
    expect(charge.id).toBe("ch_emb");
  });

  it("isFullDisputeAgainstCharge is true when disputed amount covers the charge", () => {
    expect(isFullDisputeAgainstCharge({ amount: 5000 }, { amount: 5000 })).toBe(true);
    expect(isFullDisputeAgainstCharge({ amount: 6000 }, { amount: 5000 })).toBe(true);
    expect(isFullDisputeAgainstCharge({ amount: 1000 }, { amount: 5000 })).toBe(false);
    expect(isFullDisputeAgainstCharge({ amount: 1000 }, null)).toBe(false);
  });
});
