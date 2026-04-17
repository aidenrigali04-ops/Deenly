const { getTrustSignalThresholds } = require("../src/modules/trust/trust-signal-thresholds");
const {
  maybeRewardsCheckoutHighDiscountTrustFlag,
  maybeCommerceLargeOrderTrustFlag,
  maybeSellerBoostHighSpendTrustFlag,
  maybeReferralQualifiedClawbackTrustFlag,
  maybeRewardsCheckoutReversalTrustFlag,
  tryRecordTrustFlag
} = require("../src/modules/trust/trust-surface-flag-builders");

describe("trust-surface-flag-builders", () => {
  const enabled = getTrustSignalThresholds({ trustSignalsEnabled: true });

  it("maybeRewardsCheckoutHighDiscountTrustFlag fires when discount ratio meets bps", () => {
    const low = maybeRewardsCheckoutHighDiscountTrustFlag({
      thresholds: { ...enabled, rewardsCheckoutDiscountFlagBps: 9500 },
      buyerUserId: 1,
      productId: 9,
      listPriceMinor: 10000,
      discountMinor: 9400,
      pointsSpent: 9400,
      ledgerEntryId: 55
    });
    expect(low).toBeNull();
    const hit = maybeRewardsCheckoutHighDiscountTrustFlag({
      thresholds: { ...enabled, rewardsCheckoutDiscountFlagBps: 9000 },
      buyerUserId: 1,
      productId: 9,
      listPriceMinor: 10000,
      discountMinor: 9000,
      pointsSpent: 9000,
      ledgerEntryId: 55
    });
    expect(hit).toMatchObject({
      domain: "rewards",
      flagType: "rewards_checkout_high_discount_ratio",
      subjectUserId: 1,
      relatedEntityId: "55"
    });
    expect(hit.metadata.discountToListBps).toBe(9000);
  });

  it("maybeCommerceLargeOrderTrustFlag respects commerceOrderFlagMinor", () => {
    expect(
      maybeCommerceLargeOrderTrustFlag({
        thresholds: { ...enabled, commerceOrderFlagMinor: 1_000_000 },
        buyerUserId: 2,
        sellerUserId: 3,
        orderId: 40,
        productId: 5,
        amountMinor: 100
      })
    ).toBeNull();
    const f = maybeCommerceLargeOrderTrustFlag({
      thresholds: { ...enabled, commerceOrderFlagMinor: 100 },
      buyerUserId: 2,
      sellerUserId: 3,
      orderId: 40,
      productId: 5,
      amountMinor: 500
    });
    expect(f).toMatchObject({
      domain: "ranking",
      flagType: "commerce_large_completed_order",
      subjectUserId: 3,
      relatedEntityType: "order",
      relatedEntityId: "40"
    });
  });

  it("maybeSellerBoostHighSpendTrustFlag respects sellerBoostSpendFlagMinor", () => {
    expect(
      maybeSellerBoostHighSpendTrustFlag({
        thresholds: { ...enabled, sellerBoostSpendFlagMinor: 99999 },
        sellerUserId: 7,
        purchaseId: 12,
        amountMinor: 499
      })
    ).toBeNull();
    const f = maybeSellerBoostHighSpendTrustFlag({
      thresholds: { ...enabled, sellerBoostSpendFlagMinor: 400 },
      sellerUserId: 7,
      purchaseId: 12,
      amountMinor: 499
    });
    expect(f).toMatchObject({ domain: "boost", flagType: "seller_boost_high_spend", subjectUserId: 7 });
  });

  it("maybeReferralQualifiedClawbackTrustFlag respects referralClawbackFlagEnabled", () => {
    expect(
      maybeReferralQualifiedClawbackTrustFlag({
        thresholds: { ...enabled, referralClawbackFlagEnabled: false },
        referrerUserId: 9,
        attributionId: 3,
        orderId: 44,
        reason: "refunded"
      })
    ).toBeNull();
    const f = maybeReferralQualifiedClawbackTrustFlag({
      thresholds: enabled,
      referrerUserId: 9,
      attributionId: 3,
      orderId: 44,
      reason: "refunded"
    });
    expect(f).toMatchObject({
      domain: "referral",
      flagType: "referral_qualified_payout_clawed_back",
      severity: "medium",
      subjectUserId: 9
    });
  });

  it("maybeRewardsCheckoutReversalTrustFlag can be disabled", () => {
    expect(
      maybeRewardsCheckoutReversalTrustFlag({
        thresholds: { ...enabled, rewardsCheckoutReversalFlag: false },
        buyerUserId: 1,
        ledgerEntryId: 9,
        reasonLabel: "checkout_refund"
      })
    ).toBeNull();
  });

  it("tryRecordTrustFlag invokes recordFlag when candidate present", async () => {
    const recordFlag = jest.fn(async () => ({ saved: { id: 1 } }));
    await tryRecordTrustFlag(
      { trustSignalsEnabled: true },
      { recordFlag },
      { domain: "rewards", flagType: "rewards_checkout_redemption_reversed", severity: "info", subjectUserId: 1 }
    );
    expect(recordFlag).toHaveBeenCalledTimes(1);
  });
});
