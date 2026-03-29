const { httpError } = require("./http-error");
const { optionalString, optionalWebsiteUrl, requireString } = require("./validators");

/**
 * Merge JSON body with existing profile row. Omitted keys keep DB values so
 * partial client updates (e.g. avatar-only) do not wipe bio, business, or site.
 */
function resolveProfilePutFields(body, existing) {
  const b = body || {};

  let displayName;
  if (Object.prototype.hasOwnProperty.call(b, "displayName")) {
    displayName = requireString(b.displayName, "displayName", 2, 64);
  } else {
    const dn = String(existing.display_name ?? "").trim();
    if (dn.length < 2) {
      throw httpError(400, "displayName is required");
    }
    displayName = dn;
  }

  const bio = Object.prototype.hasOwnProperty.call(b, "bio")
    ? optionalString(b.bio, "bio", 240)
    : existing.bio;

  const avatarUrl = Object.prototype.hasOwnProperty.call(b, "avatarUrl")
    ? optionalString(b.avatarUrl, "avatarUrl", 2048)
    : existing.avatar_url;

  const businessOffering = Object.prototype.hasOwnProperty.call(b, "businessOffering")
    ? optionalString(b.businessOffering, "businessOffering", 2000)
    : existing.business_offering;

  const websiteUrl = Object.prototype.hasOwnProperty.call(b, "websiteUrl")
    ? optionalWebsiteUrl(b.websiteUrl, "websiteUrl", 2048)
    : existing.website_url;

  return { displayName, bio, avatarUrl, businessOffering, websiteUrl };
}

module.exports = {
  resolveProfilePutFields
};
