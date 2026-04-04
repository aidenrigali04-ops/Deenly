export type PayoutConnectFields = {
  connected?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
};

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

export function getPayoutSetupCopy(c: PayoutConnectFields | undefined) {
  const phase = getPayoutSetupPhase(c);
  const payoutsOk = Boolean(c?.payoutsEnabled);

  if (phase === "ready") {
    return {
      phase,
      headline: "You're set up to get paid",
      subline: payoutsOk
        ? "Buyers can check out and payouts can reach your bank."
        : "Charges are on; Stripe may still be finalizing payout timing—tap “Update bank info” if you need to check.",
      step1Label: "Start payout setup",
      step1Body: "Create your secure payout profile (one tap).",
      step2Label: "Bank account & verify",
      step2Body: "Short Stripe form: identity and bank. Return here when done.",
      primaryActionHint: null as string | null
    };
  }

  if (phase === "need_bank") {
    return {
      phase,
      headline: "Almost there — finish on the secure form",
      subline:
        "Stripe needs your bank and identity once. About five minutes; you can pause and continue later.",
      step1Label: "Start payout setup",
      step1Body: "Create your secure payout profile (one tap).",
      step2Label: "Bank account & verify",
      step2Body: "Short Stripe form: identity and bank. Return here when done.",
      primaryActionHint: "Continue setup (~5 min)"
    };
  }

  return {
    phase,
    headline: "Get paid when you sell",
    subline:
      "Two quick steps, one time. Money is handled safely by Stripe—you don’t need a separate Stripe signup first.",
    step1Label: "Start payout setup",
    step1Body: "Create your secure payout profile (one tap).",
    step2Label: "Bank account & verify",
    step2Body: "Short Stripe form: identity and bank. Return here when done.",
    primaryActionHint: "Start getting paid"
  };
}
