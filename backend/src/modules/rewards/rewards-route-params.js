const { optionalString } = require("../../utils/validators");

/**
 * Parsed GET /rewards/ledger query (transport layer only).
 *
 * @typedef {object} RewardsLedgerQueryParams
 * @property {string | null} cursor
 * @property {number} limit
 */

/**
 * @param {object} [query]
 * @returns {RewardsLedgerQueryParams}
 */
function parseRewardsLedgerQuery(query = {}) {
  const cursor = optionalString(query.cursor, "cursor");
  const limitRaw = query.limit;
  let limit = 20;
  if (limitRaw != null && limitRaw !== "") {
    const n = Number(limitRaw);
    if (Number.isFinite(n)) {
      limit = Math.min(100, Math.max(1, Math.floor(n)));
    }
  }
  return { cursor: cursor || null, limit };
}

module.exports = {
  parseRewardsLedgerQuery
};
