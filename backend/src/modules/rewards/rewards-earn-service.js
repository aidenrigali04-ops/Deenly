const { createRewardsLedgerRepository } = require("./rewards-ledger-repository");
const { buildRulesConfigFromAppConfig } = require("./rewards-checkout-service");
const {
  serializeLedgerRow,
  validateUserId,
  validateIdempotencyKey
} = require("./rewards-ledger-service");

let _rulesEngineModule = null;
function loadRulesEngine() {
  if (!_rulesEngineModule) {
    // Built by backend postinstall (`scripts/postinstall-build-rewards.cjs` → shared/rewards `npm run build`).
    _rulesEngineModule = require("@deenly/rewards-shared");
  }
  return _rulesEngineModule;
}

function noopLogger() {
  return { info() {}, warn() {}, error() {} };
}

function utcDayBoundsIso(now) {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const start = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
  const next = new Date(Date.UTC(y, m, day + 1, 0, 0, 0, 0));
  return { startIso: start.toISOString(), endExclusiveIso: next.toISOString() };
}

function utcMonthBoundsIso(now) {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const next = m === 11 ? new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0, 0)) : new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  return { startIso: start.toISOString(), endExclusiveIso: next.toISOString() };
}

function minorFromEarnSumText(totalText) {
  try {
    const n = Number(BigInt(String(totalText || "0")));
    if (!Number.isFinite(n) || n < 0) {
      return 0;
    }
    return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n));
  } catch {
    return 0;
  }
}

/**
 * Default cap snapshot from immutable ledger (gross `earn` rows in UTC day / month).
 *
 * @param {object} deps
 * @param {ReturnType<typeof createRewardsLedgerRepository>} deps.repository
 * @param {function} deps.poolQuery
 * @param {number} deps.userId
 * @param {Date} [deps.now]
 */
async function defaultLoadCapSnapshotForUser({ repository, poolQuery, userId, now = new Date() }) {
  const accountId = await repository.getRewardAccountIdForUser(poolQuery, userId);
  if (!accountId) {
    return {
      dailyEarnedMinor: 0,
      monthlyEarnedMinor: 0,
      grantsLastHourCount: 0
    };
  }
  const day = utcDayBoundsIso(now);
  const month = utcMonthBoundsIso(now);
  const [daySum, monthSum] = await Promise.all([
    repository.sumEarnDeltaForAccountInUtcRange(poolQuery, accountId, day.startIso, day.endExclusiveIso),
    repository.sumEarnDeltaForAccountInUtcRange(poolQuery, accountId, month.startIso, month.endExclusiveIso)
  ]);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const grantsLastHourCount = await repository.countEarnEntriesForAccountSince(
    poolQuery,
    accountId,
    hourAgo
  );
  return {
    dailyEarnedMinor: minorFromEarnSumText(daySum),
    monthlyEarnedMinor: minorFromEarnSumText(monthSum),
    grantsLastHourCount
  };
}

function decisionFromDuplicateRow(ledgerEntry) {
  const meta = ledgerEntry.metadata && typeof ledgerEntry.metadata === "object" ? ledgerEntry.metadata : {};
  const resolved = meta.resolvedEarnAction != null ? String(meta.resolvedEarnAction) : "";
  const actionKey = meta.actionKey != null ? String(meta.actionKey) : resolved;
  let amountMinor = 0;
  try {
    amountMinor = Math.floor(Number(BigInt(String(ledgerEntry.deltaPoints))));
  } catch {
    amountMinor = 0;
  }
  return {
    allowGrant: true,
    amountMinor,
    rawAmountMinor: amountMinor,
    cappedBy: "none",
    denyReasons: [],
    meta: {
      actionKey,
      resolvedEarnAction: resolved || null,
      engineVersion: String(meta.engineVersion || "duplicate_replay")
    }
  };
}

/**
 * Orchestrates buyer earn: rules evaluation (shared engine) + immutable ledger append.
 *
 * @param {object} deps
 * @param {{ query: function }} deps.db
 * @param {object} deps.rewardsLedgerService Ledger service from {@link createRewardsLedgerService}
 * @param {object} deps.appConfig
 * @param {object} [deps.logger]
 * @param {ReturnType<typeof createRewardsLedgerRepository>} [deps.repository]
 * @param {typeof defaultLoadCapSnapshotForUser} [deps.loadCapSnapshotForUser]
 */
