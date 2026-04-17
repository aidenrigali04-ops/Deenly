const { createTrustFlagRepository } = require("./trust-flag-repository");
const { buildTrustFlagRow, assertValidTrustFlagRow } = require("./trust-flag-helpers");
const { getTrustSignalThresholds } = require("./trust-signal-thresholds");

function noopLogger() {
  return { info() {}, warn() {}, error() {} };
}

/**
 * Best-effort persistence + analytics; never throws to callers.
 */
function createTrustFlagService({ db, analytics, logger, repository }) {
  const repo = repository || createTrustFlagRepository();
  const log = logger && typeof logger.warn === "function" ? logger : noopLogger();

  async function track(name, payload) {
    if (!analytics || typeof analytics.trackEvent !== "function") {
      return;
    }
    try {
      await analytics.trackEvent(name, payload);
    } catch (err) {
      log.warn({ err, name }, "trust_flag_analytics_failed");
    }
  }

  /**
   * @param {object} config loadEnv config
   * @param {object} input pass-through to buildTrustFlagRow + domain
   */
  async function recordFlag(config, input) {
    const thresholds = getTrustSignalThresholds(config);
    if (!thresholds.enabled) {
      return { skipped: true, reason: "disabled" };
    }
    try {
      const row = buildTrustFlagRow(input);
      assertValidTrustFlagRow(row);
      const saved = await repo.insertFlag(db, row);
      await track("trust_flag_created", {
        flagId: saved.id,
        domain: saved.domain,
        flagType: saved.flag_type,
        severity: saved.severity,
        subjectUserId: saved.subject_user_id
      });
      return { saved };
    } catch (err) {
      log.warn({ err, input }, "trust_flag_insert_failed");
      await track("trust_flag_insert_failed", {
        domain: input.domain,
        flagType: input.flagType,
        message: String(err && err.message ? err.message : err).slice(0, 200)
      });
      return { error: true };
    }
  }

  async function recordFlags(config, items) {
    const results = [];
    for (const item of items) {
      results.push(await recordFlag(config, item));
    }
    return results;
  }

  return {
    recordFlag,
    recordFlags
  };
}

module.exports = {
  createTrustFlagService
};
