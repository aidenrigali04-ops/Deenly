/**
 * Buyer-facing rewards read API response shapes (align with `shared/rewards/api-dto.ts`).
 *
 * @typedef {0 | 2 | 3} RewardsPointsDecimals
 */

const { buildLedgerReadProjection, buildWalletDisplayDto } = require("./rewards-ledger-read-projection");

/**
 * @typedef {object} RewardsWalletMeDto
 * @property {string} balancePoints
 * @property {string} currencyCode
 * @property {RewardsPointsDecimals} pointsDecimals
 * @property {string | null} lastCatalogCheckoutRedemptionAt
 * @property {object} display Stable i18n keys for wallet chrome (additive).
 */

/**
 * @typedef {object} RewardsLedgerEntryDto
 * @property {number} id
 * @property {number} rewardAccountId
 * @property {string} deltaPoints
 * @property {'earn' | 'spend' | 'reversal'} entryKind
 * @property {string} reason
 * @property {string} idempotencyKey
 * @property {object} metadata
 * @property {number | null} reversesLedgerEntryId
 * @property {string} createdAt
 * @property {string} ledgerReasonKey
 * @property {string | null} resolvedEarnAction
 * @property {object | null} source
 * @property {object} display
 * @property {object | null} reversalOf
 * @property {object | null} redemption
 */

/**
 * @typedef {object} RewardsLedgerPageDto
 * @property {RewardsLedgerEntryDto[]} items
 * @property {string | null} nextCursor
 */

const LEDGER_KINDS = new Set(["earn", "spend", "reversal"]);

/**
 * @param {number} dec
 * @returns {RewardsPointsDecimals}
 */
function normalizePointsDecimals(dec) {
  if (dec === 2 || dec === 3) {
    return dec;
  }
  return 0;
}

/**
 * @param {object} input
 * @param {string} input.balancePoints
 * @param {string} input.currencyCode
 * @param {number} input.pointsDecimals
 * @param {string | null} input.lastCatalogCheckoutRedemptionAt
 * @returns {RewardsWalletMeDto}
 */
function toRewardsWalletMeDto(input) {
  return {
    balancePoints: String(input.balancePoints),
    currencyCode: String(input.currencyCode),
    pointsDecimals: normalizePointsDecimals(Number(input.pointsDecimals)),
    lastCatalogCheckoutRedemptionAt:
      input.lastCatalogCheckoutRedemptionAt == null || input.lastCatalogCheckoutRedemptionAt === ""
        ? null
        : String(input.lastCatalogCheckoutRedemptionAt),
    display: buildWalletDisplayDto()
  };
}

/**
 * @param {object} row — serialized ledger row from {@link createRewardsLedgerService} (camelCase keys).
 * @returns {RewardsLedgerEntryDto}
 */
function toRewardsLedgerEntryDto(row) {
  const rawKind = String(row.entryKind || "");
  if (!LEDGER_KINDS.has(rawKind)) {
    throw new TypeError(`Invalid ledger entryKind: ${rawKind}`);
  }
  const rev = row.reversesLedgerEntryId;
  const base = {
    id: Number(row.id),
    rewardAccountId: Number(row.rewardAccountId),
    deltaPoints: String(row.deltaPoints),
    entryKind: rawKind,
    reason: String(row.reason),
    idempotencyKey: String(row.idempotencyKey),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    reversesLedgerEntryId: rev == null ? null : Number(rev),
    createdAt: String(row.createdAt || "")
  };
  const projection = buildLedgerReadProjection(base);
  return { ...base, ...projection };
}

/**
 * @param {{ items: object[], nextCursor: string | null }} page
 * @returns {RewardsLedgerPageDto}
 */
function toRewardsLedgerPageDto(page) {
  return {
    items: page.items.map(toRewardsLedgerEntryDto),
    nextCursor: page.nextCursor == null ? null : String(page.nextCursor)
  };
}

module.exports = {
  toRewardsWalletMeDto,
  toRewardsLedgerEntryDto,
  toRewardsLedgerPageDto,
  normalizePointsDecimals,
  buildLedgerReadProjection,
  buildWalletDisplayDto
};
