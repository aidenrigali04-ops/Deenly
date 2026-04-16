const { createRewardNotificationsService } = require("./reward-notifications");

function makePushStub() {
  const sends = [];
  return {
    sends,
    pushService: {
      sendToUser: jest.fn(async (userId, payload) => {
        sends.push({ userId, ...payload });
      }),
    },
  };
}

describe("reward-notifications", () => {
  it("sends earn notification with amount, source, balance", async () => {
    const { pushService, sends } = makePushStub();
    const svc = createRewardNotificationsService({ pushService });

    await svc.notifyPointsEarned({
      userId: 7,
      amount: 250,
      source: "order_earn",
      balanceAfter: 1250,
    });

    expect(sends).toHaveLength(1);
    expect(sends[0].userId).toBe(7);
    expect(sends[0].title).toMatch(/earned points/i);
    expect(sends[0].body).toMatch(/\+250/);
    expect(sends[0].body).toMatch(/1250/);
    expect(sends[0].data).toMatchObject({
      type: "rewards.points.earned",
      amount: 250,
      source: "order_earn",
      balance_after: 1250,
    });
  });

  it("tier upgrade includes both tiers and capitalizes", async () => {
    const { pushService, sends } = makePushStub();
    const svc = createRewardNotificationsService({ pushService });

    await svc.notifyTierUpgraded({ userId: 1, fromTier: "member", toTier: "insider" });

    expect(sends[0].title).toMatch(/Insider/);
    expect(sends[0].body).toMatch(/Member/);
    expect(sends[0].data).toMatchObject({
      type: "rewards.tier.upgraded",
      from_tier: "member",
      to_tier: "insider",
    });
  });

  it("streak warning includes hours left", async () => {
    const { pushService, sends } = makePushStub();
    const svc = createRewardNotificationsService({ pushService });

    await svc.notifyStreakAboutToBreak({ userId: 9, streakDays: 12, hoursLeft: 3 });

    expect(sends[0].body).toMatch(/12-day/);
    expect(sends[0].body).toMatch(/3h/);
    expect(sends[0].data.type).toBe("rewards.streak.warning");
  });

  it("referral release uses referred username when provided", async () => {
    const { pushService, sends } = makePushStub();
    const svc = createRewardNotificationsService({ pushService });

    await svc.notifyReferralReleased({ userId: 2, amount: 500, referredUsername: "aisha" });

    expect(sends[0].body).toMatch(/\+500/);
    expect(sends[0].body).toMatch(/aisha/);
  });

  it("referral release falls back when username missing", async () => {
    const { pushService, sends } = makePushStub();
    const svc = createRewardNotificationsService({ pushService });

    await svc.notifyReferralReleased({ userId: 2, amount: 500, referredUsername: null });

    expect(sends[0].body).toMatch(/your friend/i);
  });

  it("account frozen send fires with correct type", async () => {
    const { pushService, sends } = makePushStub();
    const svc = createRewardNotificationsService({ pushService });

    await svc.notifyAccountFrozen({ userId: 4, reason: "manual_review" });

    expect(sends[0].title).toMatch(/action required/i);
    expect(sends[0].data.type).toBe("trust.account.frozen");
    expect(sends[0].data.reason).toBe("manual_review");
  });

  it("boost completed uses impressions count", async () => {
    const { pushService, sends } = makePushStub();
    const svc = createRewardNotificationsService({ pushService });

    await svc.notifyBoostCompleted({ sellerId: 10, boostId: "abc", impressions: 4200 });

    expect(sends[0].userId).toBe(10);
    expect(sends[0].body).toMatch(/4200/);
    expect(sends[0].data.type).toBe("boost.completed");
  });

  it("swallows errors from pushService (never throws)", async () => {
    const pushService = {
      sendToUser: jest.fn(async () => {
        throw new Error("network down");
      }),
    };
    const logger = { warn: jest.fn() };
    const svc = createRewardNotificationsService({ pushService, logger });

    await expect(
      svc.notifyPointsEarned({ userId: 1, amount: 1, source: "s", balanceAfter: 1 })
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("is a no-op when pushService is not provided", async () => {
    const svc = createRewardNotificationsService({});
    await expect(
      svc.notifyPointsEarned({ userId: 1, amount: 1, source: "s", balanceAfter: 1 })
    ).resolves.toBeUndefined();
  });
});
