const { createRewardConfigService } = require("./reward-config");

function makeDb(rows = {}) {
  const calls = [];
  const db = {
    query: jest.fn(async (sql, params = []) => {
      calls.push({ sql, params });
      // SELECT single key
      if (/WHERE rule_key = \$1/.test(sql)) {
        const key = params[0];
        if (rows[key] !== undefined) {
          return { rowCount: 1, rows: [{ rule_value: rows[key] }] };
        }
        return { rowCount: 0, rows: [] };
      }
      // Preload / getAll
      if (/FROM reward_rules_config/.test(sql) && /SELECT/.test(sql)) {
        const all = Object.entries(rows).map(([rule_key, rule_value]) => ({
          rule_key,
          rule_value,
          description: "",
          updated_by: null,
          updated_at: new Date(),
        }));
        return { rowCount: all.length, rows: all };
      }
      // UPDATE
      if (/^UPDATE reward_rules_config/m.test(sql) || /UPDATE reward_rules_config/.test(sql)) {
        const [valueJson, updatedBy, key] = params;
        rows[key] = JSON.parse(valueJson);
        return {
          rowCount: 1,
          rows: [{ rule_key: key, rule_value: rows[key], updated_by: updatedBy }],
        };
      }
      return { rowCount: 0, rows: [] };
    }),
  };
  return { db, calls };
}

describe("reward-config", () => {
  it("reads a value and caches subsequent calls", async () => {
    const { db } = makeDb({ points_per_dollar: 10 });
    const svc = createRewardConfigService({ db });

    expect(await svc.get("points_per_dollar")).toBe(10);
    expect(await svc.get("points_per_dollar")).toBe(10);
    expect(await svc.get("points_per_dollar")).toBe(10);

    // Only one DB read for 3 gets
    const reads = db.query.mock.calls.filter(([sql]) =>
      /WHERE rule_key = \$1/.test(sql)
    );
    expect(reads).toHaveLength(1);
  });

  it("getNumber returns 0 and logs when key missing", async () => {
    const { db } = makeDb({});
    const logger = { warn: jest.fn(), info: jest.fn() };
    const svc = createRewardConfigService({ db, logger });

    const n = await svc.getNumber("no_such_key");
    expect(n).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ key: "no_such_key" }),
      "reward_config_missing_key"
    );
  });

  it("streak multiplier selects correct band", async () => {
    const { db } = makeDb({
      streak_multiplier_1_6: 1.0,
      streak_multiplier_7_13: 1.5,
      streak_multiplier_14_30: 2.0,
      streak_multiplier_31_plus: 3.0,
    });
    const svc = createRewardConfigService({ db });

    expect(await svc.getStreakMultiplier(0)).toBe(1.0);
    expect(await svc.getStreakMultiplier(3)).toBe(1.0);
    expect(await svc.getStreakMultiplier(7)).toBe(1.5);
    expect(await svc.getStreakMultiplier(14)).toBe(2.0);
    expect(await svc.getStreakMultiplier(31)).toBe(3.0);
    expect(await svc.getStreakMultiplier(9999)).toBe(3.0);
  });

  it("getTierMultiplier composes key correctly", async () => {
    const { db } = makeDb({
      tier_multiplier_elite: 3.0,
      tier_multiplier_explorer: 1.0,
    });
    const svc = createRewardConfigService({ db });

    expect(await svc.getTierMultiplier("elite")).toBe(3.0);
    expect(await svc.getTierMultiplier("explorer")).toBe(1.0);
  });

  it("preload warms the cache (subsequent gets do not hit DB)", async () => {
    const { db } = makeDb({ a: 1, b: 2, c: 3 });
    const svc = createRewardConfigService({ db });

    await svc.preload();
    const before = db.query.mock.calls.length;

    expect(await svc.get("a")).toBe(1);
    expect(await svc.get("b")).toBe(2);
    expect(await svc.get("c")).toBe(3);

    expect(db.query.mock.calls.length).toBe(before); // no new reads
  });

  it("update invalidates the cache for the updated key", async () => {
    const { db } = makeDb({ points_per_dollar: 10 });
    const svc = createRewardConfigService({ db });

    expect(await svc.get("points_per_dollar")).toBe(10);
    await svc.update("points_per_dollar", 20, 42);
    expect(await svc.get("points_per_dollar")).toBe(20);

    // Two reads: one before, one after invalidation
    const reads = db.query.mock.calls.filter(([sql]) =>
      /WHERE rule_key = \$1/.test(sql)
    );
    expect(reads).toHaveLength(2);
  });

  it("clearCache forces reload on next get", async () => {
    const { db } = makeDb({ x: 7 });
    const svc = createRewardConfigService({ db });

    await svc.get("x");
    svc.clearCache();
    await svc.get("x");

    const reads = db.query.mock.calls.filter(([sql]) =>
      /WHERE rule_key = \$1/.test(sql)
    );
    expect(reads).toHaveLength(2);
  });
});
