/**
 * Stripe webhook helpers: map dispute / charge payloads to payment_intent and full-charge semantics.
 */

function disputeClosedMerchantLost(status) {
  const s = String(status || "").toLowerCase();
  return s === "lost" || s === "charge_refunded";
}

/**
 * @param {{ dispute: any, retrieveCharge: (chargeId: string) => Promise<any> }} params
 * @returns {Promise<{ paymentIntentId: string, charge: any | null }>}
 */
async function resolvePaymentIntentIdFromDispute({ dispute, retrieveCharge }) {
  const d = dispute || {};
  let chargeObj = null;
  if (d.charge && typeof d.charge === "object" && d.charge.id != null) {
    chargeObj = d.charge;
  }

  let paymentIntentId = d.payment_intent != null ? String(d.payment_intent) : "";
  if (!paymentIntentId && chargeObj && chargeObj.payment_intent != null) {
    const raw = chargeObj.payment_intent;
    paymentIntentId = typeof raw === "string" ? raw : String(raw.id || "");
  }

  const chargeIdStr =
    typeof d.charge === "string"
      ? d.charge
      : d.charge && typeof d.charge === "object" && d.charge.id != null
        ? String(d.charge.id)
        : "";

  if (!chargeObj && chargeIdStr && typeof retrieveCharge === "function") {
    chargeObj = await retrieveCharge(chargeIdStr);
  }

  if (!paymentIntentId && chargeObj && chargeObj.payment_intent != null) {
    const raw = chargeObj.payment_intent;
    paymentIntentId = typeof raw === "string" ? raw : String(raw.id || "");
  }

  return { paymentIntentId, charge: chargeObj };
}

function isFullDisputeAgainstCharge(dispute, charge) {
  if (!dispute || !charge) {
    return false;
  }
  const disputeAmount = Number(dispute.amount);
  const chargeAmount = Number(charge.amount);
  return (
    Number.isFinite(disputeAmount) &&
    Number.isFinite(chargeAmount) &&
    chargeAmount > 0 &&
    disputeAmount >= chargeAmount
  );
}

module.exports = {
  disputeClosedMerchantLost,
  resolvePaymentIntentIdFromDispute,
  isFullDisputeAgainstCharge
};
