import type { ConnectStatus } from "@/lib/monetization";

/** Minimal connect fields for payout UX (matches API + mobile type). */
export type PayoutConnectFields = Pick<
  ConnectStatus,
  "connected" | "chargesEnabled" | "payoutsEnabled" | "detailsSubmitted"
>;

export function isPayoutSetupComplete(c: PayoutConnectFields | undefined): boolean {
  return Boolean(c?.connected && c?.detailsSubmitted && c?.chargesEnabled);
}

export type PayoutSetupPhase = "need_account" | "need_bank" | "ready";

export function getPayoutSetupPhase(c: PayoutConnectFields | undefined): PayoutSetupPhase {
  if (!c?.connected) {
    return "need_account";
  }
  if (!isPayoutSetupComplete(c)) {
    return "need_bank";
  }
  return "ready";
}

/** Two-step user journey + optional payout-ready nuance for support text. */
export function getPayoutSetupCopy(c: PayoutConnectFields | undefined) {
  const phase = getPayoutSetupPhase(c);
  const payoutsOk = Boolean(c?.payoutsEnabled);

  if (phase === "ready") {
    return {
      phase,
      headline: "You're set up to get paid",
      subline: payoutsOk
        ? "Buyers can check out and payouts can reach your bank."
        : "Charges are on; Stripe may still be finalizing your first payout timing—check back or use “Update bank info” if needed.",
      step1Label: "Start payout setup",
      step1Body: "Create your secure payout profile (one tap).",
      step2Label: "Bank account & verify",
      step2Body: "Short Stripe form: identity and bank. You return here when done.",
      primaryActionHint: null as string | null
    };
  }

  if (phase === "need_bank") {
    return {
      phase,
      headline: "Almost there — finish on the secure form",
      subline:
        "Stripe needs your bank and identity once (required by law). Takes about five minutes; you can pause and continue later.",
      step1Label: "Start payout setup",
      step1Body: "Create your secure payout profile (one tap).",
      step2Label: "Bank account & verify",
      step2Body: "Short Stripe form: identity and bank. You return here when done.",
      primaryActionHint: "Continue secure setup (~5 min)"
    };
  }

  return {
    phase,
    headline: "Get paid when you sell",
    subline:
      "Two quick steps, one time. We use Stripe to move money safely—you won’t need a separate Stripe account before you start.",
    step1Label: "Start payout setup",
    step1Body: "Create your secure payout profile (one tap).",
    step2Label: "Bank account & verify",
    step2Body: "Short Stripe form: identity and bank. You return here when done.",
    primaryActionHint: "Start getting paid"
  };
}
