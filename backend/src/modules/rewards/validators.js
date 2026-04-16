/**
 * Domain validators for the Rewards & Growth Engine.
 *
 * Signature convention: `(field, value, ...)`.
 * All throw httpError(400, ...) on failure.
 */

const { httpError } = require("../../utils/http-error");

/**
 * Validate that a value is a positive integer (> 0).
 * @param {string} field
 * @param {*} value
 * @returns {number}
 */
function requirePositiveInt(field, value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw httpError(400, `${field} must be a positive integer`);
  }
  return num;
}

/**
 * Validate that a value is a non-negative integer (>= 0).
 * @param {string} field
 * @param {*} value
 * @returns {number}
 */
function requireNonNegativeInt(field, value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw httpError(400, `${field} must be a non-negative integer`);
  }
  return num;
}

/**
 * Validate that a value is one of an allowed set.
 * @param {string} field
 * @param {*} value
 * @param {string[]|readonly string[]} allowed
 * @returns {string}
 */
function requireEnum(field, value, allowed) {
  const str = String(value || "").trim().toLowerCase();
  if (!allowed.includes(str)) {
    throw httpError(400, `${field} must be one of: ${allowed.join(", ")}`);
  }
  return str;
}

/**
 * Optionally validate an enum value. Returns null if absent.
 */
function optionalEnum(field, value, allowed) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return requireEnum(field, value, allowed);
}

/**
 * Decode a cursor (base64url JSON of { createdAt, id }). Returns null
 * if cursor is absent or invalid (non-throwing for lenient parsing).
 */
function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const json = Buffer.from(String(cursor), "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (!parsed || !parsed.createdAt || !parsed.id) return null;
    return { createdAt: parsed.createdAt, id: String(parsed.id) };
  } catch {
    return null;
  }
}

/**
 * Encode a cursor for the next page.
 */
function encodeCursor(obj) {
  const payload = {
    createdAt:
      obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt,
    id: obj.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Parse cursor-based pagination from query params.
 */
function parsePagination(query, maxLimit = 100, defaultLimit = 20) {
  const limit = Math.min(
    Math.max(Number(query?.limit) || defaultLimit, 1),
    maxLimit
  );
  const cursor = decodeCursor(query?.cursor);
  return { limit, cursor };
}

/**
 * Parse offset-based pagination (admin endpoints).
 */
function parseOffsetPagination(query, maxLimit = 200, defaultLimit = 50) {
  const limit = Math.min(
    Math.max(Number(query?.limit) || defaultLimit, 1),
    maxLimit
  );
  const offset = Math.max(Number(query?.offset) || 0, 0);
  return { limit, offset };
}

/**
 * Parse an optional ISO 8601 date.
 */
function optionalDate(field, value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw httpError(400, `${field} must be a valid ISO 8601 date`);
  }
  return d;
}

/**
 * Require a non-empty trimmed string.
 * Opts: { min, max } default { min: 1, max: 1024 }
 */
function requireRewardString(field, value, { min = 1, max = 1024 } = {}) {
  if (typeof value !== "string") {
    throw httpError(400, `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw httpError(400, `${field} must be at least ${min} character(s)`);
  }
  if (trimmed.length > max) {
    throw httpError(400, `${field} must be at most ${max} characters`);
  }
  return trimmed;
}

/**
 * Validate a UUID string.
 */
function requireUuid(field, value) {
  const str = String(value || "").trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(str)
  ) {
    throw httpError(400, `${field} must be a valid UUID`);
  }
  return str;
}

/**
 * Parse comma-separated string into array of trimmed lowercased values.
 */
function parseCommaSeparated(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = {
  requirePositiveInt,
  requireNonNegativeInt,
  requireEnum,
  optionalEnum,
  decodeCursor,
  encodeCursor,
  parsePagination,
  parseOffsetPagination,
  optionalDate,
  requireRewardString,
  requireUuid,
  parseCommaSeparated,
};
