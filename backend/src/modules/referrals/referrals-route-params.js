const { optionalString } = require("../../utils/validators");
const { httpError } = require("../../utils/http-error");

/**
 * @typedef {object} ReferralShareBodyParams
 * @property {string | undefined} surface — trimmed client surface when present
 */

/**
 * @typedef {object} ReferralCodePreviewQueryParams
 * @property {string} rawReferralCode
 */

/**
 * @param {unknown} body
 * @returns {ReferralShareBodyParams}
 */
function parseReferralShareBody(body) {
  const raw = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const surface = optionalString(raw.surface, "surface", 64);
  return { surface: surface || undefined };
}

/**
 * @param {object} [query]
 * @returns {ReferralCodePreviewQueryParams}
 */
function parseReferralCodePreviewQuery(query = {}) {
  const code = optionalString(query.code, "code", 80);
  if (!code) {
    throw httpError(400, "Query parameter code is required");
  }
  return { rawReferralCode: code };
}

module.exports = {
  parseReferralShareBody,
  parseReferralCodePreviewQuery
};
