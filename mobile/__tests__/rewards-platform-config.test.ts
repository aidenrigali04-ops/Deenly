import {
  DEFAULT_BOOSTS_CAMPAIGN_DOMAIN_CONFIG,
  DEFAULT_DEENLY_REWARDS_PLATFORM_CONFIG,
  DEFAULT_FEED_RANKING_MODIFIER_CAPS_CONFIG,
  DEFAULT_TRUST_SIGNALS_DOMAIN_CONFIG,
  validateBoostsCampaignDomainConfig,
  validateDeenlyRewardsPlatformConfig,
  validateFeedRankingModifierCapsConfig,
  validateTrustSignalsDomainConfig
} from "@/lib/rewards";

describe("Deenly rewards platform config (shared)", () => {
  it("validates bundled platform defaults", () => {
    expect(validateDeenlyRewardsPlatformConfig(DEFAULT_DEENLY_REWARDS_PLATFORM_CONFIG)).toEqual({ ok: true });
  });

  it("validates trust, boost campaign, and feed cap slices", () => {
    expect(validateTrustSignalsDomainConfig(DEFAULT_TRUST_SIGNALS_DOMAIN_CONFIG)).toEqual({ ok: true });
    expect(validateBoostsCampaignDomainConfig(DEFAULT_BOOSTS_CAMPAIGN_DOMAIN_CONFIG)).toEqual({ ok: true });
    expect(validateFeedRankingModifierCapsConfig(DEFAULT_FEED_RANKING_MODIFIER_CAPS_CONFIG)).toEqual({ ok: true });
  });

  it("rejects trust config with empty disposable list", () => {
    const bad = { ...DEFAULT_TRUST_SIGNALS_DOMAIN_CONFIG, disposableEmailDomains: [] };
    const r = validateTrustSignalsDomainConfig(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects feed caps that violate non-pay-to-win boost dominance", () => {
    const bad = {
      ...DEFAULT_FEED_RANKING_MODIFIER_CAPS_CONFIG,
      capBoostTierAdditive: 100,
      combinedPositiveCap: 72,
      boostMaxFractionOfCombined: 0.38
    };
    const r = validateFeedRankingModifierCapsConfig(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects boost campaign when max duration is below min", () => {
    const bad = {
      ...DEFAULT_BOOSTS_CAMPAIGN_DOMAIN_CONFIG,
      minCampaignDurationDays: 30,
      maxCampaignDurationDays: 7
    };
    const r = validateBoostsCampaignDomainConfig(bad);
    expect(r.ok).toBe(false);
  });
});