function createRewardsEarnService({
  db,
  rewardsLedgerService,
  appConfig,
  logger,
  repository: repositoryOverride,
  loadCapSnapshotForUser: loadCapSnapshotOverride
}) {
  const repo = repositoryOverride || createRewardsLedgerRepository();
  const log = logger && typeof logger.warn === "function" ? logger : noopLogger();

  async function poolQuery(text, params) {
    return db.query(text, params);
  }

  async function loadCapSnapshotForUser(userId, now) {
    if (typeof loadCapSnapshotOverride === "function") {
      return loadCapSnapshotOverride(userId, now);
    }
    return defaultLoadCapSnapshotForUser({ repository: repo, poolQuery, userId, now });
  }

  /**
   * @param {object} input
   * @param {number} input.userId
   * @param {import('@deenly/rewards-shared').EngagementFacts} input.facts
   * @param {import('@deenly/rewards-shared').AntiFarmingSignals} input.signals
   * @param {string} input.idempotencyKey
   * @param {object} [input.metadata]
   * @param {import('@deenly/rewards-shared').CapSnapshot} [input.capSnapshot] When set, skips DB cap load.
   */
  async function tryCreditEarnFromVerifiedAction({
    userId,
    facts,
    signals,
    idempotencyKey,
    metadata = {},
    capSnapshot: capSnapshotInput = null
  }) {
    const uid = validateUserId(userId);
    const key = validateIdempotencyKey(idempotencyKey);
    if (!facts || typeof facts !== "object") {
      throw new TypeError("facts is required");
    }
    if (!signals || typeof signals !== "object") {
      throw new TypeError("signals is required");
    }

    const existingRow = await repo.findLedgerEntryByUserIdAndIdempotencyKey(poolQuery, uid, key);
    if (existingRow) {
      const ledgerEntry = serializeLedgerRow(existingRow);
      return {
        credited: true,
        duplicate: true,
        ledgerEntry,
        decision: decisionFromDuplicateRow(ledgerEntry)
      };
    }

    const { evaluateEarnPipeline, earnActionToRewardEarnReasonKey } = loadRulesEngine();
    const rulesCfg = buildRulesConfigFromAppConfig(appConfig);
    const snapshot = capSnapshotInput != null ? capSnapshotInput : await loadCapSnapshotForUser(uid, new Date());
    const decision = evaluateEarnPipeline(facts, signals, snapshot, rulesCfg);

    if (!decision.allowGrant || decision.amountMinor <= 0) {
      return {
        credited: false,
        duplicate: false,
        ledgerEntry: null,
        decision
      };
    }

    const resolved = decision.meta.resolvedEarnAction;
    if (!resolved) {
      log.warn({ userId: uid, idempotencyKey: key }, "rewards_earn_missing_resolved_action");
      return {
        credited: false,
        duplicate: false,
        ledgerEntry: null,
        decision
      };
    }

    const reason = earnActionToRewardEarnReasonKey(resolved);
    const mergedMetadata = {
      ...metadata,
      resolvedEarnAction: resolved,
      engineVersion: decision.meta.engineVersion,
      actionKey: decision.meta.actionKey
    };

    try {
      const { ledgerEntry, duplicate } = await rewardsLedgerService.earnPoints({
        userId: uid,
        points: decision.amountMinor,
        reason,
        idempotencyKey: key,
        metadata: mergedMetadata
      });
      return {
        credited: true,
        duplicate,
        ledgerEntry,
        decision
      };
    } catch (err) {
      log.warn({ err, userId: uid, idempotencyKey: key }, "rewards_earn_ledger_failed");
      throw err;
    }
  }

  return {
    tryCreditEarnFromVerifiedAction,
    loadCapSnapshotForUser
  };
}

module.exports = {
  createRewardsEarnService,
  defaultLoadCapSnapshotForUser,
  utcDayBoundsIso,
  utcMonthBoundsIso
};
