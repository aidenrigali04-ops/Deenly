const {
  decodeHistoryCursor,
  encodeHistoryCursor
} = require("../../src/modules/rewards/balance-helpers");

/**
 * In-memory ledger store for unit tests (mirrors rewards-ledger-repository semantics).
 */
function createMemoryRewardsLedgerRepository() {
  const accountsByUserId = new Map();
  const entries = [];
  let nextAccountId = 1;
  let nextEntryId = 1;

  function accountIdForUser(userId) {
    if (!accountsByUserId.has(userId)) {
      accountsByUserId.set(userId, nextAccountId++);
    }
    return accountsByUserId.get(userId);
  }

  function userIdForAccount(accountId) {
    for (const [uid, aid] of accountsByUserId.entries()) {
      if (aid === accountId) {
        return uid;
      }
    }
    return null;
  }

  function entriesForAccount(accountId) {
    return entries.filter((e) => e.reward_account_id === accountId);
  }

  async function ensureAccountAndLock(_client, userId) {
    return { id: accountIdForUser(userId) };
  }

  async function findByIdempotency(_client, rewardAccountId, idempotencyKey) {
    return (
      entries.find(
        (e) => e.reward_account_id === rewardAccountId && e.idempotency_key === idempotencyKey
      ) || null
    );
  }

  async function insertLedgerEntry(_client, row) {
    const dupKey = entries.find(
      (e) => e.reward_account_id === row.reward_account_id && e.idempotency_key === row.idempotency_key
    );
    if (dupKey) {
      return { inserted: false, row: null };
    }
    if (row.entry_kind === "reversal" && row.reverses_ledger_entry_id) {
      const dupRev = entries.find(
        (e) =>
          e.entry_kind === "reversal" && e.reverses_ledger_entry_id === row.reverses_ledger_entry_id
      );
      if (dupRev) {
        return { inserted: false, row: null };
      }
    }
    const id = nextEntryId++;
    const rec = {
      id,
      reward_account_id: row.reward_account_id,
      delta_points: String(row.delta_points),
      entry_kind: row.entry_kind,
      reason: row.reason,
      idempotency_key: row.idempotency_key,
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      reverses_ledger_entry_id: row.reverses_ledger_entry_id ?? null,
      created_at: new Date()
    };
    entries.push(rec);
    return { inserted: true, row: rec };
  }

  async function selectAfterConflict(_client, rewardAccountId, idempotencyKey) {
    return findByIdempotency(null, rewardAccountId, idempotencyKey);
  }

  async function sumPointsForAccount(_client, rewardAccountId) {
    let t = 0n;
    for (const e of entriesForAccount(rewardAccountId)) {
      t += BigInt(String(e.delta_points));
    }
    return String(t);
  }

  async function findEntryWithUser(_client, ledgerEntryId) {
    const e = entries.find((x) => x.id === ledgerEntryId);
    if (!e) {
      return null;
    }
    const uid = userIdForAccount(e.reward_account_id);
    return { ...e, user_id: uid };
  }

  async function lockLedgerEntryRowForUpdate(_client, _ledgerEntryId) {
    void _client;
    void _ledgerEntryId;
  }

  async function findReversalForTarget(_client, targetLedgerEntryId) {
    return (
      entries.find(
        (e) => e.entry_kind === "reversal" && e.reverses_ledger_entry_id === targetLedgerEntryId
      ) || null
    );
  }

  async function getBalanceForUserId(_query, userId) {
    if (!accountsByUserId.has(userId)) {
      return "0";
    }
    const aid = accountsByUserId.get(userId);
    return sumPointsForAccount(null, aid);
  }

  async function getRewardAccountIdForUser(_query, userId) {
    return accountsByUserId.has(userId) ? accountsByUserId.get(userId) : null;
  }

  async function getLastCatalogCheckoutRedemptionAt(_query, userId) {
    const accountId = await getRewardAccountIdForUser(null, userId);
    if (!accountId) {
      return null;
    }
    const rows = entriesForAccount(accountId).filter(
      (e) =>
        e.entry_kind === "spend" &&
        e.reason === "redemption_catalog" &&
        String(e.metadata?.surface || "") === "product_checkout"
    );
    if (!rows.length) {
      return null;
    }
    rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return rows[0].created_at.toISOString();
  }

  async function findLedgerEntryByUserIdAndIdempotencyKey(_query, userId, idempotencyKey) {
    const aid = accountsByUserId.get(userId);
    if (!aid) {
      return null;
    }
    const e = entries.find((x) => x.reward_account_id === aid && x.idempotency_key === idempotencyKey);
    if (!e) {
      return null;
    }
    return {
      id: e.id,
      reward_account_id: e.reward_account_id,
      delta_points: e.delta_points,
      entry_kind: e.entry_kind,
      reason: e.reason,
      idempotency_key: e.idempotency_key,
      metadata: e.metadata,
      reverses_ledger_entry_id: e.reverses_ledger_entry_id,
      created_at: e.created_at
    };
  }

  async function sumEarnDeltaForAccountInUtcRange(_query, rewardAccountId, startIso, endExclusiveIso) {
    const start = new Date(startIso).getTime();
    const end = new Date(endExclusiveIso).getTime();
    let t = 0n;
    for (const e of entriesForAccount(rewardAccountId)) {
      if (e.entry_kind !== "earn") {
        continue;
      }
      const et = e.created_at.getTime();
      if (et >= start && et < end) {
        t += BigInt(String(e.delta_points));
      }
    }
    return String(t);
  }

  async function countEarnEntriesForAccountSince(_query, rewardAccountId, sinceIso) {
    const since = new Date(sinceIso).getTime();
    let n = 0;
    for (const e of entriesForAccount(rewardAccountId)) {
      if (e.entry_kind !== "earn") {
        continue;
      }
      if (e.created_at.getTime() >= since) {
        n += 1;
      }
    }
    return n;
  }

  async function listHistoryForUser(_query, userId, { cursor, limit }) {
    const accountId = await getRewardAccountIdForUser(null, userId);
    if (!accountId) {
      return { items: [], nextCursor: null };
    }
    const decoded = decodeHistoryCursor(cursor);
    const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
    let list = entriesForAccount(accountId).slice();
    list.sort((a, b) => {
      const ta = a.created_at.getTime();
      const tb = b.created_at.getTime();
      if (tb !== ta) {
        return tb - ta;
      }
      return b.id - a.id;
    });
    if (decoded) {
      const cts = new Date(decoded.createdAtIso).getTime();
      list = list.filter((e) => {
        const et = e.created_at.getTime();
        if (et < cts) {
          return true;
        }
        if (et > cts) {
          return false;
        }
        return e.id < decoded.id;
      });
    }
    const page = list.slice(0, lim);
    let nextCursor = null;
    if (page.length === lim) {
      const last = page[page.length - 1];
      nextCursor = encodeHistoryCursor(last.created_at.toISOString(), last.id);
    }
    const items = page.map((row) => ({
      id: row.id,
      reward_account_id: row.reward_account_id,
      delta_points: row.delta_points,
      entry_kind: row.entry_kind,
      reason: row.reason,
      idempotency_key: row.idempotency_key,
      metadata: row.metadata,
      reverses_ledger_entry_id: row.reverses_ledger_entry_id,
      created_at: row.created_at
    }));
    return { items, nextCursor };
  }

  return {
    ensureAccountAndLock,
    findByIdempotency,
    insertLedgerEntry,
    selectAfterConflict,
    sumPointsForAccount,
    findEntryWithUser,
    lockLedgerEntryRowForUpdate,
    findReversalForTarget,
    getBalanceForUserId,
    getRewardAccountIdForUser,
    getLastCatalogCheckoutRedemptionAt,
    listHistoryForUser,
    findLedgerEntryByUserIdAndIdempotencyKey,
    sumEarnDeltaForAccountInUtcRange,
    countEarnEntriesForAccountSince,
    /** Test introspection */
    _entries() {
      return entries.slice();
    }
  };
}

/**
 * @param {{ serializeTransactions?: boolean }} [options]
 * When true, queues `withTransaction` callbacks so parallel spends match PG row-lock behavior.
 * Default false avoids deadlocks when code nests `withTransaction` (e.g. referrals).
 */
function createMemoryDb(options = {}) {
  const serializeTransactions = Boolean(options.serializeTransactions);
  let txTail = Promise.resolve();
  return {
    withTransaction: serializeTransactions
      ? async (fn) => {
          const p = txTail.then(() => fn({}));
          txTail = p.catch(() => {});
          return p;
        }
      : async (fn) => fn({}),
    query: async (text, params) => {
      const t = String(text || "");
      if (/FROM users WHERE id = \$1 OR id = \$2/i.test(t)) {
        const a = Number(params[0]);
        const b = Number(params[1]);
        const emailFor = (id) => `user_${id}@example.com`;
        return {
          rowCount: 2,
          rows: [
            { id: a, email: emailFor(a) },
            { id: b, email: emailFor(b) }
          ]
        };
      }
      if (t.includes("redemption_catalog") && t.includes("product_checkout")) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error("memory tests should not use pool query");
    }
  };
}

module.exports = {
  createMemoryRewardsLedgerRepository,
  createMemoryDb
};
