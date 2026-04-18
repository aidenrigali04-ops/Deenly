/**
 * Canonical idempotency keys for buyer earn orchestration.
 * Keys are unique per {@link reward_accounts} row via `(reward_account_id, idempotency_key)`.
 *
 * @param {string[]} segments Non-empty strings; `:` is replaced in each segment to avoid ambiguity.
 * @returns {string} Key in the form `earn:part1:part2:...` (max 128 chars).
 */
function buildEarnIdempotencyKey(segments) {
  if (!Array.isArray(segments) || segments.length < 1) {
    throw new TypeError("buildEarnIdempotencyKey requires a non-empty segments array");
  }
  const cleaned = segments.map((s, i) => {
    const t = String(s == null ? "" : s).trim().replace(/:/g, "_");
    if (t.length < 1) {
      throw new TypeError(`buildEarnIdempotencyKey: segment ${i} is empty after trim`);
    }
    if (t.length > 80) {
      throw new TypeError(`buildEarnIdempotencyKey: segment ${i} exceeds 80 characters`);
    }
    return t;
  });
  const key = ["earn", ...cleaned].join(":");
  if (key.length > 128) {
    throw new TypeError(`buildEarnIdempotencyKey: composite key length ${key.length} exceeds 128`);
  }
  return key;
}

module.exports = {
  buildEarnIdempotencyKey
};
