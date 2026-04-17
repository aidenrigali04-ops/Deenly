/**
 * Buyer-facing referrals read API (align with `shared/rewards/api-dto.ts`).
 *
 * @typedef {object} ReferralCodeSummaryDto
 * @property {string} code
 * @property {string} status
 * @property {number} maxRedemptions
 * @property {number} attributableSignupsCount
 * @property {string | null} suggestedShareUrl
 */

/**
 * @typedef {object} ReferralAttributionSummaryDto
 * @property {number} id
 * @property {string} status
 * @property {string | null} attributedAt
 * @property {number | null} firstQualifiedOrderId
 * @property {string | null} clearAfterAt
 * @property {string | null} qualifiedAt
 * @property {string | null} voidReason
 */

/**
 * @typedef {object} ReferralsMeDto
 * @property {ReferralCodeSummaryDto | null} code
 * @property {ReferralAttributionSummaryDto | null} attributionAsReferee
 * @property {number} qualifiedReferralsCount
 */

/**
 * @typedef {object} ReferralShareRecordedDto
 * @property {true} ok
 */

/**
 * @typedef {object} ReferralCodePeekDto
 * @property {boolean} valid
 * @property {boolean} [exhausted] — present when valid is true
 * @property {string} [reason] — present when valid is false
 */

function isoOrNull(v) {
  if (v == null) {
    return null;
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  const s = String(v);
  return s.length ? s : null;
}

function buildSuggestedShareUrl(appBaseUrl, code) {
  const base = String(appBaseUrl || "").replace(/\/+$/, "");
  const c = String(code || "").trim();
  if (!base || !c) {
    return null;
  }
  return `${base}/auth/signup?referralCode=${encodeURIComponent(c)}`;
}

/**
 * @param {object | null} codeRow
 * @param {string | null} suggestedShareUrl
 * @returns {ReferralCodeSummaryDto | null}
 */
function toReferralCodeSummaryDto(codeRow, suggestedShareUrl) {
  if (!codeRow || !codeRow.code) {
    return null;
  }
  return {
    code: String(codeRow.code),
    status: String(codeRow.status),
    maxRedemptions: Number(codeRow.max_redemptions),
    attributableSignupsCount: Number(codeRow.attributable_signups_count || 0),
    suggestedShareUrl: suggestedShareUrl == null ? null : suggestedShareUrl
  };
}

/**
 * @param {object | null} row
 * @returns {ReferralAttributionSummaryDto | null}
 */
function toReferralAttributionSummaryDto(row) {
  if (!row) {
    return null;
  }
  const status = String(row.status || "");
  return {
    id: Number(row.id),
    status,
    attributedAt: isoOrNull(row.attributed_at),
    firstQualifiedOrderId:
      row.first_qualified_order_id == null ? null : Number(row.first_qualified_order_id),
    clearAfterAt: isoOrNull(row.clear_after_at),
    qualifiedAt: isoOrNull(row.qualified_at),
    voidReason: row.void_reason == null ? null : String(row.void_reason)
  };
}

/**
 * @param {object} input
 * @param {ReferralCodeSummaryDto | null} input.code
 * @param {ReferralAttributionSummaryDto | null} input.attributionAsReferee
 * @param {number} input.qualifiedReferralsCount
 * @returns {ReferralsMeDto}
 */
function toReferralsMeDto(input) {
  return {
    code: input.code,
    attributionAsReferee: input.attributionAsReferee,
    qualifiedReferralsCount: Number(input.qualifiedReferralsCount) || 0
  };
}

/** @returns {ReferralShareRecordedDto} */
function toReferralShareRecordedDto() {
  return { ok: true };
}

/**
 * @param {{ ok: boolean, reason?: string, exhausted?: boolean }} raw
 * @returns {ReferralCodePeekDto}
 */
function toReferralCodePeekDto(raw) {
  if (!raw || raw.ok !== true) {
    return {
      valid: false,
      reason: raw?.reason ? String(raw.reason) : "invalid_code"
    };
  }
  return { valid: true, exhausted: Boolean(raw.exhausted) };
}

module.exports = {
  buildSuggestedShareUrl,
  toReferralCodeSummaryDto,
  toReferralAttributionSummaryDto,
  toReferralsMeDto,
  toReferralShareRecordedDto,
  toReferralCodePeekDto
};
