const { httpError } = require("./http-error");

function requireString(value, field, minLength = 1, maxLength = 1024) {
  if (typeof value !== "string") {
    throw httpError(400, `${field} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length < minLength) {
    throw httpError(400, `${field} is too short`);
  }
  if (normalized.length > maxLength) {
    throw httpError(400, `${field} is too long`);
  }
  return normalized;
}

function optionalString(value, field, maxLength = 1024) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw httpError(400, `${field} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw httpError(400, `${field} is too long`);
  }
  return normalized || null;
}

module.exports = {
  requireString,
  optionalString
};
