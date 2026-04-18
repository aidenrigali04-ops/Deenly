const { createRewardsEarnService } = require("../src/modules/rewards/rewards-earn-service");
const { createRewardsLedgerService } = require("../src/modules/rewards/rewards-ledger-service");
const {
  createMemoryRewardsLedgerRepository,
  createMemoryDb
} = require("./helpers/memory-rewards-ledger-repository");
const { buildEarnIdempotencyKey } = require("../src/modules/rewards/rewards-earn-idempotency");

function baseAppConfig(overrides = {}) {
  return {
    rewardsCurrencyCode: "DEEN_PTS",
    rewardsPointsDecimals: 0,
    rewardsMaxEarnPerUserPerDayMinor: 5000,
    rewardsMaxEarnPerUserPerMonthMinor: 50_000,
    rewardsMaxSingleGrantMinor: 2000,
    rewardsMinGrantMinor: 1,
    rewardsRulesMaxGrantsPerRollingHour: 40,
    rewardsRulesMinSecondsBetweenGrantsSameTarget: 45,
    rewardsRulesMinQualityForEngagementEarn: 0.55,
    rewardsRulesMinDwellSecondsForReaction: 3,
    rewardsReversalFullRefundClawbackRatio: 1,
    rewardsReversalPartialRefundClawbackRatio: 0.5,
    rewardsReversalChargebackClawbackRatio: 1,
    rewardsReversalMaxAgeDays: 120,
    ...overrides
  };
}

function makeEarnTestHarness() {
  const repository = createMemoryRewardsLedgerRepository();
  const db = createMemoryDb({ serializeTransactions: true });
  const analytics = { trackEvent: jest.fn(async () => {}) };
  const rewardsLedgerService = createRewardsLedgerService({ db, analytics, logger: null, repository });
  const earnService = createRewardsEarnService({
    db,
    rewardsLedgerService,
    appConfig: baseAppConfig(),
    logger: null,
    repository,
    loadCapSnapshotForUser: async () => ({
      dailyEarnedMinor: 0,
      monthlyEarnedMinor: 0,
      grantsLastHourCount: 0
    })
  });
  return { earnService, rewardsLedgerService, repository, analytics };
}

describe("buildEarnIdempotencyKey", () => {
  it("builds a stable earn-scoped key", () => {
    expect(buildEarnIdempotencyKey(["purchase_completed", "order", "99"])).toBe("earn:purchase_completed:order:99");
  });

  it("rejects keys over 128 chars", () => {
    const parts = Array.from({ length: 30 }, () => "abcd");
    expect(() => buildEarnIdempotencyKey(parts)).toThrow(/exceeds 128/);
  });
});

describe("createRewardsEarnService", () => {
  it("credits signup_complete when rules allow", async () => {
    const { earnService, rewardsLedgerService } = makeEarnTestHarness();
    const idem = buildEarnIdempotencyKey(["signup_complete", "user", "42"]);
    const iso = new Date().toISOString();
    const r = await earnService.tryCreditEarnFromVerifiedAction({
      userId: 42,
      facts: { actorUserId: 42, actionKey: "signup_complete", occurredAtIso: iso },
      signals: {},
      idempotencyKey: idem,
      metadata: { sourceType: "user", sourceId: "42" }
    });
    expect(r.credited).toBe(true);
    expect(r.duplicate).toBe(false);
    expect(r.decision.allowGrant).toBe(true);
    expect(r.ledgerEntry.reason).toBe("signup_complete");
    expect(r.ledgerEntry.metadata.sourceType).toBe("user");
    expect(r.ledgerEntry.metadata.resolvedEarnAction).toBe("signup_complete");
    const bal = await rewardsLedgerService.getBalance({ userId: 42 });
    expect(bal.balancePoints).toBe("250");
  });

  it("returns duplicate without double balance on same idempotency key", async () => {
    const { earnService, rewardsLedgerService } = makeEarnTestHarness();
    const idem = buildEarnIdempotencyKey(["signup_complete", "ref", "order", "7"]);
    const iso = new Date().toISOString();
    const facts = {
      actorUserId: 5,
      actionKey: "signup_complete",
      occurredAtIso: iso,
      surfaceKey: "checkout"
    };
    const first = await earnService.tryCreditEarnFromVerifiedAction({
      userId: 5,
      facts,
      signals: {},
      idempotencyKey: idem,
      metadata: { sourceType: "order", sourceId: "7" }
    });
    expect(first.credited).toBe(true);
    expect(first.duplicate).toBe(false);
    const second = await earnService.tryCreditEarnFromVerifiedAction({
      userId: 5,
      facts,
      signals: {},
      idempotencyKey: idem,
      metadata: { sourceType: "order", sourceId: "7" }
    });
    expect(second.credited).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.ledgerEntry.id).toBe(first.ledgerEntry.id);
    const bal = await rewardsLedgerService.getBalance({ userId: 5 });
    expect(bal.balancePoints).toBe("250");
  });

  it("does not credit when rules deny unknown action", async () => {
    const { earnService, rewardsLedgerService } = makeEarnTestHarness();
    const r = await earnService.tryCreditEarnFromVerifiedAction({
      userId: 9,
      facts: { actorUserId: 9, actionKey: "not_a_real_action", occurredAtIso: new Date().toISOString() },
      signals: {},
      idempotencyKey: buildEarnIdempotencyKey(["noop", "x", "1"]),
      metadata: {}
    });
    expect(r.credited).toBe(false);
    expect(r.duplicate).toBe(false);
    expect(r.ledgerEntry).toBeNull();
    expect(r.decision.allowGrant).toBe(false);
    expect(r.decision.denyReasons).toContain("unknown_action");
    const bal = await rewardsLedgerService.getBalance({ userId: 9 });
    expect(bal.balancePoints).toBe("0");
  });

  it("maps qualified_comment to qualified_engagement ledger reason", async () => {
    const { earnService } = makeEarnTestHarness();
    const iso = new Date().toISOString();
    const r = await earnService.tryCreditEarnFromVerifiedAction({
      userId: 11,
      facts: {
        actorUserId: 11,
        actionKey: "qualified_comment",
        occurredAtIso: iso,
        surfaceKey: "post_detail",
        depth: "qualified",
        targetPostId: 200,
        engagementQuality: 0.9
      },
      signals: {},
      idempotencyKey: buildEarnIdempotencyKey(["qualified_comment", "post", "200", "c", "55"]),
      metadata: { sourceType: "comment", sourceId: "55" }
    });
    expect(r.credited).toBe(true);
    expect(r.ledgerEntry.reason).toBe("qualified_engagement");
  });
});
