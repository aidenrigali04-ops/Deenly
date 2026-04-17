/**
 * Seller-paid organic rank assist tiers (pricing/duration/modifier metadata).
 * Feed SQL applies rankModifierPoints elsewhere — this module is config only.
 *
 * Centralized catalog: add tiers here and mirror tier ids in
 * {@link buildSellerBoostTierPointsCaseSql} / migrations if needed. Modifier **caps** for unrelated
 * feed signals live in shared `DEFAULT_FEED_RANKING_MODIFIER_CAPS_CONFIG`; this catalog owns
 * seller-boost SKU pricing and per-tier `rankModifierPoints` (then clamped by env cap).
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

/**
 * SQL fragment: CASE sbp.package_tier_id … END (for SUM in feed query).
 * Uses the same env-driven cap as {@link createSellerBoostTierResolver} for `rankModifierPoints`.
 * @param {object} [config] from {@link loadEnv}
 */
function buildSellerBoostTierPointsCaseSql(config = {}) {
  const resolveTier = createSellerBoostTierResolver(config);
  const arms = listSellerBoostTiers()
    .map((t) => {
      const resolved = resolveTier(t.id);
      const raw = resolved ? Number(resolved.rankModifierPoints) : 0;
      const pts = Number.isFinite(raw) && raw >= 0 ? raw : 0;
      return `WHEN '${t.id}' THEN ${pts}::numeric`;
    })
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
