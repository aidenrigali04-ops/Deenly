const TRUST_DOMAINS = new Set(["referral", "rewards", "boost", "refund", "ranking"]);
const TRUST_SEVERITIES = new Set(["info", "low", "medium", "high"]);

const DEFAULT_DISPOSABLE_DOMAINS = [
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com"
];

/**
 * @param {string} email
 * @returns {string|null}
 */
function emailDomain(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  const i = e.indexOf("@");
  if (i < 0 || i === e.length - 1) {
    return null;
  }
  return e.slice(i + 1);
}

/**
 * @param {string} email
 * @param {readonly string[]} disposableDomains
 */
function isDisposableEmailDomain(email, disposableDomains) {
  const d = emailDomain(email);
  if (!d) {
    return false;
  }
  const set = new Set(disposableDomains.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
  return set.has(d);
}

/**
 * Build a normalized row for persistence (callers still validate domain/severity).
 * @param {object} input
 * @returns {object}
 */
function buildTrustFlagRow(input) {
  const domain = String(input.domain || "").trim().toLowerCase();
  const flagType = String(input.flagType || "").trim().slice(0, 96);
  const severity = String(input.severity || "low").trim().toLowerCase();
  const subjectUserId =
    input.subjectUserId === undefined || input.subjectUserId === null ? null : Number(input.subjectUserId);
  const relatedEntityType = input.relatedEntityType != null ? String(input.relatedEntityType).slice(0, 48) : null;
  const relatedEntityId = input.relatedEntityId != null ? String(input.relatedEntityId).slice(0, 128) : null;
  const metadata =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {};
  return {
    domain,
    flagType,
    severity,
    subjectUserId: Number.isInteger(subjectUserId) && subjectUserId > 0 ? subjectUserId : null,
    relatedEntityType,
    relatedEntityId,
    metadata
  };
}

function assertValidTrustFlagRow(row) {
  if (!TRUST_DOMAINS.has(row.domain)) {
    throw new TypeError(`invalid trust domain: ${row.domain}`);
  }
  if (!row.flagType) {
    throw new TypeError("flagType is required");
  }
  if (!TRUST_SEVERITIES.has(row.severity)) {
    throw new TypeError(`invalid severity: ${row.severity}`);
  }
}

/**
 * Non-blocking review signals for referral attribution (never sets ok=false here).
 * @param {object} p
 * @param {string|null} p.referrerEmail
 * @param {string|null} p.refereeEmail
 * @param {object} p.requestContext
 * @param {object} p.thresholds from getTrustSignalThresholds
 * @returns {readonly { flagType: string; severity: string; subjectUserId: number|null; metadata: object }[]}
 */
function collectReferralReviewSignals({ referrerEmail, refereeEmail, requestContext = {}, thresholds }) {
  const out = [];
  const refDom = emailDomain(referrerEmail);
  const refeDom = emailDomain(refereeEmail);
  if (thresholds.referralFlagSameEmailDomain && refDom && refeDom && refDom === refeDom) {
    out.push({
      flagType: "referral_same_email_domain",
      severity: "low",
      subjectUserId: requestContext.refereeUserId ?? null,
      metadata: {
        referrerDomain: refDom,
        referralCodeId: requestContext.referralCodeId ?? null
      }
    });
  }
  const disposableList = thresholds.disposableEmailDomains || [];
  if (thresholds.referralFlagDisposableRefereeEmail && isDisposableEmailDomain(refereeEmail, disposableList)) {
    out.push({
      flagType: "referral_disposable_referee_email",
      severity: "medium",
      subjectUserId: requestContext.refereeUserId ?? null,
      metadata: {
        domain: refeDom,
        signupChannel: requestContext.signupChannel || null
      }
    });
  }
  if (requestContext.signupIp && requestContext.referrerLastSignupIp) {
    if (
      thresholds.referralFlagSharedSignupIp &&
      String(requestContext.signupIp) === String(requestContext.referrerLastSignupIp)
    ) {
      out.push({
        flagType: "referral_shared_signup_ip_hint",
        severity: "medium",
        subjectUserId: requestContext.refereeUserId ?? null,
        metadata: {
          hint: "ip_match_on_metadata"
        }
      });
    }
  }
  return out;
}

/**
 * Optional hard block for worst-class disposable signups (config off by default).
 */
function evaluateReferralHardBlock({ refereeEmail, thresholds }) {
  if (!thresholds.referralBlockDisposableEmail) {
    return { ok: true, reasons: [] };
  }
  const disposableList = thresholds.disposableEmailDomains || [];
  if (isDisposableEmailDomain(refereeEmail, disposableList)) {
    return { ok: false, reasons: ["disposable_referee_email"] };
  }
  return { ok: true, reasons: [] };
}

module.exports = {
  TRUST_DOMAINS,
  TRUST_SEVERITIES,
  DEFAULT_DISPOSABLE_DOMAINS,
  emailDomain,
  isDisposableEmailDomain,
  buildTrustFlagRow,
  assertValidTrustFlagRow,
  collectReferralReviewSignals,
  evaluateReferralHardBlock
};
