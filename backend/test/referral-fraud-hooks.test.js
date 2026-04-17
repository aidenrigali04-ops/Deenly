const {
  normalizeReferralCode,
  isSelfReferral,
  assertNoSelfReferralOrThrow,
  evaluateAttributionFraudRisk,
  defaultDuplicateAccountGuard
} = require("../src/modules/referrals/referral-fraud-hooks");
const { SelfReferralError } = require("../src/modules/referrals/referral-errors");
const { getTrustSignalThresholds } = require("../src/modules/trust/trust-signal-thresholds");

describe("referral-fraud-hooks", () => {
  it("normalizeReferralCode trims and lowercases", () => {
    expect(normalizeReferralCode("  ABC  ")).toBe("abc");
  });

  it("isSelfReferral detects same user", () => {
    expect(isSelfReferral(1, 1)).toBe(true);
    expect(isSelfReferral(1, 2)).toBe(false);
  });

  it("assertNoSelfReferralOrThrow throws SelfReferralError", () => {
    expect(() => assertNoSelfReferralOrThrow(5, 5)).toThrow(SelfReferralError);
  });

  it("evaluateAttributionFraudRisk returns empty reviewSignals without thresholds", async () => {
    const r = await evaluateAttributionFraudRisk({
      refereeUserId: 1,
      referrerUserId: 2,
      referralCodeId: 3
    });
    expect(r.ok).toBe(true);
    expect(r.reviewSignals).toEqual([]);
  });

  it("evaluateAttributionFraudRisk blocks disposable referee when configured", async () => {
    const thresholds = getTrustSignalThresholds({
      trustSignalsEnabled: true,
      trustReferralBlockDisposableEmail: true
    });
    const r = await evaluateAttributionFraudRisk({
      thresholds,
      refereeEmail: "x@mailinator.com",
      referrerEmail: "y@other.com",
      refereeUserId: 10,
      referrerUserId: 20,
      referralCodeId: 30
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("disposable_referee_email");
  });

  it("evaluateAttributionFraudRisk uses injected duplicateAccountGuard", async () => {
    const guard = jest.fn(async () => ({
      ok: false,
      reasons: ["duplicate_account_blocked"],
      reviewSignals: []
    }));
    const r = await evaluateAttributionFraudRisk({
      refereeUserId: 1,
      referrerUserId: 2,
      referralCodeId: 3,
      duplicateAccountGuard: guard
    });
    expect(r.ok).toBe(false);
    expect(guard).toHaveBeenCalled();
    expect(r.reasons).toContain("duplicate_account_blocked");
  });

  it("evaluateAttributionFraudRisk returns review signals for same-domain emails", async () => {
    const thresholds = getTrustSignalThresholds({
      trustSignalsEnabled: true,
      trustReferralFlagSameEmailDomain: true
    });
    const r = await evaluateAttributionFraudRisk({
      thresholds,
      refereeEmail: "a@example.org",
      referrerEmail: "b@example.org",
      refereeUserId: 10,
      referrerUserId: 20,
      referralCodeId: 30
    });
    expect(r.ok).toBe(true);
    expect(r.reviewSignals.some((s) => s.flagType === "referral_same_email_domain")).toBe(true);
  });

  it("defaultDuplicateAccountGuard allows attribution", async () => {
    const r = await defaultDuplicateAccountGuard({ refereeUserId: 1, referrerUserId: 2 });
    expect(r.ok).toBe(true);
  });

  it("evaluateAttributionFraudRisk blocks when duplicateAccountGuard fails", async () => {
    const r = await evaluateAttributionFraudRisk({
      refereeUserId: 1,
      referrerUserId: 2,
      referralCodeId: 3,
      duplicateAccountGuard: async () => ({ ok: false, reasons: ["duplicate_account_blocked"] })
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("duplicate_account_blocked");
  });

  it("evaluateAttributionFraudRisk merges reviewSignals from duplicateAccountGuard", async () => {
    const thresholds = getTrustSignalThresholds({
      trustSignalsEnabled: true,
      trustReferralFlagSameEmailDomain: true
    });
    const r = await evaluateAttributionFraudRisk({
      thresholds,
      duplicateAccountGuard: async () => ({
        ok: true,
        reviewSignals: [{ flagType: "dup_stub_review", severity: "low", subjectUserId: 10, metadata: {} }]
      }),
      refereeEmail: "a@example.org",
      referrerEmail: "b@example.org",
      refereeUserId: 10,
      referrerUserId: 20,
      referralCodeId: 30
    });
    expect(r.ok).toBe(true);
    expect(r.reviewSignals.some((s) => s.flagType === "dup_stub_review")).toBe(true);
    expect(r.reviewSignals.some((s) => s.flagType === "referral_same_email_domain")).toBe(true);
  });
});
