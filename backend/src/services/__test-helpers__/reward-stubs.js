/**
 * Test helpers for reward service unit tests.
 *
 * `makeDbStub` builds a minimal pg-like adapter that:
 *  - routes `query(sql, params)` to user-supplied handlers (regex-matched), and
 *  - returns a transaction-aware client via `getClient()` whose BEGIN/COMMIT/ROLLBACK
 *    are no-ops and whose `query` delegates to the same handler list.
 *
 * Handlers are matched in registration order; the first matching regex wins.
 * If no handler matches, the stub returns `{ rowCount: 0, rows: [] }` and records
 * the call in `db.unmatched` for inspection.
 */

function makeDbStub() {
  const handlers = [];
  const calls = [];
  const unmatched = [];

  function run(sql, params = []) {
    calls.push({ sql, params });
    for (const h of handlers) {
      if (h.pattern.test(sql)) {
        const result = h.fn(sql, params);
        return Promise.resolve(result || { rowCount: 0, rows: [] });
      }
    }
    unmatched.push({ sql, params });
    return Promise.resolve({ rowCount: 0, rows: [] });
  }

  const client = {
    query: jest.fn(run),
    release: jest.fn(),
  };

  const db = {
    calls,
    unmatched,
    handlers,
    query: jest.fn(run),
    getClient: jest.fn(async () => client),
    /**
     * Register a handler. Handlers are tried in order; first match wins.
     * @param {RegExp} pattern
     * @param {(sql: string, params: any[]) => { rowCount: number, rows: any[] } | undefined} fn
     */
    on(pattern, fn) {
      handlers.push({ pattern, fn });
      return db;
    },
  };

  return { db, client };
}

function makeRewardConfigStub(overrides = {}) {
  return {
    get: jest.fn(async (k) => overrides[k]),
    getNumber: jest.fn(async (k) => overrides[k] ?? 0),
    getDailyEarnCap: jest.fn(async () => overrides.daily_earn_cap ?? 10000),
    getTierMultiplier: jest.fn(async () => overrides.tier_multiplier ?? 1.0),
    getStreakMultiplier: jest.fn(async () => overrides.streak_multiplier ?? 1.0),
    getStreakShields: jest.fn(async () => overrides.streak_shields ?? 2),
    getTierThreshold: jest.fn(async () => overrides.tier_threshold ?? 1000),
    preload: jest.fn(async () => {}),
    clearCache: jest.fn(),
    update: jest.fn(async () => {}),
  };
}

function makeAnalyticsStub() {
  const events = [];
  return {
    events,
    trackEvent: jest.fn((name, payload) => {
      events.push({ name, payload });
    }),
    track: jest.fn(async (name, payload) => {
      events.push({ name, payload });
    }),
  };
}

function makeLoggerStub() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

module.exports = {
  makeDbStub,
  makeRewardConfigStub,
  makeAnalyticsStub,
  makeLoggerStub,
};
