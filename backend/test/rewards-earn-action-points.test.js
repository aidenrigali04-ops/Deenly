const {
  BASE_EARN_ACTION_POINTS_DEFAULTS,
  buildEarnActionPointsFromAppConfig,
  buildFullEarnActionPointsTable,
  buildBuyerEarnMilestoneFlags
} = require("../src/modules/rewards/rewards-earn-action-points");
const { getReferralDomainConfig } = require("../src/modules/referrals/referral-config");
const { buildRulesConfigFromAppConfig } = require("../src/modules/rewards/rewards-checkout-service");

describe("rewards-earn-action-points", () => {
  it("full table matches base when appConfig empty", () => {
    const t = buildFullEarnActionPointsTable({});
    expect(t.referral_qualified).toBe(500);
    expect(t.referral_qualified_referee).toBe(0);
    expect(t.first_post_published).toBe(150);
    expect(t.first_product_order_completed).toBe(0);
    expect(t.purchase_completed).toBe(0);
    expect(t.qualified_comment).toBe(BASE_EARN_ACTION_POINTS_DEFAULTS.qualified_comment);
  });

  it("overlays referral amounts from appConfig", () => {
    const t = buildFullEarnActionPointsTable({
      referralReferrerRewardPointsMinor: 777,
      referralRefereeRewardPointsMinor: 50
    });
    expect(t.referral_qualified).toBe(777);
    expect(t.referral_qualified_referee).toBe(50);
  });

  it("getReferralDomainConfig point fields match earn overlay", () => {
    const cfg = {
      referralReferrerRewardPointsMinor: 888,
      referralRefereeRewardPointsMinor: 12
    };
    const ref = getReferralDomainConfig(cfg);
    const earn = buildEarnActionPointsFromAppConfig(cfg);
    expect(ref.referrerRewardPointsMinor).toBe(earn.referral_qualified);
    expect(ref.refereeRewardPointsMinor).toBe(earn.referral_qualified_referee);
  });

  it("does not override first_post_published until milestone flag is enabled", () => {
    const t = buildFullEarnActionPointsTable({
      rewardsEarnFirstPostPublishedEnabled: false,
      rewardsEarnFirstPostPublishedPointsMinor: 999
    });
    expect(t.first_post_published).toBe(150);
  });

  it("sets first_post_published from env when milestone enabled", () => {
    const t = buildFullEarnActionPointsTable({
      rewardsEarnFirstPostPublishedEnabled: true,
      rewardsEarnFirstPostPublishedPointsMinor: 200
    });
    expect(t.first_post_published).toBe(200);
  });

  it("defaults first_post points to base when enabled and points missing", () => {
    const t = buildFullEarnActionPointsTable({ rewardsEarnFirstPostPublishedEnabled: true });
    expect(t.first_post_published).toBe(BASE_EARN_ACTION_POINTS_DEFAULTS.first_post_published);
  });

  it("first product milestone only overrides when enabled", () => {
    expect(buildFullEarnActionPointsTable({}).first_product_order_completed).toBe(0);
    const t = buildFullEarnActionPointsTable({
      rewardsEarnFirstProductOrderCompletedEnabled: true,
      rewardsEarnFirstProductOrderCompletedPointsMinor: 300
    });
    expect(t.first_product_order_completed).toBe(300);
  });

  it("purchase_completed is zero unless purchase earn flag is enabled", () => {
    expect(buildFullEarnActionPointsTable({}).purchase_completed).toBe(0);
    const t = buildFullEarnActionPointsTable({
      rewardsEarnPurchaseCompletedEnabled: true,
      rewardsEarnPurchaseCompletedPointsMinor: 80
    });
    expect(t.purchase_completed).toBe(80);
  });

  it("purchase_completed falls back to base default points when enabled and points missing", () => {
    const t = buildFullEarnActionPointsTable({ rewardsEarnPurchaseCompletedEnabled: true });
    expect(t.purchase_completed).toBe(BASE_EARN_ACTION_POINTS_DEFAULTS.purchase_completed);
  });

  it("buildBuyerEarnMilestoneFlags surfaces env without mutating base table when disabled", () => {
    const flags = buildBuyerEarnMilestoneFlags({
      rewardsEarnFirstPostPublishedEnabled: false,
      rewardsEarnFirstPostPublishedPointsMinor: 400
    });
    expect(flags.firstPostPublishedEnabled).toBe(false);
    expect(flags.firstPostPublishedPointsMinor).toBe(400);
    expect(buildFullEarnActionPointsTable({ rewardsEarnFirstPostPublishedEnabled: false }).first_post_published).toBe(
      150
    );
  });

  it("buildRulesConfigFromAppConfig embeds full earn action points table", () => {
    const cfg = buildRulesConfigFromAppConfig({
      referralReferrerRewardPointsMinor: 600,
      referralRefereeRewardPointsMinor: 25
    });
    expect(cfg.earn.actionPointsMinor.referral_qualified).toBe(600);
    expect(cfg.earn.actionPointsMinor.referral_qualified_referee).toBe(25);
    expect(cfg.earn.actionPointsMinor.signup_complete).toBe(BASE_EARN_ACTION_POINTS_DEFAULTS.signup_complete);
  });
});
