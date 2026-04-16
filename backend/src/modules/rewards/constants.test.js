const C = require("./constants");

describe("reward constants", () => {
  const exports = Object.keys(C);

  it("exports expected domain enums", () => {
    const required = [
      "TIERS",
      "TIER_ORDER",
      "LEDGER_TYPES",
      "LEDGER_CREDIT_SOURCES",
      "LEDGER_DEBIT_SOURCES",
      "LEDGER_SOURCES",
      "REFERRAL_STATUSES",
      "CHALLENGE_TYPES",
      "CHALLENGE_STATUSES",
      "BOOST_TYPES",
      "BOOST_STATUSES",
      "TRUST_BANDS",
      "FRAUD_FLAG_TYPES",
      "FRAUD_SEVERITIES",
      "FRAUD_FLAG_STATUSES",
      "ADMIN_ACTION_TYPES",
      "SHARE_CHANNELS",
    ];
    for (const name of required) {
      expect(exports).toContain(name);
    }
  });

  it("all array exports are frozen", () => {
    for (const name of exports) {
      const value = C[name];
      if (Array.isArray(value) || (value && typeof value === "object")) {
        expect(Object.isFrozen(value)).toBe(true);
      }
    }
  });

  it("array members are unique within each enum", () => {
    for (const name of exports) {
      const value = C[name];
      if (Array.isArray(value)) {
        expect(new Set(value).size).toBe(value.length);
      }
    }
  });

  it("TIER_ORDER indexes match TIERS positions", () => {
    C.TIERS.forEach((tier, idx) => {
      expect(C.TIER_ORDER[tier]).toBe(idx);
    });
  });

  it("LEDGER_SOURCES equals credit + debit union", () => {
    expect(C.LEDGER_SOURCES).toEqual([
      ...C.LEDGER_CREDIT_SOURCES,
      ...C.LEDGER_DEBIT_SOURCES,
    ]);
  });

  it("TRUST_BANDS are the 5 expected bands (aligned with DB CHECK constraint)", () => {
    // NOTE: These values match the CHECK constraint in the trust_profiles migration.
    // The reward-trust.js `scoreToBand` currently returns a different vocabulary
    // (excellent/good/fair/poor/high_risk) — tracked as a separate reconciliation task.
    expect(C.TRUST_BANDS).toEqual([
      "critical",
      "low",
      "new",
      "good",
      "excellent",
    ]);
  });

  it("MAX_REFERRAL_HOLD_EXTENSIONS is a positive integer", () => {
    expect(Number.isInteger(C.MAX_REFERRAL_HOLD_EXTENSIONS)).toBe(true);
    expect(C.MAX_REFERRAL_HOLD_EXTENSIONS).toBeGreaterThan(0);
  });
});
