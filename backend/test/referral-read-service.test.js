const { createReferralService } = require("../src/modules/referrals/referral-service");
const { createReferralReadService } = require("../src/modules/referrals/referral-read-service");
const { createRewardsLedgerService } = require("../src/modules/rewards/rewards-ledger-service");
const { createMemoryReferralRepository } = require("./helpers/memory-referral-repository");
const {
  createMemoryRewardsLedgerRepository,
  createMemoryDb
} = require("./helpers/memory-rewards-ledger-repository");

function makeTestAppConfig(overrides = {}) {
  return {
    trustSignalsEnabled: false,
    referralAttributionWindowDays: 30,
    referralMaxReferrerRewardsPerDay: 50,
    referralDefaultCodeMaxRedemptions: 100,
    referralReferrerRewardPointsMinor: 500,
    referralRefereeRewardPointsMinor: 0,
    referralMinQualifyingOrderAmountMinor: 1,
    referralQualifyingOrderKinds: ["product"],
    referralHoldClearHoursAfterOrder: 0,
    referralAllowBuyerIsSeller: false,
    appBaseUrl: "https://app.example.com",
    ...overrides
  };
}

function mapAppConfigToReferralDomain(c) {
  return {
    attributionWindowDays: c.referralAttributionWindowDays,
    maxReferrerRewardsPerDay: c.referralMaxReferrerRewardsPerDay,
    defaultCodeMaxRedemptions: c.referralDefaultCodeMaxRedemptions,
    cooldownHoursBetweenSelfChecks: 24,
    referrerRewardPointsMinor: c.referralReferrerRewardPointsMinor,
    refereeRewardPointsMinor: c.referralRefereeRewardPointsMinor,
    minQualifyingOrderAmountMinor: c.referralMinQualifyingOrderAmountMinor,
    qualifyingOrderKinds: c.referralQualifyingOrderKinds,
    holdClearHoursAfterOrder: c.referralHoldClearHoursAfterOrder,
    allowBuyerIsSellerForQualification: c.referralAllowBuyerIsSeller
  };
}

function makeReadStack() {
  const appConfig = makeTestAppConfig();
  const memRepo = createMemoryReferralRepository();
  const memLedgerRepo = createMemoryRewardsLedgerRepository();
  const db = createMemoryDb();
  const analytics = { trackEvent: jest.fn(async () => {}) };
  const rewardsLedger = createRewardsLedgerService({
    db,
    analytics,
    logger: null,
    repository: memLedgerRepo
  });
  const referralService = createReferralService({
    db,
    repository: memRepo,
    rewardsLedger,
    analytics,
    logger: null,
    getReferralConfig: () => mapAppConfigToReferralDomain(appConfig),
    appConfig
  });
  const read = createReferralReadService({
    db,
    referralRepository: memRepo,
    referralService,
    appConfig,
    analytics,
    logger: null
  });
  return { read, analytics, memRepo };
}

describe("createReferralReadService", () => {
  it("ensures code, returns share URL, and tracks referral_program_viewed", async () => {
    const { read, analytics } = makeReadStack();
    const body = await read.getMe({ userId: 99 });
    expect(body.code).not.toBeNull();
    expect(body.code.code.length).toBeGreaterThan(0);
    expect(body.code.suggestedShareUrl).toContain("/auth/signup?referralCode=");
    expect(body.attributionAsReferee).toBeNull();
    expect(body.qualifiedReferralsCount).toBe(0);
    expect(analytics.trackEvent).toHaveBeenCalledWith("referral_program_viewed", { userId: 99 });
  });

  it("counts qualified attributions for referrer", async () => {
    const { read, memRepo } = makeReadStack();
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 1,
      code: "refcount1",
      status: "active",
      max_redemptions: 50
    });
    const code = await memRepo.findCodeByReferrerUserId(null, 1);
    await memRepo.insertAttribution(null, {
      referral_code_id: code.id,
      referrer_user_id: 1,
      referee_user_id: 2,
      status: "qualified",
      metadata: {}
    });
    const body = await read.getMe({ userId: 1 });
    expect(body.qualifiedReferralsCount).toBe(1);
  });

  it("recordShare tracks referral_share_recorded", async () => {
    const { read, analytics } = makeReadStack();
    jest.clearAllMocks();
    const r = await read.recordShare({ userId: 5, surface: "copy_link" });
    expect(r).toEqual({ ok: true });
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "referral_share_recorded",
      expect.objectContaining({ userId: 5, surface: "copy_link" })
    );
  });
});
