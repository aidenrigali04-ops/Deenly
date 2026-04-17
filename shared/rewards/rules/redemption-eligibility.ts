import type { RewardsRulesConfig } from "./config";
import type { RedemptionDecision, RedemptionDenyReasonCode, RedemptionRequest, RedemptionSnapshot } from "./types";

export function evaluateRedemptionEligibility(
  request: RedemptionRequest,
  snapshot: RedemptionSnapshot,
  cfg: RewardsRulesConfig
): RedemptionDecision {
  const deny: RedemptionDenyReasonCode[] = [];
  if (snapshot.rewardsFrozen === true) {
    deny.push("rewards_frozen");
    return { allow: false, denyReasons: deny };
  }
  const amt = Math.floor(request.pointsMinor);
  if (amt <= 0) {
    deny.push("non_positive_amount");
    return { allow: false, denyReasons: deny };
  }
  if (snapshot.balanceMinor < cfg.redemption.minBalanceMinor) {
    deny.push("below_min_balance");
  }
  if (amt > cfg.redemption.maxPointsPerRedemptionMinor) {
    deny.push("above_max_per_redemption");
  }
  if (snapshot.lastRedemptionAtIso) {
    const last = Date.parse(snapshot.lastRedemptionAtIso);
    const now = Date.parse(request.requestedAtIso);
    if (Number.isFinite(last) && Number.isFinite(now)) {
      const hours = (now - last) / 3_600_000;
      if (hours < cfg.redemption.cooldownHoursBetweenRedemptions) {
        deny.push("cooldown_active");
      }
    }
  }
  if (amt > snapshot.balanceMinor) {
    deny.push("insufficient_balance");
  }
  return deny.length ? { allow: false, denyReasons: deny } : { allow: true, denyReasons: [] };
}
