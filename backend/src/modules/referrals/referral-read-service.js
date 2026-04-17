const { validateUserId } = require("../rewards/rewards-ledger-service");
const {
  buildSuggestedShareUrl,
  toReferralCodeSummaryDto,
  toReferralAttributionSummaryDto,
  toReferralsMeDto,
  toReferralShareRecordedDto,
  toReferralCodePeekDto
} = require("./referral-read-dto");

function noopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
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
    const suggested = codeRow && codeRow.code ? buildSuggestedShareUrl(appConfig?.appBaseUrl, codeRow.code) : null;
    const code = toReferralCodeSummaryDto(codeRow, suggested);
    const dto = toReferralsMeDto({
      code,
      attributionAsReferee: toReferralAttributionSummaryDto(attrRow),
      qualifiedReferralsCount: qualifiedCount
    });
    await trackEvent("referral_program_viewed", { userId: uid });
    return dto;
  }

  /**
   * @param {{ userId: number, surface?: string }} params
   */
  async function recordShare({ userId, surface }) {
    const uid = validateUserId(userId);
    const s = String(surface ?? "unspecified").trim().slice(0, 64) || "unspecified";
    await trackEvent("referral_share_recorded", { userId: uid, surface: s });
    return toReferralShareRecordedDto();
  }

  /**
   * @param {{ rawReferralCode: string }} params
   */
  async function peekReferralCode({ rawReferralCode }) {
    const out = await referralService.peekReferralCodeStatus({ rawReferralCode });
    const dto = toReferralCodePeekDto(out);
    await trackEvent("referral_code_preview_viewed", {
      valid: dto.valid,
      reason: dto.reason ?? null,
      exhausted: dto.valid ? dto.exhausted : null
    });
    return dto;
  }

  return { getMe, recordShare, peekReferralCode };
}

module.exports = {
  createReferralReadService
};
