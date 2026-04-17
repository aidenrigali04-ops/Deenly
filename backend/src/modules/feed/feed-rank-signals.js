/**
 * Ranking signal ingestion / refresh hooks.
 * Engagement is sourced from post_views + interactions; commerce from orders + creator_products.
 * Swap ingestRankingSignalsStub for ledger-backed updates when a dedicated signals store exists.
 */

const SIGNAL_SCHEMA_VERSION = 1;

async function ingestRankingSignalsStub(_ctx = {}) {
  return { ok: true, skipped: true, schemaVersion: SIGNAL_SCHEMA_VERSION };
}

module.exports = {
  SIGNAL_SCHEMA_VERSION,
  ingestRankingSignalsStub
};
