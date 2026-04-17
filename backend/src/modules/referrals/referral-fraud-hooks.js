const { SelfReferralError } = require("./referral-errors");
const {
  collectReferralReviewSignals,
  evaluateReferralHardBlock
} = require("../trust/trust-flag-helpers");

function normalizeReferralCode(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function isSelfReferral(referrerUserId, refereeUserId) {
  return Number(referrerUserId) === Number(refereeUserId);
}

function assertNoSelfReferralOrThrow(referrerUserId, refereeUserId) {
  if (isSelfReferral(referrerUserId, refereeUserId)) {
    throw new SelfReferralError();
  }
}

/**
 * Default no-op duplicate-account gate. Replace at runtime with graph / device / payment fingerprint checks.
 *
 * @param {object} _ctx
 * @returns {Promise<{ ok: true; reasons: []; reviewSignals: [] } | { ok: false; reasons: string[]; reviewSignals?: object[] }>}
 */
async function defaultDuplicateAccountGuard(_ctx) {
  return { ok: true, reasons: [], reviewSignals: [] };
}

/**
 * Referral attribution fraud/trust gate: optional duplicate-account guard (pluggable),
 * disposable-email hard block, and non-blocking review signals.
 *
 * @param {object} input
 * @param {object} [input.thresholds] from getTrustSignalThresholds
 * @param {string|null} [input.refereeEmail]
 * @param {string|null} [input.referrerEmail]
 * @param {number} input.refereeUserId
 * @param {number} input.referrerUserId
 * @param {number} input.referralCodeId
 * @param {object} [input.requestContext]
 * @param {(ctx: {
 *   refereeUserId: number;
 *   referrerUserId: number;
 *   referralCodeId: number;
 *   requestContext: object;
 *   refereeEmail: string|null;
 *   referrerEmail: string|null;
 * }) => Promise<{ ok: boolean; reasons?: string[]; reviewSignals?: object[] }>} [input.duplicateAccountGuard]
 * @returns {Promise<{ ok: boolean; reasons: string[]; reviewSignals: object[] }>}
 */
async function evaluateAttributionFraudRisk(input) {
  const dupGuard = input.duplicateAccountGuard || defaultDuplicateAccountGuard;
  const dup = await dupGuard({
    refereeUserId: input.refereeUserId,
    referrerUserId: input.referrerUserId,
    referralCodeId: input.referralCodeId,
    requestContext: input.requestContext || {},
    refereeEmail: input.refereeEmail ?? null,
    referrerEmail: input.referrerEmail ?? null
  });
  if (!dup.ok) {
    return {
      ok: false,
      reasons: dup.reasons?.length ? dup.reasons : ["duplicate_account_blocked"],
      reviewSignals: dup.reviewSignals || []
    };
  }

  const thresholds = input.thresholds;
  if (thresholds && input.refereeEmail) {
    const hb = evaluateReferralHardBlock({
      refereeEmail: input.refereeEmail,
      thresholds
    });
    if (!hb.ok) {
      return { ok: false, reasons: hb.reasons, reviewSignals: [] };
    }
  }

  const reviewSignals =
    thresholds &&
    collectReferralReviewSignals({
      referrerEmail: input.referrerEmail || null,
      refereeEmail: input.refereeEmail || null,
      requestContext: {
        ...(input.requestContext || {}),
        refereeUserId: input.refereeUserId,
        referralCodeId: input.referralCodeId,
        referrerUserId: input.referrerUserId
      },
      thresholds
    });

  const merged = [...(dup.reviewSignals || []), ...(reviewSignals || [])];
  return { ok: true, reasons: [], reviewSignals: merged };
}

module.exports = {
  normalizeReferralCode,
  isSelfReferral,
  evaluateAttributionFraudRisk,
  assertNoSelfReferralOrThrow,
  defaultDuplicateAccountGuard
};
