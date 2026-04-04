const { URL } = require("node:url");
const { httpError } = require("./http-error");

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"')]+/gi;

/**
 * Normalize a host entry from env (may be bare host or full URL).
 * @param {string} raw
 * @returns {string}
 */
function normalizeBlockedHostEntry(raw) {
  const trimmed = String(raw || "").trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  try {
    if (trimmed.includes("://")) {
      const hostname = new URL(trimmed).hostname;
      return hostname.replace(/^www\./, "");
    }
  } catch {
    return "";
  }
  const noPath = trimmed.split("/")[0].split(":")[0];
  return noPath.replace(/^www\./, "");
}

/**
 * @param {string} hostname
 * @param {string[]} blockedHosts normalized host entries
 * @returns {string|null} matched block entry
 */
function hostMatchesBlocklist(hostname, blockedHosts) {
  if (!hostname || !blockedHosts?.length) {
    return null;
  }
  const h = String(hostname)
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  for (const raw of blockedHosts) {
    const b = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/^www\./, "");
    if (!b) {
      continue;
    }
    if (h === b || h.endsWith(`.${b}`)) {
      return b;
    }
  }
  return null;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function collectHostsFromHttpUrlsInText(text) {
  if (!text) {
    return [];
  }
  const matches = text.match(URL_IN_TEXT) || [];
  const hosts = [];
  for (const m of matches) {
    try {
      hosts.push(new URL(m).hostname);
    } catch {
      // ignore
    }
  }
  return hosts;
}

/**
 * @param {string} text
 * @param {string[]} blockedTerms
 * @returns {boolean}
 */
function containsBlockedTerm(text, blockedTerms) {
  if (!text || !blockedTerms?.length) {
    return false;
  }
  const lower = text.toLowerCase();
  return blockedTerms.some((term) => {
    const t = String(term || "").toLowerCase();
    return Boolean(t && lower.includes(t));
  });
}

/**
 * @param {string} text
 * @param {{ blockedTerms?: string[], blockedUrlHosts?: string[] }} policy
 * @returns {{ type: 'term'|'url' }|null}
 */
function validateUserFacingText(text, policy) {
  const blockedTerms = policy?.blockedTerms || [];
  const blockedUrlHosts = policy?.blockedUrlHosts || [];
  if (!text) {
    return null;
  }
  const s = String(text);
  if (containsBlockedTerm(s, blockedTerms)) {
    return { type: "term" };
  }
  const hosts = collectHostsFromHttpUrlsInText(s);
  const t = s.trim();
  if (/^https?:\/\//i.test(t)) {
    try {
      hosts.push(new URL(t).hostname);
    } catch {
      // ignore
    }
  }
  for (const hn of hosts) {
    if (hostMatchesBlocklist(hn, blockedUrlHosts)) {
      return { type: "url" };
    }
  }
  return null;
}

/**
 * @param {string|null|undefined} text
 * @param {object} config app config with commentBlockedTerms, blockedUrlHosts
 * @param {{ termMessage?: string, urlMessage?: string }} messages
 */
function throwIfUserFacingPolicyViolation(text, config, messages = {}) {
  const violation = validateUserFacingText(text, {
    blockedTerms: config.commentBlockedTerms,
    blockedUrlHosts: config.blockedUrlHosts
  });
  if (!violation) {
    return;
  }
  const termMessage = messages.termMessage || "Content contains blocked language";
  const urlMessage = messages.urlMessage || "Content links to a blocked website";
  throw httpError(400, violation.type === "url" ? urlMessage : termMessage);
}

/**
 * @param {(string|null|undefined)[]} chunks
 * @param {object} config
 * @param {{ termMessage?: string, urlMessage?: string }} messages
 */
function throwIfAnyUserFacingPolicyViolation(chunks, config, messages) {
  for (const chunk of chunks) {
    throwIfUserFacingPolicyViolation(chunk, config, messages);
  }
}

module.exports = {
  normalizeBlockedHostEntry,
  hostMatchesBlocklist,
  collectHostsFromHttpUrlsInText,
  containsBlockedTerm,
  validateUserFacingText,
  throwIfUserFacingPolicyViolation,
  throwIfAnyUserFacingPolicyViolation
};
