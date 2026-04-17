const { validateUserId } = require("../rewards/rewards-ledger-service");

function noopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function isoOrNull(v) {
  if (v == null) {
    return null;
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  const s = String(v);
  return s.length ? s : null;
}

function buildSuggestedShareUrl(appBaseUrl, code) {
  const base = String(appBaseUrl || "").replace(/\/+$/, "");
  const c = String(code || "").trim();
  if (!base || !c) {
    return null;
  }
  return `${base}/auth/signup?referralCode=${encodeURIComponent(c)}`;
}

function mapAttributionRow(row) {
  if (!row) {
    return null;
  }
  const status = String(row.status || "");
  return {
    id: Number(row.id),
    status,
    attributedAt: isoOrNull(row.attributed_at),
    firstQualifiedOrderId:
      row.first_qualified_order_id == null ? null : Number(row.first_qualified_order_id),
    clearAfterAt: isoOrNull(row.clear_after_at),
    qualifiedAt: isoOrNull(row.qualified_at),
    voidReason: row.void_reason == null ? null : String(row.void_reason)
  };
}

function createReferralReadService({ db, referralRepository, referralService, appConfig, analytics, logger }) {
  const log = logger && typeof logger.warn === "function" ? logger : noopLogger();

  async function trackEvent(eventName, payload) {
    if (!analytics || typeof analytics.trackEvent !== "function") {
      return;
    }
    try {
      await analytics.trackEvent(eventName, payload);
    } catch (err) {
      log.warn({ err, eventName }, "referral_read_analytics_failed");
    }
  }

  /**
   * @param {{ userId: number }} params
   */
  async function getMe({ userId }) {
    const uid = validateUserId(userId);
    await referralService.ensurePrimaryReferralCodeForUser({ referrerUserId: uid });
    const [codeRow, attrRow, qualifiedCount] = await Promise.all([
      referralRepository.findCodeByReferrerUserIdPool(db, uid),
      referralRepository.findAttributionByRefereeUserIdPool(db, uid),
      referralRepository.countQualifiedReferralsForReferrerAllTimePool(db, uid)
    ]);
    const code =
      codeRow && codeRow.code
        ? {
            code: String(codeRow.code),
            status: String(codeRow.status),
            maxRedemptions: Number(codeRow.max_redemptions),
            attributableSignupsCount: Number(codeRow.attributable_signups_count || 0),
            suggestedShareUrl: buildSuggestedShareUrl(appConfig?.appBaseUrl, codeRow.code)
          }
        : null;
    const body = {
      code,
      attributionAsReferee: mapAttributionRow(attrRow),
      qualifiedReferralsCount: qualifiedCount
    };
    await trackEvent("referral_program_viewed", { userId: uid });
    return body;
  }

  /**
   * @param {{ userId: number, surface?: string }} params
   */
  async function recordShare({ userId, surface = "unspecified" }) {
    const uid = validateUserId(userId);
    const s = String(surface || "unspecified").trim().slice(0, 64) || "unspecified";
    await trackEvent("referral_share_recorded", { userId: uid, surface: s });
    return { ok: true };
  }

  return { getMe, recordShare };
}

module.exports = {
  createReferralReadService
};
