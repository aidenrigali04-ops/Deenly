/**
 * Mirrors shared/rewards/rules/checkout-redemption.ts + redemption-eligibility.ts
 * (backend has no TS pipeline for shared imports).
 */

function evaluateRedemptionEligibility(request, snapshot, cfg) {
  const deny = [];
  const amt = Math.floor(request.pointsMinor);
  if (amt <= 0) {
    deny.push("non_positive_amount");
    return { allow: false, denyReasons: deny };
  }
  const r = cfg.redemption;
  if (snapshot.balanceMinor < r.minBalanceMinor) {
    deny.push("below_min_balance");
  }
  if (amt > r.maxPointsPerRedemptionMinor) {
    deny.push("above_max_per_redemption");
  }
  if (snapshot.lastRedemptionAtIso) {
    const last = Date.parse(snapshot.lastRedemptionAtIso);
    const now = Date.parse(request.requestedAtIso);
    if (Number.isFinite(last) && Number.isFinite(now)) {
      const hours = (now - last) / 3_600_000;
      if (hours < r.cooldownHoursBetweenRedemptions) {
        deny.push("cooldown_active");
      }
    }
  }
  if (amt > snapshot.balanceMinor) {
    deny.push("insufficient_balance");
  }
  return deny.length ? { allow: false, denyReasons: deny } : { allow: true, denyReasons: [] };
}

function planCheckoutProductRedemption(input, cfg) {
  const list = Math.floor(input.listPriceMinor);
  if (!input.redeemEnabled) {
    return {
      allow: true,
      denyReasons: [],
      pointsToSpend: 0,
      discountMinor: 0,
      chargedMinor: list
    };
  }
  if (!input.productRewardsEligible) {
    return {
      allow: false,
      denyReasons: ["product_not_eligible"],
      pointsToSpend: 0,
      discountMinor: 0,
      chargedMinor: list
    };
  }
  if (!Number.isFinite(list) || list < 1) {
    return {
      allow: false,
      denyReasons: ["no_discount_room"],
      pointsToSpend: 0,
      discountMinor: 0,
      chargedMinor: Math.max(0, list)
    };
  }

  const { minOrderAmountRemainingMinor, maxCheckoutDiscountBps, pointsPerFiatMinorUnit } = cfg.redemption;
  if (
    !Number.isFinite(minOrderAmountRemainingMinor) ||
    minOrderAmountRemainingMinor < 0 ||
    !Number.isFinite(maxCheckoutDiscountBps) ||
    maxCheckoutDiscountBps < 0 ||
    maxCheckoutDiscountBps > 10_000 ||
    !Number.isInteger(pointsPerFiatMinorUnit) ||
    pointsPerFiatMinorUnit < 1
  ) {
    return {
      allow: false,
      denyReasons: ["no_discount_room"],
      pointsToSpend: 0,
      discountMinor: 0,
      chargedMinor: list
    };
  }

  const maxDiscountByBps = Math.floor((list * maxCheckoutDiscountBps) / 10_000);
  const maxDiscountByFloor = Math.max(0, list - Math.floor(minOrderAmountRemainingMinor));
  const maxDiscountMinor = Math.min(maxDiscountByBps, maxDiscountByFloor);

  if (maxDiscountMinor <= 0) {
    return {
      allow: false,
      denyReasons: ["below_min_order_after_discount"],
      pointsToSpend: 0,
      discountMinor: 0,
      chargedMinor: list
    };
  }

  const maxPointsFromOrder = maxDiscountMinor * pointsPerFiatMinorUnit;
  const requestedRaw =
    input.requestedPointsMinor == null || input.requestedPointsMinor === 0
      ? maxPointsFromOrder
      : Math.floor(Number(input.requestedPointsMinor));

  const pointsBudget = Math.min(
    maxPointsFromOrder,
    input.snapshot.balanceMinor,
    cfg.redemption.maxPointsPerRedemptionMinor
  );

  let pointsToSpend = Math.max(0, Math.min(requestedRaw, pointsBudget));
  let discountMinor = Math.floor(pointsToSpend / pointsPerFiatMinorUnit);
  discountMinor = Math.min(discountMinor, maxDiscountMinor);
  pointsToSpend = discountMinor * pointsPerFiatMinorUnit;

  if (pointsToSpend <= 0 || discountMinor <= 0) {
    return {
      allow: false,
      denyReasons: ["no_discount_room"],
      pointsToSpend: 0,
      discountMinor: 0,
      chargedMinor: list
    };
  }

  const chargedMinor = list - discountMinor;
  if (chargedMinor < Math.floor(minOrderAmountRemainingMinor)) {
    return {
      allow: false,
      denyReasons: ["below_min_order_after_discount"],
      pointsToSpend: 0,
      discountMinor: 0,
      chargedMinor: list
    };
  }

  if (discountMinor > maxDiscountByBps) {
    return {
      allow: false,
      denyReasons: ["above_checkout_discount_cap"],
      pointsToSpend: 0,
      discountMinor: 0,
      chargedMinor: list
    };
  }

  const eligibility = evaluateRedemptionEligibility(
    { pointsMinor: pointsToSpend, requestedAtIso: input.requestedAtIso },
    input.snapshot,
    cfg
  );

  if (!eligibility.allow) {
    return {
      allow: false,
      denyReasons: [...eligibility.denyReasons],
      pointsToSpend: 0,
      discountMinor: 0,
      chargedMinor: list
    };
  }

  return {
    allow: true,
    denyReasons: [],
    pointsToSpend,
    discountMinor,
    chargedMinor
  };
}

module.exports = {
  evaluateRedemptionEligibility,
  planCheckoutProductRedemption
};
