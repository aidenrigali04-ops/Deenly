const { createRewardsQualifiedCommentEarnHook, evaluatePersistedCommentSubstance } = require("../src/modules/rewards/rewards-qualified-comment-earn-hook");
const { createRewardsEarnService } = require("../src/modules/rewards/rewards-earn-service");
const { createRewardsLedgerService } = require("../src/modules/rewards/rewards-ledger-service");
const {
  createMemoryRewardsLedgerRepository,
  createMemoryDb
} = require("./helpers/memory-rewards-ledger-repository");

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
    rewardsEarnQualifiedCommentEnabled: true,
    rewardsEarnQualifiedCommentMinChars: 32,
    rewardsEarnQualifiedCommentMinWords: 5,
    ...overrides
  };
}

function makeEarn() {
  const repository = createMemoryRewardsLedgerRepository();
  const db = createMemoryDb({ serializeTransactions: true });
  const analytics = { trackEvent: jest.fn(async () => {}) };
  const rewardsLedgerService = createRewardsLedgerService({ db, analytics, logger: null, repository });
  const rewardsEarnService = createRewardsEarnService({
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
  return { rewardsEarnService, rewardsLedgerService };
}

describe("evaluatePersistedCommentSubstance", () => {
  const th = { minChars: 32, minWords: 5 };

  it("rejects short comments", () => {
    const r = evaluatePersistedCommentSubstance("short", th);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("below_min_chars");
  });

  it("rejects too few words", () => {
    const r = evaluatePersistedCommentSubstance("word word word word word word word word word word", {
      minChars: 20,
      minWords: 12
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("below_min_words");
  });

  it("accepts substantive comment with quality >= threshold", () => {
    const text =
      "This is a thoughtful comment with enough words and characters to pass the substance gate for rewards testing purposes here.";
    const r = evaluatePersistedCommentSubstance(text, th);
    expect(r.ok).toBe(true);
    expect(r.quality).toBeGreaterThanOrEqual(0.58);
  });
});

describe("createRewardsQualifiedCommentEarnHook", () => {
  it("skips when feature flag disabled", async () => {
    const { rewardsEarnService } = makeEarn();
    const hook = createRewardsQualifiedCommentEarnHook({
      rewardsEarnService,
      appConfig: baseAppConfig({ rewardsEarnQualifiedCommentEnabled: false }),
      logger: null
    });
    const out = await hook.maybeCreditAfterCommentInsert({
      userId: 1,
      postId: 10,
      interactionId: 99,
      commentText: "x".repeat(80) + " word ".repeat(10),
      postAuthorId: 2
    });
    expect(out.skipped).toBe("feature_disabled");
  });

  it("skips self-target comments", async () => {
    const { rewardsEarnService } = makeEarn();
    const hook = createRewardsQualifiedCommentEarnHook({
      rewardsEarnService,
      appConfig: baseAppConfig(),
      logger: null
    });
    const text =
      "Sharing reflections on this post with enough length and several words to satisfy the substance gate for rewards.";
    const out = await hook.maybeCreditAfterCommentInsert({
      userId: 5,
      postId: 1,
      interactionId: 1,
      commentText: text,
      postAuthorId: 5
    });
    expect(out.skipped).toBe("self_target");
  });

  it("credits once and dedupes on same interaction id", async () => {
    const { rewardsEarnService, rewardsLedgerService } = makeEarn();
    const hook = createRewardsQualifiedCommentEarnHook({
      rewardsEarnService,
      appConfig: baseAppConfig(),
      logger: null
    });
    const text =
      "Meaningful community feedback with sufficient words and characters so the server substance gate passes reliably.";
    const args = {
      userId: 7,
      postId: 20,
      interactionId: 42,
      commentText: text,
      postAuthorId: 8
    };
    const first = await hook.maybeCreditAfterCommentInsert(args);
    expect(first.credited).toBe(true);
    expect(first.duplicate).toBe(false);
    const balAfterFirst = await rewardsLedgerService.getBalance({ userId: 7 });
    expect(BigInt(balAfterFirst.balancePoints)).toBeGreaterThan(0n);
    const second = await hook.maybeCreditAfterCommentInsert(args);
    expect(second.credited).toBe(true);
    expect(second.duplicate).toBe(true);
    const balAfterSecond = await rewardsLedgerService.getBalance({ userId: 7 });
    expect(balAfterSecond.balancePoints).toBe(balAfterFirst.balancePoints);
  });
});
