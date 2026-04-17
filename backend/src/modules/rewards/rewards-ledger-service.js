const { toBigInt } = require("./balance-helpers");
const { createRewardsLedgerRepository } = require("./rewards-ledger-repository");
const {
  InsufficientPointsError,
  LedgerEntryNotFoundError,
  InvalidReversalError
} = require("./rewards-ledger-errors");
const { getTrustSignalThresholds } = require("../trust/trust-signal-thresholds");

const MAX_POINTS_PER_TX = BigInt(Number.MAX_SAFE_INTEGER);

function noopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function validateUserId(userId) {
  const n = Number(userId);
  if (!Number.isInteger(n) || n < 1) {
    throw new TypeError("userId must be a positive integer");
  }
  return n;
}

function validatePointsAmount(points) {
  const b = toBigInt(points);
  if (b <= 0n) {
    throw new TypeError("points must be a positive integer");
  }
  if (b > MAX_POINTS_PER_TX) {
    throw new TypeError("points exceed maximum allowed per transaction");
  }
  return b;
}

function validateReason(reason) {
  const s = String(reason || "").trim();
  if (s.length < 1 || s.length > 64) {
    throw new TypeError("reason must be 1–64 characters");
  }
  return s;
}

function validateIdempotencyKey(key) {
  const s = String(key || "").trim();
  if (s.length < 1 || s.length > 128) {
    throw new TypeError("idempotencyKey must be 1–128 characters");
  }
  return s;
}

function serializeLedgerRow(row) {
  const createdAt =
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || "");
  return {
    id: row.id,
    rewardAccountId: row.reward_account_id,
    deltaPoints: String(row.delta_points),
    entryKind: row.entry_kind,
    reason: row.reason,
    idempotencyKey: row.idempotency_key,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    reversesLedgerEntryId: row.reverses_ledger_entry_id,
    createdAt
  };
}

