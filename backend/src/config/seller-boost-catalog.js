/**
 * Seller-paid organic rank assist tiers (pricing/duration/modifier metadata).
 * Feed SQL applies rankModifierPoints elsewhere — this module is config only.
 */
function listSellerBoostTiers() {
  return [
    {
      id: "seller_rank_assist_3d",
      label: "Rank assist (3 days)",
      description: "Adds a bounded bonus to organic feed ranking for attributed posts.",
      durationDays: 3,
      priceMinor: 499,
      currency: "usd",
      rankModifierPoints: 12
    },
    {
      id: "seller_rank_assist_7d",
      label: "Rank assist (7 days)",
      description: "Longer window for the same bounded ranking assist.",
      durationDays: 7,
      priceMinor: 999,
      currency: "usd",
      rankModifierPoints: 22
    },
    {
      id: "seller_rank_assist_14d",
      label: "Rank assist (14 days)",
      description: "Extended campaign for steady visibility support.",
      durationDays: 14,
      priceMinor: 1799,
      currency: "usd",
      rankModifierPoints: 35
    }
  ];
}

function getSellerBoostTierById(tierId) {
  const id = String(tierId || "").trim();
  if (!id) {
    return null;
  }
  return listSellerBoostTiers().find((t) => t.id === id) || null;
}

/**
 * Tier lookup with env-driven {@link config.sellerBoostRankModifierPointsCap} applied to `rankModifierPoints` only.
 * Does not change pricing/duration — those remain catalog-sourced.
 * @param {object} [config] from {@link loadEnv}
 * @returns {(tierId: string) => ReturnType<typeof getSellerBoostTierById>}
 */
function createSellerBoostTierResolver(config = {}) {
  const rawCap = Number(config.sellerBoostRankModifierPointsCap);
  const cap = Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 500;
  return function resolveTier(tierId) {
    const base = getSellerBoostTierById(tierId);
    if (!base) {
      return null;
    }
    const pts = Math.min(Number(base.rankModifierPoints), cap);
    return {
      ...base,
      rankModifierPoints: Number.isFinite(pts) && pts >= 0 ? pts : 0
    };
  };
}

/** SQL fragment: CASE sbp.package_tier_id … END (for SUM in feed query). */
function buildSellerBoostTierPointsCaseSql() {
  const arms = listSellerBoostTiers()
    .map((t) => `WHEN '${t.id}' THEN ${Number(t.rankModifierPoints)}::numeric`)
    .join("\n            ");
  return `CASE sbp.package_tier_id
            ${arms}
            ELSE 0::numeric
          END`;
}

module.exports = {
  listSellerBoostTiers,
  getSellerBoostTierById,
  createSellerBoostTierResolver,
  buildSellerBoostTierPointsCaseSql
};
