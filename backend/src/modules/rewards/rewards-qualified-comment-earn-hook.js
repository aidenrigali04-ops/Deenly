/**
 * Minimal production-safe engagement earn: **persisted comments only** (server-verified INSERT).
 *
 * Deferred by design (not implemented here):
 * - `qualified_reaction` / likes — requires trustworthy dwell time not forged from the client.
 * - Feed scroll / impression / ranking proxy events — never wallet credits without independent verification.
 * - Raw POST /interactions/view — passive engagement; excluded from earn.
 *
 * Enable with `REWARDS_EARN_QUALIFIED_COMMENT_ENABLED=true` after ops review.
 */

const { buildEarnIdempotencyKey } = require("./rewards-earn-idempotency");

function noopLogger() {
  return { info() {}, warn() {}, error() {} };
}

/**
 * Server-only substance gate + quality proxy for rules engine (never trust client dwell/quality).
 *
 * @param {string} text
 * @param {{ minChars: number; minWords: number }} thresholds
 * @returns {{ ok: boolean; quality?: number; reason?: string }}
 */
function evaluatePersistedCommentSubstance(text, thresholds) {
  const trimmed = String(text || "").trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (trimmed.length < thresholds.minChars) {
    return { ok: false, reason: "below_min_chars" };
  }
  if (words.length < thresholds.minWords) {
    return { ok: false, reason: "below_min_words" };
  }
  /** Monotonic in length/word count; floor above rules default minQuality (0.55). */
  const q =
    0.58 +
    Math.min(0.22, words.length * 0.02) +
    Math.min(0.18, trimmed.length / 900);
  const quality = Math.min(0.97, q);
  return { ok: true, quality };
}

/**
 * @param {object} deps
 * @param {object | null} deps.rewardsEarnService Return value of {@link createRewardsEarnService} when enabled.
 * @param {object} deps.appConfig
 * @param {object} [deps.logger]
 */
function createRewardsQualifiedCommentEarnHook({ rewardsEarnService, appConfig, logger }) {
  const log = logger && typeof logger.warn === "function" ? logger : noopLogger();
  const cfg = appConfig || {};

  function thresholds() {
    return {
      minChars: Math.max(8, Math.round(Number(cfg.rewardsEarnQualifiedCommentMinChars ?? 32))),
      minWords: Math.max(2, Math.round(Number(cfg.rewardsEarnQualifiedCommentMinWords ?? 5)))
    };
  }

  /**
   * After a successful `interactions` INSERT for `interaction_type = 'comment'`.
   * Never throws to callers — comment creation must succeed even if rewards fail.
   *
   * @param {object} p
   * @param {number} p.userId
   * @param {number} p.postId
   * @param {number} p.interactionId
   * @param {string} p.commentText
   * @param {number | null | undefined} p.postAuthorId
   * @returns {Promise<object>}
   */
  async function maybeCreditAfterCommentInsert({ userId, postId, interactionId, commentText, postAuthorId }) {
    if (!cfg.rewardsEarnQualifiedCommentEnabled) {
      return { skipped: "feature_disabled" };
    }
    if (!rewardsEarnService || typeof rewardsEarnService.tryCreditEarnFromVerifiedAction !== "function") {
      return { skipped: "no_rewards_earn_service" };
    }
    const author = postAuthorId != null ? Number(postAuthorId) : NaN;
    if (!Number.isInteger(author) || author < 1) {
      return { skipped: "no_post_author" };
    }
    if (Number(userId) === author) {
      return { skipped: "self_target" };
    }
    const th = thresholds();
    const substance = evaluatePersistedCommentSubstance(commentText, th);
    if (!substance.ok) {
      return { skipped: "substance_gate", reason: substance.reason };
    }

    const idempotencyKey = buildEarnIdempotencyKey(["qualified_comment", "interaction", String(interactionId)]);
    const iso = new Date().toISOString();

    try {
      const out = await rewardsEarnService.tryCreditEarnFromVerifiedAction({
        userId: Number(userId),
        facts: {
          actorUserId: Number(userId),
          actionKey: "qualified_comment",
          occurredAtIso: iso,
          surfaceKey: "post_comment_submit",
          depth: "qualified",
          targetPostId: Number(postId),
          targetUserId: author,
          isSelfTarget: false,
          engagementQuality: substance.quality
        },
        signals: {},
        idempotencyKey,
        metadata: {
          sourceType: "interaction_comment",
          sourceId: String(interactionId),
          postId: Number(postId)
        }
      });
      return {
        skipped: out.credited ? false : "rules_denied",
        credited: out.credited,
        duplicate: Boolean(out.duplicate),
        denyReasons: out.decision?.denyReasons || []
      };
    } catch (err) {
      log.warn({ err, userId, postId, interactionId }, "rewards_qualified_comment_earn_failed");
      return { skipped: "earn_error" };
    }
  }

  return { maybeCreditAfterCommentInsert };
}

module.exports = {
  createRewardsQualifiedCommentEarnHook,
  evaluatePersistedCommentSubstance
};
