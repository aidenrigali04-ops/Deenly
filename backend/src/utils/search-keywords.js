/**
 * Split a search query into lowercase keywords (AND semantics: each must match somewhere).
 * Uses substring matching without SQL LIKE wildcards (safe for _, % in user input).
 *
 * @param {string} q
 * @returns {{ all: boolean, terms: string[] }} `all: true` means no text filter; otherwise `terms` is non-empty or empty for "too short"
 */
function parseSearchKeywords(q) {
  const raw = String(q ?? "").trim();
  if (!raw) {
    return { all: true, terms: [] };
  }
  const lowered = raw.toLowerCase();
  const split = lowered
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_-]+/gu, ""))
    .filter((t) => t.length >= 2);
  const uniq = [...new Set(split)].slice(0, 12);
  if (uniq.length > 0) {
    return { all: false, terms: uniq };
  }
  if (lowered.length >= 2) {
    return { all: false, terms: [lowered.slice(0, 120)] };
  }
  return { all: false, terms: [] };
}

module.exports = {
  parseSearchKeywords
};
