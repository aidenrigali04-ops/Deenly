export type {
  AntiFarmingSignals,
  CapSnapshot,
  EarnActionKey,
  EngagementFacts,
  NonEarningSurfaceKey,
  RedemptionDecision,
  RedemptionDenyReasonCode,
  RedemptionRequest,
  RedemptionSnapshot,
  RefundDisputeFacts,
  ReversalLine,
  ReversalPlan,
  RuleDecision,
  RuleDenyReasonCode
} from "./types";

export { EARN_ACTION_KEYS, NON_EARNING_SURFACE_KEYS } from "./types";

export type {
  EarnActionPointsTable,
  RewardsRulesAntiFarmingConfig,
  RewardsRulesCapsConfig,
  RewardsRulesConfig,
  RewardsRulesEarnConfig,
  RewardsRulesRedemptionConfig,
  RewardsRulesReversalConfig
} from "./config";

export {
  DEFAULT_REWARDS_RULES_CONFIG,
  REWARDS_RULES_ENGINE_VERSION,
  listEarnActionKeys,
  mergeRewardsRulesConfig
} from "./config";

export { validateRewardsRulesConfig } from "./validate-rules-config";

export { applyEarnCaps } from "./caps";
export type { CapApplyResult, CapApplied } from "./caps";

export { evaluateAntiFarming } from "./anti-farming";
export type { AntiFarmingResult } from "./anti-farming";

export {
  computeRatioClawbackTargetMinor,
  computeRefundClawbackTargetMinor,
  netClawbackCeilingMinor,
  pickRefundClawbackRatio,
  planReversalsForRefund,
  remainingGrantAfterReversalsMinor
} from "./reversal";

export { mergeAntiFarmingSignals } from "./signals";

export { earnActionToRewardEarnReasonKey } from "./ledger-reason";

export {
  computeRawEarnAmount,
  denyReasonsWhenGrantBlockedByCaps,
  evaluateEarnEligibility,
  evaluateEarnPipeline,
  evaluateRedemptionEligibility,
  isEarnActionKey,
  isNonEarningSurfaceKey
} from "./engine";

export { planCheckoutProductRedemption } from "./checkout-redemption";
export type { CheckoutProductRedemptionInput, CheckoutProductRedemptionPlan } from "./checkout-redemption";

export type { CheckoutCompletedHookFacts, CheckoutRefundHookFacts } from "./hooks";
