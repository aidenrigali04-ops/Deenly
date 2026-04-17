const { createRewardsLedgerRepository } = require("./rewards-ledger-repository");
const { buildRulesConfigFromAppConfig } = require("./rewards-checkout-service");
const { validateUserId } = require("./rewards-ledger-service");
const { toRewardsWalletMeDto, toRewardsLedgerPageDto } = require("./rewards-read-dto");

function noopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function createRewardsReadService({ db, rewardsLedgerService, config, analytics, logger, lastRedemptionQuery }) {
  const repository = createRewardsLedgerRepository();
  const log = logger && typeof logger.warn === "function" ? logger : noopLogger();
  const redemptionQuery =
    typeof lastRedemptionQuery === "function" ? lastRedemptionQuery : db.query.bind(db);

  function displayMeta() {
    const base = buildRulesConfigFromAppConfig(config).rewardsBase;
    const dec = base.pointsDecimals;
    const pointsDecimals = dec === 2 || dec === 3 ? dec : 0;
    return {
      currencyCode: String(base.currencyCode || "DEEN_PTS"),
      pointsDecimals
    };
  }

  async function trackEvent(eventName, payload) {
    if (!analytics || typeof analytics.trackEvent !== "function") {
      return;
    }
    try {
      await analytics.trackEvent(eventName, payload);
    } catch (err) {
      log.warn({ err, eventName }, "rewards_read_analytics_failed");
    }
  }

  /**
   * @param {{ userId: number }} params
   */
  async function getWalletMe({ userId }) {
    const uid = validateUserId(userId);
    const meta = displayMeta();
    const [bal, lastIso] = await Promise.all([
      rewardsLedgerService.getBalance({ userId: uid }),
      repository.getLastCatalogCheckoutRedemptionAt(redemptionQuery, uid)
    ]);
    const dto = toRewardsWalletMeDto({
      balancePoints: bal.balancePoints,
      currencyCode: meta.currencyCode,
      pointsDecimals: meta.pointsDecimals,
      lastCatalogCheckoutRedemptionAt: lastIso
    });
    await trackEvent("rewards_wallet_viewed", { userId: uid });
    return dto;
  }

  /**
   * @param {{ userId: number, cursor?: string | null, limit?: number }} params
   */
  async function getLedgerPage({ userId, cursor = null, limit = 20 }) {
    const uid = validateUserId(userId);
    const page = await rewardsLedgerService.getHistory({ userId: uid, cursor, limit });
    const dto = toRewardsLedgerPageDto(page);
    await trackEvent("rewards_ledger_viewed", {
      userId: uid,
      itemCount: dto.items.length,
      hasNext: Boolean(dto.nextCursor)
    });
    return dto;
  }

  return { getWalletMe, getLedgerPage };
}

module.exports = {
  createRewardsReadService
};
