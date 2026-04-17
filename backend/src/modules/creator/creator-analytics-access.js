const { httpError } = require("../../utils/http-error");

/**
 * @param {{ user: { id: number; role?: string } }} req
 * @param {number | null | undefined} queryCreatorUserId
 * @returns {number}
 */
function resolveTargetCreatorUserId(req, queryCreatorUserId) {
  const selfId = Number(req.user?.id);
  if (!selfId) {
    throw httpError(401, "Authentication required");
  }
  const requested = queryCreatorUserId != null && queryCreatorUserId !== "" ? Number(queryCreatorUserId) : selfId;
  if (!Number.isInteger(requested) || requested < 1) {
    throw httpError(400, "creatorUserId must be a positive integer");
  }
  const elevated = ["moderator", "admin"].includes(String(req.user?.role || ""));
  if (!elevated && requested !== selfId) {
    throw httpError(403, "Cannot access another creator's analytics");
  }
  return requested;
}

module.exports = {
  resolveTargetCreatorUserId
};
