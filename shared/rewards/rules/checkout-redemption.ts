import type { RewardsRulesConfig } from "./config";
import { evaluateRedemptionEligibility } from "./redemption-eligibility";
import type { RedemptionDenyReasonCode, RedemptionSnapshot } from "./types";
import type { RewardMinorAmount } from "../types";

export interface CheckoutProductRedemptionInput {
  readonly listPriceMinor: RewardMinorAmount;
  readonly productRewardsEligible: boolean;
  /** When false, skip points (no spend, full list price). */
  readonly redeemEnabled: boolean;
  /**
   * Points to apply when `redeemEnabled` is true.
   * Omit or null to maximize within caps; a positive integer applies up to that amount (clamped).
   */
  readonly requestedPointsMinor?: RewardMinorAmount | null;
  readonly snapshot: RedemptionSnapshot;
  readonly requestedAtIso: string;
}

export interface CheckoutProductRedemptionPlan {
  readonly allow: boolean;
  readonly denyReasons: readonly RedemptionDenyReasonCode[];
  readonly pointsToSpend: RewardMinorAmount;
  readonly discountMinor: RewardMinorAmount;
  readonly chargedMinor: RewardMinorAmount;
}

/**
 * Pure checkout redemption planner — ledger I/O stays in the backend orchestrator.
 */
export function planCheckoutProductRedemption(
  input: CheckoutProductRedemptionInput,
  cfg: RewardsRulesConfig
): CheckoutProductRedemptionPlan {
  const deny: RedemptionDenyReasonCode[] = [];
  if (input.snapshot.rewardsFrozen === true) {
    return {
      allow: false,
      denyReasons: ["rewards_frozen"],
      pointsToSpend: 0,
      discountMinor: 0,
      chargedMinor: Math.max(0, Math.floor(input.listPriceMinor))
    };
  }
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
    deny.push("no_discount_room");
    return { allow: false, denyReasons: deny, pointsToSpend: 0, discountMinor: 0, chargedMinor: Math.max(0, list) };
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
    deny.push("no_discount_room");
    return { allow: false, denyReasons: deny, pointsToSpend: 0, discountMinor: 0, chargedMinor: list };
  }

  const maxDiscountByBps = Math.floor((list * maxCheckoutDiscountBps) / 10_000);
  const maxDiscountByFloor = Math.max(0, list - Math.floor(minOrderAmountRemainingMinor));
  const maxDiscountMinor = Math.min(maxDiscountByBps, maxDiscountByFloor);

  if (maxDiscountMinor <= 0) {
    deny.push("below_min_order_after_discount");
    return { allow: false, denyReasons: deny, pointsToSpend: 0, discountMinor: 0, chargedMinor: list };
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