function createRewardsLedgerService({ db, analytics, logger, repository, trustFlagService, appConfig }) {
  const repo = repository || createRewardsLedgerRepository();
  const log = logger && typeof logger.warn === "function" ? logger : noopLogger();

  async function trackEvent(eventName, payload) {
    if (!analytics || typeof analytics.trackEvent !== "function") {
      return;
    }
    try {
      await analytics.trackEvent(eventName, payload);
    } catch (err) {
      log.warn({ err, eventName }, "rewards_ledger_analytics_failed");
    }
  }

  async function poolQuery(text, params) {
    return db.query(text, params);
  }

  async function maybeTrustFlagLargeLedgerTx({ kind, userId, pointsAmount, ledgerEntry, reason, idempotencyKey }) {
    if (!trustFlagService || !appConfig || typeof trustFlagService.recordFlag !== "function") {
      return;
    }
    const thr = getTrustSignalThresholds(appConfig);
    if (!thr.enabled) {
      return;
    }
    const amt = Number(pointsAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return;
    }
    if (kind === "earn" && amt >= thr.rewardsEarnFlagPointsMinor && thr.rewardsEarnFlagPointsMinor > 0) {
      await trustFlagService.recordFlag(appConfig, {
        domain: "rewards",
        flagType: "rewards_large_earn",
        severity: "low",
        subjectUserId: userId,
        relatedEntityType: "reward_ledger_entry",
        relatedEntityId: String(ledgerEntry.id),
        metadata: { points: String(amt), reason, idempotencyKey }
      });
    }
    if (kind === "spend" && amt >= thr.rewardsSpendFlagPointsMinor && thr.rewardsSpendFlagPointsMinor > 0) {
      await trustFlagService.recordFlag(appConfig, {
        domain: "rewards",
        flagType: "rewards_large_spend",
        severity: "low",
        subjectUserId: userId,
        relatedEntityType: "reward_ledger_entry",
        relatedEntityId: String(ledgerEntry.id),
        metadata: { points: String(amt), reason, idempotencyKey }
      });
    }
  }

  /**
   * Grant points. Idempotent on (account, idempotencyKey). Analytics: rewards_ledger_earn / rewards_ledger_earn_duplicate.
   */
  async function earnPoints({ userId, points, reason, idempotencyKey, metadata = {} }) {
    const uid = validateUserId(userId);
    const amount = validatePointsAmount(points);
    const r = validateReason(reason);
    const key = validateIdempotencyKey(idempotencyKey);

    const { ledgerEntry, duplicate } = await db.withTransaction(async (client) => {
      const account = await repo.ensureAccountAndLock(client, uid);
      const insert = await repo.insertLedgerEntry(client, {
        reward_account_id: account.id,
        delta_points: String(amount),
        entry_kind: "earn",
        reason: r,
        idempotency_key: key,
        metadata,
        reverses_ledger_entry_id: null
      });
      let row = insert.row;
      if (!insert.inserted) {
        row = await repo.selectAfterConflict(client, account.id, key);
      }
      if (!row) {
        throw new Error("reward_ledger_insert_missing_row");
      }
      const dup = !insert.inserted;
      return { ledgerEntry: serializeLedgerRow(row), duplicate: dup };
    });

    if (duplicate) {
      await trackEvent("rewards_ledger_earn_duplicate", {
        userId: uid,
        ledgerEntryId: ledgerEntry.id,
        points: String(amount)
      });
    } else {
      await trackEvent("rewards_ledger_earn", {
        userId: uid,
        ledgerEntryId: ledgerEntry.id,
        points: String(amount),
        reason: r
      });
      await maybeTrustFlagLargeLedgerTx({
        kind: "earn",
        userId: uid,
        pointsAmount: amount,
        ledgerEntry,
        reason: r,
        idempotencyKey: key
      });
    }

    return { ledgerEntry, duplicate };
  }

  /**
   * Spend points (positive amount). Writes a negative delta. Idempotent on (account, idempotencyKey).
   */
  async function spendPoints({ userId, points, reason, idempotencyKey, metadata = {} }) {
    const uid = validateUserId(userId);
    const amount = validatePointsAmount(points);
    const r = validateReason(reason);
    const key = validateIdempotencyKey(idempotencyKey);

    const { ledgerEntry, duplicate } = await db.withTransaction(async (client) => {
      const account = await repo.ensureAccountAndLock(client, uid);
      const existing = await repo.findByIdempotency(client, account.id, key);
      if (existing) {
        return { ledgerEntry: serializeLedgerRow(existing), duplicate: true };
      }

      const balance = toBigInt(await repo.sumPointsForAccount(client, account.id));
      if (balance < amount) {
        throw new InsufficientPointsError("Insufficient points for this spend");
      }

      const insert = await repo.insertLedgerEntry(client, {
        reward_account_id: account.id,
        delta_points: String(-amount),
        entry_kind: "spend",
        reason: r,
        idempotency_key: key,
        metadata,
        reverses_ledger_entry_id: null
      });
      if (!insert.inserted || !insert.row) {
        const row = await repo.selectAfterConflict(client, account.id, key);
        return { ledgerEntry: serializeLedgerRow(row), duplicate: true };
      }

      return { ledgerEntry: serializeLedgerRow(insert.row), duplicate: false };
    });

    if (duplicate) {
      await trackEvent("rewards_ledger_spend_duplicate", {
        userId: uid,
        ledgerEntryId: ledgerEntry.id,
        points: String(amount)
      });
    } else {
      await trackEvent("rewards_ledger_spend", {
        userId: uid,
        ledgerEntryId: ledgerEntry.id,
        points: String(amount),
        reason: r
      });
      await maybeTrustFlagLargeLedgerTx({
        kind: "spend",
        userId: uid,
        pointsAmount: amount,
        ledgerEntry,
        reason: r,
        idempotencyKey: key
      });
    }

    return { ledgerEntry, duplicate };
  }

  /**
   * Append a compensating reversal row; does not delete the original entry.
   */
  async function reverseEntry({ userId, originalLedgerEntryId, reason, idempotencyKey, metadata = {} }) {
    const uid = validateUserId(userId);
    const originalId = Number(originalLedgerEntryId);
    if (!Number.isInteger(originalId) || originalId < 1) {
      throw new TypeError("originalLedgerEntryId must be a positive integer");
    }
    const r = validateReason(reason);
    const key = validateIdempotencyKey(idempotencyKey);

    const { ledgerEntry, duplicate } = await db.withTransaction(async (client) => {
      const account = await repo.ensureAccountAndLock(client, uid);
      const existingByKey = await repo.findByIdempotency(client, account.id, key);
      if (existingByKey) {
        return { ledgerEntry: serializeLedgerRow(existingByKey), duplicate: true };
      }

      const original = await repo.findEntryWithUser(client, originalId);
      if (!original || Number(original.user_id) !== uid) {
        throw new LedgerEntryNotFoundError("Ledger entry not found for user");
      }
      await repo.lockLedgerEntryRowForUpdate(client, originalId);
      if (original.entry_kind === "reversal") {
        throw new InvalidReversalError("Cannot reverse a reversal entry");
      }
      const existingReversal = await repo.findReversalForTarget(client, originalId);
      if (existingReversal) {
        throw new InvalidReversalError("Entry already has a reversal");
      }

      const reversalDelta = -toBigInt(original.delta_points);
      const insert = await repo.insertLedgerEntry(client, {
        reward_account_id: account.id,
        delta_points: String(reversalDelta),
        entry_kind: "reversal",
        reason: r,
        idempotency_key: key,
        metadata,
        reverses_ledger_entry_id: originalId
      });
      let row = insert.row;
      if (!insert.inserted) {
        row = await repo.selectAfterConflict(client, account.id, key);
      }
      if (!row) {
        const rev = await repo.findReversalForTarget(client, originalId);
        if (rev) {
          throw new InvalidReversalError("Entry already has a reversal");
        }
        throw new Error("reward_ledger_reversal_insert_missing_row");
      }
      return { ledgerEntry: serializeLedgerRow(row), duplicate: !insert.inserted };
    });

    if (duplicate) {
      await trackEvent("rewards_ledger_reverse_duplicate", {
        userId: uid,
        ledgerEntryId: ledgerEntry.id,
        originalLedgerEntryId: originalId
      });
    } else {
      await trackEvent("rewards_ledger_reverse", {
        userId: uid,
        ledgerEntryId: ledgerEntry.id,
        originalLedgerEntryId: originalId,
        reason: r
      });
    }

    return { ledgerEntry, duplicate };
  }

  /**
   * Balance from immutable ledger sums (no cached balance column).
   */
  async function getBalance({ userId }) {
    const uid = validateUserId(userId);
    const total = await repo.getBalanceForUserId(poolQuery, uid);
    return { balancePoints: String(total) };
  }

  /**
   * Keyset-paginated ledger history for the user's reward account.
   */
  async function getHistory({ userId, cursor = null, limit = 20 }) {
    const uid = validateUserId(userId);
    const lim = Number(limit);
    const page = await repo.listHistoryForUser(poolQuery, uid, { cursor, limit: lim });
    return {
      items: page.items.map(serializeLedgerRow),
      nextCursor: page.nextCursor
    };
  }

  return {
    earnPoints,
    spendPoints,
    reverseEntry,
    getBalance,
    getHistory
  };
}

module.exports = {
  createRewardsLedgerService,
  serializeLedgerRow,
  validateUserId,
  validatePointsAmount,
  validateReason,
  validateIdempotencyKey
};
