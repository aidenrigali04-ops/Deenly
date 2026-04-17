const { createReferralService } = require("../src/modules/referrals/referral-service");
const { createRewardsLedgerService } = require("../src/modules/rewards/rewards-ledger-service");
const {
  createMemoryReferralRepository
} = require("./helpers/memory-referral-repository");
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

function makeService(appConfigOverrides = {}, { duplicateAccountGuard } = {}) {
  const appConfig = makeTestAppConfig(appConfigOverrides);
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
  const svc = createReferralService({
    db,
    repository: memRepo,
    rewardsLedger,
    analytics,
    logger: null,
    getReferralConfig: () => mapAppConfigToReferralDomain(appConfig),
    appConfig,
    duplicateAccountGuard: duplicateAccountGuard || null
  });
  return { svc, memRepo, memLedgerRepo, analytics, appConfig };
}

describe("createReferralService", () => {
  it("blocks self-referral at signup", async () => {
    const { svc, memRepo } = makeService();
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 1,
      code: "testcode1",
      status: "active",
      max_redemptions: 100
    });
    const r = await svc.tryAttributeOnSignup({
      refereeUserId: 1,
      rawReferralCode: "testcode1",
      requestContext: {}
    });
    expect(r.status).toBe("rejected");
    expect(r.reason).toBe("self_referral");
  });

  it("does not issue rewards on signup alone", async () => {
    const { svc, memRepo, memLedgerRepo } = makeService();
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 10,
      code: "signuponly",
      status: "active",
      max_redemptions: 100
    });
    await svc.tryAttributeOnSignup({
      refereeUserId: 11,
      rawReferralCode: "signuponly",
      requestContext: {}
    });
    const balRef = await memLedgerRepo.getBalanceForUserId(null, 10);
    const balReferee = await memLedgerRepo.getBalanceForUserId(null, 11);
    expect(balRef).toBe("0");
    expect(balReferee).toBe("0");
  });

  it("releases referrer reward on first qualifying completed order", async () => {
    const { svc, memRepo, memLedgerRepo, analytics } = makeService();
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 20,
      code: "qualifyme",
      status: "active",
      max_redemptions: 100
    });
    await svc.tryAttributeOnSignup({
      refereeUserId: 21,
      rawReferralCode: "qualifyme",
      requestContext: {}
    });
    memRepo.seedOrder({
      id: 9001,
      buyer_user_id: 21,
      seller_user_id: 30,
      status: "completed",
      kind: "product",
      amount_minor: 200,
      stripe_payment_intent_id: "pi_test_1",
      created_at: new Date()
    });
    const oc = await svc.onOrderCompleted({ orderId: 9001 });
    expect(oc.evaluated).toBe(true);
    expect(["qualified", "pending_clear"]).toContain(oc.transitioned);
    const bal = await memLedgerRepo.getBalanceForUserId(null, 20);
    expect(bal).toBe("500");
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "referral_qualified_released",
      expect.objectContaining({ referrerUserId: 20, refereeUserId: 21 })
    );
  });

  it("voids pending_clear when order invalidated before release (hold path)", async () => {
    const { svc, memRepo } = makeService({ referralHoldClearHoursAfterOrder: 48 });
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 40,
      code: "holdpath",
      status: "active",
      max_redemptions: 100
    });
    await svc.tryAttributeOnSignup({ refereeUserId: 41, rawReferralCode: "holdpath" });
    memRepo.seedOrder({
      id: 9101,
      buyer_user_id: 41,
      seller_user_id: 50,
      status: "completed",
      kind: "product",
      amount_minor: 50,
      created_at: new Date()
    });
    const oc = await svc.onOrderCompleted({ orderId: 9101 });
    expect(oc.transitioned).toBe("pending_clear");
    const inv = await svc.onOrderFinanciallyInvalidated({ orderId: 9101, reason: "refunded" });
    expect(inv.processed).toBe(1);
    const rows = memRepo._attributions();
    expect(rows[0].status).toBe("voided");
  });

  it("reverses ledger when qualified order is refunded", async () => {
    const { svc, memRepo, memLedgerRepo } = makeService();
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 60,
      code: "revtest",
      status: "active",
      max_redemptions: 100
    });
    await svc.tryAttributeOnSignup({ refereeUserId: 61, rawReferralCode: "revtest" });
    memRepo.seedOrder({
      id: 9201,
      buyer_user_id: 61,
      seller_user_id: 70,
      status: "completed",
      kind: "product",
      amount_minor: 99,
      created_at: new Date()
    });
    await svc.onOrderCompleted({ orderId: 9201 });
    expect(await memLedgerRepo.getBalanceForUserId(null, 60)).toBe("500");
    await svc.onOrderFinanciallyInvalidated({ orderId: 9201, reason: "refunded" });
    expect(await memLedgerRepo.getBalanceForUserId(null, 60)).toBe("0");
    const rows = memRepo._attributions();
    expect(rows[0].status).toBe("voided");
  });

  it("rejects signup when duplicateAccountGuard fails (pluggable fraud)", async () => {
    const dupGuard = jest.fn(async () => ({
      ok: false,
      reasons: ["duplicate_account_blocked"],
      reviewSignals: []
    }));
    const { svc, memRepo, analytics } = makeService({}, { duplicateAccountGuard: dupGuard });
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 100,
      code: "dupguard",
      status: "active",
      max_redemptions: 100
    });
    const r = await svc.tryAttributeOnSignup({
      refereeUserId: 101,
      rawReferralCode: "dupguard",
      requestContext: {}
    });
    expect(r.status).toBe("rejected");
    expect(r.reason).toBe("duplicate_account_blocked");
    expect(dupGuard).toHaveBeenCalled();
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "referral_signup_duplicate_blocked",
      expect.objectContaining({ refereeUserId: 101 })
    );
  });

  it("expires attribution when first order falls outside attribution window", async () => {
    const { svc, memRepo, analytics } = makeService();
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 110,
      code: "windowexp",
      status: "active",
      max_redemptions: 100
    });
    await svc.tryAttributeOnSignup({ refereeUserId: 111, rawReferralCode: "windowexp" });
    const attr = memRepo._attributions()[0];
    await memRepo.updateAttribution(null, attr.id, { attributed_at: new Date("2026-01-01T00:00:00.000Z") });
    memRepo.seedOrder({
      id: 9401,
      buyer_user_id: 111,
      seller_user_id: 120,
      status: "completed",
      kind: "product",
      amount_minor: 500,
      created_at: new Date("2026-03-15T12:00:00.000Z")
    });
    const oc = await svc.onOrderCompleted({ orderId: 9401 });
    expect(oc.transitioned).toBe("expired");
    expect(memRepo._attributions()[0].status).toBe("expired");
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "referral_expired_window",
      expect.objectContaining({ attributionId: attr.id })
    );
  });

  it("does not advance to pending_clear when order kind is excluded", async () => {
    const { svc, memRepo, memLedgerRepo } = makeService();
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 130,
      code: "kindonly",
      status: "active",
      max_redemptions: 100
    });
    await svc.tryAttributeOnSignup({ refereeUserId: 131, rawReferralCode: "kindonly" });
    memRepo.seedOrder({
      id: 9501,
      buyer_user_id: 131,
      seller_user_id: 140,
      status: "completed",
      kind: "subscription",
      amount_minor: 5000,
      created_at: new Date()
    });
    const oc = await svc.onOrderCompleted({ orderId: 9501 });
    expect(oc.transitioned).toBe("unchanged");
    expect(memRepo._attributions()[0].status).toBe("pending_purchase");
    expect(await memLedgerRepo.getBalanceForUserId(null, 130)).toBe("0");
  });

  it("does not release until hold window elapses", async () => {
    const orderTime = new Date();
    orderTime.setMilliseconds(0);
    const { svc, memRepo, memLedgerRepo } = makeService({ referralHoldClearHoursAfterOrder: 3 });
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 150,
      code: "holdwait",
      status: "active",
      max_redemptions: 100
    });
    await svc.tryAttributeOnSignup({ refereeUserId: 151, rawReferralCode: "holdwait" });
    const attr0 = memRepo._attributions()[0];
    await memRepo.updateAttribution(null, attr0.id, {
      attributed_at: new Date(orderTime.getTime() - 86_400_000)
    });
    memRepo.seedOrder({
      id: 9601,
      buyer_user_id: 151,
      seller_user_id: 160,
      status: "completed",
      kind: "product",
      amount_minor: 200,
      created_at: orderTime
    });
    const oc = await svc.onOrderCompleted({ orderId: 9601, now: orderTime });
    expect(oc.transitioned).toBe("pending_clear");
    expect(await memLedgerRepo.getBalanceForUserId(null, 150)).toBe("0");
    const attrId = memRepo._attributions()[0].id;
    const early = await svc.tryReleaseQualifiedRewards(attrId, new Date(orderTime.getTime() + 2 * 3_600_000));
    expect(early.released).toBe(false);
    expect(early.reason).toBe("hold_active");
    const late = await svc.tryReleaseQualifiedRewards(attrId, new Date(orderTime.getTime() + 4 * 3_600_000));
    expect(late.released).toBe(true);
    expect(await memLedgerRepo.getBalanceForUserId(null, 150)).toBe("500");
  });

  it("blocks second same-day qualified release when referrer daily cap is reached", async () => {
    const t = new Date();
    t.setMilliseconds(0);
    const { svc, memRepo, memLedgerRepo } = makeService({ referralMaxReferrerRewardsPerDay: 1 });
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 170,
      code: "dailycap",
      status: "active",
      max_redemptions: 100
    });
    await svc.tryAttributeOnSignup({ refereeUserId: 171, rawReferralCode: "dailycap" });
    await svc.tryAttributeOnSignup({ refereeUserId: 172, rawReferralCode: "dailycap" });
    for (const uid of [171, 172]) {
      const row = memRepo._attributions().find((a) => Number(a.referee_user_id) === uid);
      await memRepo.updateAttribution(null, row.id, {
        attributed_at: new Date(t.getTime() - 86_400_000)
      });
    }
    memRepo.seedOrder({
      id: 9701,
      buyer_user_id: 171,
      seller_user_id: 180,
      status: "completed",
      kind: "product",
      amount_minor: 300,
      created_at: t
    });
    memRepo.seedOrder({
      id: 9702,
      buyer_user_id: 172,
      seller_user_id: 181,
      status: "completed",
      kind: "product",
      amount_minor: 300,
      created_at: t
    });
    await svc.onOrderCompleted({ orderId: 9701, now: t });
    expect(await memLedgerRepo.getBalanceForUserId(null, 170)).toBe("500");
    const oc2 = await svc.onOrderCompleted({ orderId: 9702, now: t });
    expect(oc2.transitioned).toBe("pending_clear");
    const attrs = memRepo._attributions();
    const second = attrs.find((a) => Number(a.referee_user_id) === 172);
    const rel = await svc.tryReleaseQualifiedRewards(second.id, t);
    expect(rel.released).toBe(false);
    expect(rel.reason).toBe("referrer_daily_cap");
    expect(memRepo._attributions().find((a) => Number(a.referee_user_id) === 172).status).toBe("pending_clear");
  });

  it("onOrderFinanciallyInvalidated is a no-op for unrelated order ids", async () => {
    const { svc } = makeService();
    const r = await svc.onOrderFinanciallyInvalidated({ orderId: 999999, reason: "refunded" });
    expect(r.processed).toBe(0);
  });

  it("respects min qualifying order amount from config", async () => {
    const { svc, memRepo, memLedgerRepo } = makeService({ referralMinQualifyingOrderAmountMinor: 500 });
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 80,
      code: "minamt",
      status: "active",
      max_redemptions: 100
    });
    await svc.tryAttributeOnSignup({ refereeUserId: 81, rawReferralCode: "minamt" });
    memRepo.seedOrder({
      id: 9301,
      buyer_user_id: 81,
      seller_user_id: 90,
      status: "completed",
      kind: "product",
      amount_minor: 100,
      created_at: new Date()
    });
    const oc = await svc.onOrderCompleted({ orderId: 9301 });
    expect(oc.transitioned).toBe("unchanged");
    expect(await memLedgerRepo.getBalanceForUserId(null, 80)).toBe("0");
  });

  it("second qualifying order rewards after first order below min amount", async () => {
    const { svc, memRepo, memLedgerRepo } = makeService({ referralMinQualifyingOrderAmountMinor: 500 });
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 300,
      code: "twostep",
      status: "active",
      max_redemptions: 100
    });
    await svc.tryAttributeOnSignup({ refereeUserId: 301, rawReferralCode: "twostep" });
    memRepo.seedOrder({
      id: 9501,
      buyer_user_id: 301,
      seller_user_id: 310,
      status: "completed",
      kind: "product",
      amount_minor: 100,
      created_at: new Date()
    });
    const first = await svc.onOrderCompleted({ orderId: 9501 });
    expect(first.transitioned).toBe("unchanged");
    memRepo.seedOrder({
      id: 9502,
      buyer_user_id: 301,
      seller_user_id: 311,
      status: "completed",
      kind: "product",
      amount_minor: 600,
      created_at: new Date()
    });
    const second = await svc.onOrderCompleted({ orderId: 9502 });
    expect(second.transitioned).toBe("qualified");
    expect(await memLedgerRepo.getBalanceForUserId(null, 300)).toBe("500");
  });

  it("releasePendingReferralsIfReady processes held rows when due", async () => {
    const { svc, memRepo, memLedgerRepo } = makeService({ referralHoldClearHoursAfterOrder: 1 });
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 500,
      code: "cronhold",
      status: "active",
      max_redemptions: 100
    });
    await svc.tryAttributeOnSignup({ refereeUserId: 501, rawReferralCode: "cronhold" });
    const t0 = new Date();
    t0.setMilliseconds(0);
    const attrCron = memRepo._attributions()[0];
    await memRepo.updateAttribution(null, attrCron.id, {
      attributed_at: new Date(t0.getTime() - 86_400_000)
    });
    memRepo.seedOrder({
      id: 9801,
      buyer_user_id: 501,
      seller_user_id: 510,
      status: "completed",
      kind: "product",
      amount_minor: 50,
      created_at: t0
    });
    await svc.onOrderCompleted({ orderId: 9801, now: t0 });
    const releaseNow = new Date(t0.getTime() + 2 * 3600 * 1000);
    const batch = await svc.releasePendingReferralsIfReady({ now: releaseNow });
    expect(batch.some((b) => b.released === true)).toBe(true);
    expect(await memLedgerRepo.getBalanceForUserId(null, 500)).toBe("500");
  });

  it("peekReferralCodeStatus reports validity and exhaustion", async () => {
    const { svc, memRepo } = makeService();
    await memRepo.insertReferralCode(null, {
      referrer_user_id: 700,
      code: "PeekCode",
      status: "active",
      max_redemptions: 1
    });
    expect(await svc.peekReferralCodeStatus({ rawReferralCode: "" })).toMatchObject({ ok: false, reason: "no_code" });
    expect(await svc.peekReferralCodeStatus({ rawReferralCode: "nope" })).toMatchObject({
      ok: false,
      reason: "invalid_code"
    });
    expect(await svc.peekReferralCodeStatus({ rawReferralCode: "peekcode" })).toEqual({
      ok: true,
      exhausted: false
    });
    const code = await memRepo.findCodeByNormalized(null, "peekcode");
    await memRepo.insertAttribution(null, {
      referral_code_id: code.id,
      referrer_user_id: 700,
      referee_user_id: 701,
      status: "pending_purchase",
      metadata: {}
    });
    expect(await svc.peekReferralCodeStatus({ rawReferralCode: "peekcode" })).toEqual({
      ok: true,
      exhausted: true
    });
  });
});
