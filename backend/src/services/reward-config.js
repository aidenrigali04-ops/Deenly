/**
 * Reward Config Service
 *
 * Reads and caches business rule values from the `reward_rules_config` table.
 * All reward business rule numbers (point rates, caps, multipliers, thresholds)
 * come from this service — never hardcoded.
 *
 * Cache: in-memory Map with 60-second TTL. Hot config changes take effect
 * within 1 minute without restart.
 */

const CACHE_TTL_MS = 60_000;

/**
 * @param {{ db: object, logger?: object }} deps
 */
function createRewardConfigService({ db, logger }) {
  /** @type {Map<string, { value: any, fetchedAt: number }>} */
  const cache = new Map();

  /**
   * Get a raw config value by key. Returns the parsed JSONB value.
   * @param {string} key
   * @returns {Promise<any>} parsed value, or null if not found
   */
  async function get(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.value;
    }

    const result = await db.query(
      "SELECT rule_value FROM reward_rules_config WHERE rule_key = $1 LIMIT 1",
      [key]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const value = result.rows[0].rule_value;
    cache.set(key, { value, fetchedAt: Date.now() });
    return value;
  }

  /**
   * Get a numeric config value. Parses the JSONB value as a number.
   * @param {string} key
   * @returns {Promise<number>}
   */
  async function getNumber(key) {
    const raw = await get(key);
    if (raw === null || raw === undefined) {
      if (logger) {
        logger.warn({ key }, "reward_config_missing_key");
      }
      return 0;
    }
    return Number(raw);
  }

  /**
   * Get daily earn cap for a tier.
   * @param {string} tier
   * @returns {Promise<number>}
   */
  async function getDailyEarnCap(tier) {
    return getNumber(`daily_earn_cap_${tier}`);
  }

  /**
   * Get the earn multiplier for a tier.
   * @param {string} tier
   * @returns {Promise<number>}
   */
  async function getTierMultiplier(tier) {
    return getNumber(`tier_multiplier_${tier}`);
  }

  /**
   * Get the qualification threshold for a tier (rolling 12m points).
   * @param {string} tier
   * @returns {Promise<number>}
   */
  async function getTierThreshold(tier) {
    return getNumber(`tier_threshold_${tier}`);
  }

  /**
   * Get the streak multiplier for a given day count.
   * Ranges: 1-6 → streak_multiplier_1_6, 7-13 → streak_multiplier_7_13,
   *         14-30 → streak_multiplier_14_30, 31+ → streak_multiplier_31_plus
   * @param {number} streakDays
   * @returns {Promise<number>}
   */
  async function getStreakMultiplier(streakDays) {
    if (streakDays >= 31) {
      return getNumber("streak_multiplier_31_plus");
    }
    if (streakDays >= 14) {
      return getNumber("streak_multiplier_14_30");
    }
    if (streakDays >= 7) {
      return getNumber("streak_multiplier_7_13");
    }
    return getNumber("streak_multiplier_1_6");
  }

  /**
   * Get streak shield count for a tier.
   * @param {string} tier
   * @returns {Promise<number>}
   */
  async function getStreakShields(tier) {
    return getNumber(`streak_shields_${tier}`);
  }

  /**
   * Preload all config values into cache. Call at startup.
   * @returns {Promise<number>} count of loaded keys
   */
  async function preload() {
    const result = await db.query(
      "SELECT rule_key, rule_value FROM reward_rules_config"
    );
    const now = Date.now();
    for (const row of result.rows) {
      cache.set(row.rule_key, { value: row.rule_value, fetchedAt: now });
    }
    if (logger) {
      logger.info(
        { count: result.rowCount },
        "reward_config_preloaded"
      );
    }
    return result.rowCount;
  }

  /**
   * Update a config value. Admin-only.
   * @param {string} key
   * @param {any} value
   * @param {number} updatedBy - admin user_id
   * @returns {Promise<object>} updated row
   */
  async function update(key, value, updatedBy) {
    const result = await db.query(
      `UPDATE reward_rules_config
       SET rule_value = $1::jsonb, updated_by = $2, updated_at = current_timestamp
       WHERE rule_key = $3
       RETURNING *`,
      [JSON.stringify(value), updatedBy, key]
    );
    if (result.rowCount === 0) {
      return null;
    }
    // Invalidate cache for this key
    cache.delete(key);
    return result.rows[0];
  }

  /**
   * Get all config values (for admin display).
   * @returns {Promise<object[]>}
   */
  async function getAll() {
    const result = await db.query(
      "SELECT rule_key, rule_value, description, updated_by, updated_at FROM reward_rules_config ORDER BY rule_key"
    );
    return result.rows;
  }

  /** Clear the in-memory cache. For testing. */
  function clearCache() {
    cache.clear();
  }

  return {
    get,
    getNumber,
    getDailyEarnCap,
    getTierMultiplier,
    getTierThreshold,
    getStreakMultiplier,
    getStreakShields,
    preload,
    update,
    getAll,
    clearCache
  };
}

module.exports = { createRewardConfigService };
