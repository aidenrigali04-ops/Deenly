import {
  BOOSTS_DOMAIN_CONFIG,
  DEFAULT_REWARDS_GROWTH_BUNDLE,
  RANKING_MODIFIERS_DOMAIN_CONFIG,
  REFERRALS_DOMAIN_CONFIG,
  REWARDS_DOMAIN_CONFIG,
  validateBoostsDomainConfig,
  validateRankingModifiersDomainConfig,
  validateReferralsDomainConfig,
  validateRewardsDomainConfig,
  validateRewardsGrowthBundle
} from "@/lib/rewards";

describe("rewards domain config", () => {
  it("validates bundled defaults", () => {
    expect(validateRewardsGrowthBundle(DEFAULT_REWARDS_GROWTH_BUNDLE)).toEqual({ ok: true });
  });

  it("validates each slice independently", () => {
    expect(validateRewardsDomainConfig(REWARDS_DOMAIN_CONFIG)).toEqual({ ok: true });
    expect(validateReferralsDomainConfig(REFERRALS_DOMAIN_CONFIG)).toEqual({ ok: true });
    expect(validateBoostsDomainConfig(BOOSTS_DOMAIN_CONFIG)).toEqual({ ok: true });
    expect(validateRankingModifiersDomainConfig(RANKING_MODIFIERS_DOMAIN_CONFIG)).toEqual({ ok: true });
  });

  it("rejects invalid rewards config", () => {
    const bad = { ...REWARDS_DOMAIN_CONFIG, minGrantMinor: 9999, maxSingleGrantMinor: 1 };
    const r = validateRewardsDomainConfig(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i: { path: string }) => i.path === "rewards")).toBe(true);
    }
  });

  it("rejects duplicate ranking modifier keys", () => {
    const bad = {
      ...RANKING_MODIFIERS_DOMAIN_CONFIG,
      entries: [
        ...RANKING_MODIFIERS_DOMAIN_CONFIG.entries,
        RANKING_MODIFIERS_DOMAIN_CONFIG.entries[0]
      ]
    };
    const r = validateRankingModifiersDomainConfig(bad);
    expect(r.ok).toBe(false);
  });
});
