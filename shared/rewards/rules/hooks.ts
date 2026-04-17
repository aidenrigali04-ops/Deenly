/**
 * Integration contracts for later checkout / Stripe wiring — no I/O here.
 * Orchestrators map webhooks and DB rows into these shapes, then call the rules engine.
 */

import type { RewardMinorAmount } from "../types";

/** Future: populated from `checkout.session.completed` + internal order row. */
export interface CheckoutCompletedHookFacts {
  readonly buyerUserId: number;
  readonly orderId: number;
  readonly completedAtIso: string;
  readonly currency: string;
  readonly amountPaidMinor: number;
}

/** Future: `charge.refunded`, `charge.dispute.created`, etc. */
export interface CheckoutRefundHookFacts {
  readonly buyerUserId: number;
  readonly orderId: number;
  readonly occurredAtIso: string;
  readonly isFullRefund: boolean;
  readonly isChargeback: boolean;
  readonly originalRewardGrantMinor?: RewardMinorAmount;
  readonly originalGrantAtIso?: string;
}
