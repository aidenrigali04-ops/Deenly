/**
 * Startup-practical, heuristic trust payloads for rewards / referrals / boost / ranking / refund paths.
 * Callers pass results to {@link createTrustFlagService#recordFlag}; these helpers return `null` when no signal.
 */

/**
 * @param {object} thresholds from {@link getTrustSignalThresholds}
 * @param {number} buyerUserId
 * @param {number} productId
 * @param {number} listPriceMinor
 * @param {number} discountMinor
 * @param {number} pointsSpent
 * @param {number} ledgerEntryId
 */
function maybeRewardsCheckoutHighDiscountTrustFlag({
  thresholds,
  buyerUserId,
  productId,
  listPriceMinor,
  discountMinor,
  pointsSpent,
  ledgerEntryId
}) {
  if (!thresholds.enabled) {
    return null;
  }
  const bps = Number(thresholds.rewardsCheckoutDiscountFlagBps);
  if (!Number.isFinite(bps) || bps <= 0 || bps > 10000) {
    return null;
  }
  const list = Number(listPriceMinor);
  const disc = Number(discountMinor);
  if (!(list > 0 && disc > 0)) {
    return null;
  }
  const ratioBps = Math.round((disc / list) * 10000);
  if (ratioBps < bps) {
    return null;
  }
  return {
    domain: "rewards",
    flagType: "rewards_checkout_high_discount_ratio",
    severity: "low",
    subjectUserId: buyerUserId,
    relatedEntityType: "reward_ledger_entry",
    relatedEntityId: String(ledgerEntryId),
    metadata: {
      productId,
      listPriceMinor: list,
      discountMinor: disc,
      pointsSpent,
      discountToListBps: ratioBps
    }
  };
}

/**
 * Large completed product order — surfaces seller-side review (wash-trade / velocity later in admin).
 */
function maybeCommerceLargeOrderTrustFlag({
  thresholds,
  buyerUserId,
  sellerUserId,
  orderId,
  productId,
  amountMinor
}) {
  if (!thresholds.enabled) {
    return null;
  }
  const minAmt = Number(thresholds.commerceOrderFlagMinor);
  if (!Number.isFinite(minAmt) || minAmt <= 0) {
    return null;
  }
  const amt = Number(amountMinor);
  if (!Number.isFinite(amt) || amt < minAmt) {
    return null;
  }
  const seller = Number(sellerUserId);
  return {
    domain: "ranking",
    flagType: "commerce_large_completed_order",
    severity: "low",
    subjectUserId: Number.isInteger(seller) && seller > 0 ? seller : null,
    relatedEntityType: "order",
    relatedEntityId: String(orderId),
    metadata: {
      buyerUserId: Number(buyerUserId) || null,
      productId: Number(productId) || null,
      amountMinor: amt
    }
  };
}

function maybeSellerBoostHighSpendTrustFlag({ thresholds, sellerUserId, purchaseId, amountMinor }) {
  if (!thresholds.enabled) {
    return null;
  }
  const minAmt = Number(thresholds.sellerBoostSpendFlagMinor);
  if (!Number.isFinite(minAmt) || minAmt <= 0) {
    return null;
  }
  const amt = Number(amountMinor);
  if (!Number.isFinite(amt) || amt < minAmt) {
    return null;
  }
  return {
    domain: "boost",
    flagType: "seller_boost_high_spend",
    severity: "low",
    subjectUserId: Number(sellerUserId),
    relatedEntityType: "seller_boost_purchase",
    relatedEntityId: String(purchaseId),
    metadata: { amountMinor: amt }
  };
}

function maybeReferralQualifiedClawbackTrustFlag({ thresholds, referrerUserId, attributionId, orderId, reason }) {
  if (!thresholds.enabled || !thresholds.referralClawbackFlagEnabled) {
    return null;
  }
  const ref = Number(referrerUserId);
  if (!Number.isInteger(ref) || ref < 1) {
    return null;
  }
  return {
    domain: "referral",
    flagType: "referral_qualified_payout_clawed_back",
    severity: "medium",
    subjectUserId: ref,
    relatedEntityType: "referral_attribution",
    relatedEntityId: String(attributionId),
    metadata: { orderId: Number(orderId) || null, reason: String(reason || "").slice(0, 128) }
  };
}

/**
 * Checkout points reversal (expired session, refund, etc.) — audit signal, not a block.
 */
function maybeRewardsCheckoutReversalTrustFlag({ thresholds, buyerUserId, ledgerEntryId, reasonLabel }) {
  if (!thresholds.enabled || !thresholds.rewardsCheckoutReversalFlag) {
    return null;
  }
  const buyer = Number(buyerUserId);
  const lid = Number(ledgerEntryId);
  if (!Number.isInteger(buyer) || buyer < 1 || !Number.isInteger(lid) || lid < 1) {
    return null;
  }
  return {
    domain: "rewards",
    flagType: "rewards_checkout_redemption_reversed",
    severity: "info",
    subjectUserId: buyer,
    relatedEntityType: "reward_ledger_entry",
    relatedEntityId: String(lid),
    metadata: { reasonLabel: String(reasonLabel || "").slice(0, 64) }
  };
}

async function tryRecordTrustFlag(config, trustFlagService, candidate) {
  if (!candidate || !trustFlagService || typeof trustFlagService.recordFlag !== "function") {
    return;
  }
  await trustFlagService.recordFlag(config, candidate);
}

module.exports = {
  maybeRewardsCheckoutHighDiscountTrustFlag,
  maybeCommerceLargeOrderTrustFlag,
  maybeSellerBoostHighSpendTrustFlag,
  maybeReferralQualifiedClawbackTrustFlag,
  maybeRewardsCheckoutReversalTrustFlag,
  tryRecordTrustFlag
};
