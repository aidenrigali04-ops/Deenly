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

function optionalWebsiteUrl(value, field, maxLength = 2048) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw httpError(400, `${field} must be a string`);
  }
  let candidate = value.trim();
  if (!candidate) {
    return null;
  }
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw httpError(400, `${field} must be a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw httpError(400, `${field} must be an http or https URL`);
  }
  const href = parsed.href;
  if (href.length > maxLength) {
    throw httpError(400, `${field} is too long`);
  }
  return href;
}

module.exports = {
  requireString,
  optionalString,
  optionalWebsiteUrl
};
