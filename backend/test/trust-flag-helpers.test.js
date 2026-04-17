const {
  emailDomain,
  isDisposableEmailDomain,
  buildTrustFlagRow,
  assertValidTrustFlagRow,
  collectReferralReviewSignals,
  evaluateReferralHardBlock,
  DEFAULT_DISPOSABLE_DOMAINS
} = require("../src/modules/trust/trust-flag-helpers");
const { getTrustSignalThresholds } = require("../src/modules/trust/trust-signal-thresholds");

describe("trust-flag-helpers", () => {
  it("emailDomain extracts registrable part", () => {
    expect(emailDomain("  Foo@Example.COM ")).toBe("example.com");
    expect(emailDomain("nope")).toBe(null);
  });

  it("isDisposableEmailDomain respects list", () => {
    const list = ["mailinator.com"];
    expect(isDisposableEmailDomain("a@mailinator.com", list)).toBe(true);
    expect(isDisposableEmailDomain("a@example.com", list)).toBe(false);
  });

  it("buildTrustFlagRow + assertValidTrustFlagRow accept valid payload", () => {
    const row = buildTrustFlagRow({
      domain: "rewards",
      flagType: "rewards_large_earn",
      severity: "low",
      subjectUserId: 42,
      relatedEntityType: "reward_ledger_entry",
      relatedEntityId: "99",
      metadata: { k: 1 }
    });
    expect(() => assertValidTrustFlagRow(row)).not.toThrow();
    expect(row.domain).toBe("rewards");
    expect(row.flagType).toBe("rewards_large_earn");
  });

  it("assertValidTrustFlagRow rejects bad domain", () => {
    const row = buildTrustFlagRow({ domain: "nope", flagType: "x", severity: "low" });
    expect(() => assertValidTrustFlagRow(row)).toThrow(/invalid trust domain/);
  });

  it("collectReferralReviewSignals flags same email domain", () => {
    const thresholds = getTrustSignalThresholds({
      trustSignalsEnabled: true,
      trustReferralFlagSameEmailDomain: true
    });
    const signals = collectReferralReviewSignals({
      referrerEmail: "a@example.com",
      refereeEmail: "b@example.com",
      requestContext: { refereeUserId: 2, referralCodeId: 5 },
      thresholds
    });
    expect(signals.some((s) => s.flagType === "referral_same_email_domain")).toBe(true);
  });

  it("evaluateReferralHardBlock blocks disposable when enabled", () => {
    const thresholds = getTrustSignalThresholds({
      trustSignalsEnabled: true,
      trustReferralBlockDisposableEmail: true
    });
    expect(DEFAULT_DISPOSABLE_DOMAINS.length).toBeGreaterThan(0);
    const hb = evaluateReferralHardBlock({
      refereeEmail: `u@${DEFAULT_DISPOSABLE_DOMAINS[0]}`,
      thresholds
    });
    expect(hb.ok).toBe(false);
    expect(hb.reasons).toContain("disposable_referee_email");
  });
});
