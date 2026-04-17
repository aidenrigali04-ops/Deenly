const { createSellerBoostService } = require("../src/modules/seller-boosts/seller-boost-service");
const {
  SellerBoostInvalidStateError,
  SellerBoostNotFoundError,
  SellerBoostPostOwnershipError
} = require("../src/modules/seller-boosts/seller-boost-errors");
const {
  createMemorySellerBoostRepository,
  createMemoryDbForSellerBoost
} = require("./helpers/memory-seller-boost-repository");

describe("createSellerBoostService (memory repository)", () => {
  function makeService(overrides = {}) {
    const repository = createMemorySellerBoostRepository();
    repository._setPostAuthor(101, 1);
    repository._setPostAuthor(102, 1);
    const db = createMemoryDbForSellerBoost(repository);
    const analytics = { trackEvent: jest.fn(async () => {}) };
    const fixed = overrides.fixedNow ? new Date(overrides.fixedNow) : null;
    const service = createSellerBoostService({
      db,
      analytics,
      logger: null,
      repository,
      config: overrides.config ?? { sellerBoostRankModifierPointsCap: 500 },
      now: fixed ? () => fixed : () => new Date(),
      ...overrides.serviceExtra
    });
    return { service, analytics, repository };
  }

  it("createPurchase then recordPaymentCompleted activates with duration", async () => {
    const fixedNow = "2026-06-01T12:00:00.000Z";
    const { service } = makeService({ fixedNow });
    const { purchase, duplicate } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "p1"
    });
    expect(duplicate).toBe(false);
    expect(purchase.status).toBe("pending_payment");

    const paid = await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "pay_evt_1"
    });
    expect(paid.duplicate).toBe(false);
    expect(paid.purchase.status).toBe("active");
    expect(paid.purchase.endsAt).toBe("2026-06-04T12:00:00.000Z");

    const again = await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "pay_evt_1",
      stripePaymentIntentId: "pi_evt_dup"
    });
    expect(again.duplicate).toBe(true);
    const afterDup = await service.getPurchase({ purchaseId: purchase.id, sellerUserId: 1 });
    expect(afterDup.metadata?.stripePaymentIntentId).toBe("pi_evt_dup");
  });

  it("recordPaymentCompleted stores stripePaymentIntentId in metadata for refunds", async () => {
    const { service } = makeService({ fixedNow: "2026-06-01T12:00:00.000Z" });
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "pi_meta_1"
    });
    await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "cs_test_1",
      stripePaymentIntentId: "pi_test_123"
    });
    const loaded = await service.getPurchase({ purchaseId: purchase.id, sellerUserId: 1 });
    expect(loaded.metadata?.stripePaymentIntentId).toBe("pi_test_123");
  });

  it("expirePurchaseIfDue marks active purchase expired", async () => {
    const { service } = makeService({ fixedNow: "2026-01-01T00:00:00.000Z" });
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "exp1"
    });
    await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "pay_a"
    });
    const r = await service.expirePurchaseIfDue({
      purchaseId: purchase.id,
      sellerUserId: 1,
      asOf: new Date("2026-06-10T00:00:00.000Z")
    });
    expect(r.expired).toBe(true);
    const loaded = await service.getPurchase({ purchaseId: purchase.id, sellerUserId: 1 });
    expect(loaded.status).toBe("expired");
  });

  it("cancelPendingPurchase only in pending state", async () => {
    const { service } = makeService();
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_7d",
      idempotencyKey: "c1"
    });
    await expect(service.cancelPendingPurchase({ purchaseId: purchase.id, sellerUserId: 2 })).rejects.toBeInstanceOf(
      SellerBoostNotFoundError
    );
    const { canceled } = await service.cancelPendingPurchase({ purchaseId: purchase.id, sellerUserId: 1 });
    expect(canceled).toBe(true);
    await expect(
      service.recordPaymentCompleted({
        purchaseId: purchase.id,
        sellerUserId: 1,
        paymentConfirmationId: "x"
      })
    ).rejects.toBeInstanceOf(SellerBoostInvalidStateError);
  });

  it("rejects createPurchase when post not owned by seller", async () => {
    const { service, repository } = makeService();
    repository._setPostAuthor(999, 2);
    await expect(
      service.createPurchase({
        sellerUserId: 1,
        postIds: [999],
        packageTierId: "seller_rank_assist_7d",
        idempotencyKey: "bad"
      })
    ).rejects.toBeInstanceOf(SellerBoostPostOwnershipError);
  });

  it("recordImpression only when active and post is target", async () => {
    const { service } = makeService();
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_7d",
      idempotencyKey: "imp1"
    });
    const before = await service.recordImpression({
      purchaseId: purchase.id,
      postId: 101,
      viewerUserId: 5,
      metadata: { surface: "feed" }
    });
    expect(before.recorded).toBe(false);

    await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "pay_imp"
    });
    const after = await service.recordImpression({
      purchaseId: purchase.id,
      postId: 101,
      viewerUserId: 5,
      metadata: { surface: "feed" }
    });
    expect(after.recorded).toBe(true);

    const wrongPost = await service.recordImpression({
      purchaseId: purchase.id,
      postId: 102,
      viewerUserId: 5,
      metadata: {}
    });
    expect(wrongPost.recorded).toBe(false);
  });

  it("expireDuePurchases batch expires multiple", async () => {
    const { service } = makeService({ fixedNow: "2026-01-01T00:00:00.000Z" });
    const a = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "b1"
    });
    const b = await service.createPurchase({
      sellerUserId: 1,
      postIds: [102],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "b2"
    });
    await service.recordPaymentCompleted({
      purchaseId: a.purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "p1"
    });
    await service.recordPaymentCompleted({
      purchaseId: b.purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "p2"
    });
    const { expiredIds } = await service.expireDuePurchases({
      asOf: new Date("2026-12-01T00:00:00.000Z")
    });
    expect(expiredIds.length).toBe(2);
  });

  it("createPurchase idempotent on same idempotency key", async () => {
    const { service } = makeService();
    const first = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_7d",
      idempotencyKey: "idem"
    });
    const second = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_7d",
      idempotencyKey: "idem"
    });
    expect(second.duplicate).toBe(true);
    expect(second.purchase.id).toBe(first.purchase.id);
  });

  it("cannot cancel after activation", async () => {
    const { service } = makeService();
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_7d",
      idempotencyKey: "noc"
    });
    await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "ok"
    });
    await expect(
      service.cancelPendingPurchase({ purchaseId: purchase.id, sellerUserId: 1 })
    ).rejects.toBeInstanceOf(SellerBoostInvalidStateError);
  });

  it("emits ranking modifier context after activation (modifier-only semantics)", async () => {
    const { service, analytics } = makeService({ fixedNow: "2026-06-01T12:00:00.000Z" });
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_7d",
      idempotencyKey: "ctx1"
    });
    await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "pay_ctx"
    });
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "seller_boost_ranking_modifier_context",
      expect.objectContaining({
        purchaseId: purchase.id,
        sellerUserId: 1,
        packageTierId: "seller_rank_assist_7d",
        rankModifierPoints: 22,
        semantics: "modifier_only_not_override",
        targetPostIds: [101]
      })
    );
  });

  it("applies sellerBoostRankModifierPointsCap to emitted rankModifierPoints", async () => {
    const { service, analytics } = makeService({
      fixedNow: "2026-06-01T12:00:00.000Z",
      config: { sellerBoostRankModifierPointsCap: 5 }
    });
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_7d",
      idempotencyKey: "capctx"
    });
    await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "pay_cap"
    });
    const ctxCall = analytics.trackEvent.mock.calls.find((c) => c[0] === "seller_boost_ranking_modifier_context");
    expect(ctxCall).toBeDefined();
    expect(ctxCall[1].rankModifierPoints).toBe(5);
  });

  it("recordPurchaseRefunded marks active purchase then blocks re-activation", async () => {
    const { service } = makeService();
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "ref1"
    });
    await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "pay_ref"
    });
    const { refunded } = await service.recordPurchaseRefunded({ purchaseId: purchase.id, sellerUserId: 1 });
    expect(refunded).toBe(true);
    const loaded = await service.getPurchase({ purchaseId: purchase.id, sellerUserId: 1 });
    expect(loaded.status).toBe("refunded");
    await expect(
      service.recordPaymentCompleted({
        purchaseId: purchase.id,
        sellerUserId: 1,
        paymentConfirmationId: "pay_again"
      })
    ).rejects.toBeInstanceOf(SellerBoostInvalidStateError);
  });

  it("recordPurchaseRefunded works on pending_payment", async () => {
    const { service } = makeService();
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "refp"
    });
    const { refunded } = await service.recordPurchaseRefunded({ purchaseId: purchase.id, sellerUserId: 1 });
    expect(refunded).toBe(true);
    const loaded = await service.getPurchase({ purchaseId: purchase.id, sellerUserId: 1 });
    expect(loaded.status).toBe("refunded");
  });

  it("recordImpression is false after purchase has expired", async () => {
    const { service } = makeService({ fixedNow: "2026-01-01T00:00:00.000Z" });
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "expimp"
    });
    await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "pay_expimp"
    });
    await service.expirePurchaseIfDue({
      purchaseId: purchase.id,
      sellerUserId: 1,
      asOf: new Date("2026-12-01T00:00:00.000Z")
    });
    const r = await service.recordImpression({
      purchaseId: purchase.id,
      postId: 101,
      viewerUserId: 9,
      metadata: { surface: "feed" }
    });
    expect(r.recorded).toBe(false);
  });

  it("expirePurchaseIfDue returns expired false when window not ended", async () => {
    const { service } = makeService({ fixedNow: "2026-01-01T00:00:00.000Z" });
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_14d",
      idempotencyKey: "notdue"
    });
    await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "pay_nd"
    });
    const r = await service.expirePurchaseIfDue({
      purchaseId: purchase.id,
      sellerUserId: 1,
      asOf: new Date("2026-01-05T00:00:00.000Z")
    });
    expect(r.expired).toBe(false);
    const loaded = await service.getPurchase({ purchaseId: purchase.id, sellerUserId: 1 });
    expect(loaded.status).toBe("active");
  });

  it("recordPaymentCompleted throws NotFound for wrong seller", async () => {
    const { service } = makeService();
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "ws"
    });
    await expect(
      service.recordPaymentCompleted({
        purchaseId: purchase.id,
        sellerUserId: 2,
        paymentConfirmationId: "x"
      })
    ).rejects.toBeInstanceOf(SellerBoostNotFoundError);
  });

  it("recordPaymentCompleted rejects different confirmation after activation", async () => {
    const { service } = makeService();
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "duppay"
    });
    await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "first"
    });
    await expect(
      service.recordPaymentCompleted({
        purchaseId: purchase.id,
        sellerUserId: 1,
        paymentConfirmationId: "second"
      })
    ).rejects.toBeInstanceOf(SellerBoostInvalidStateError);
  });

  it("emits seller_boost_impression_attribution after a recorded impression", async () => {
    const { service, analytics } = makeService();
    const { purchase } = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_7d",
      idempotencyKey: "attrimp"
    });
    await service.recordPaymentCompleted({
      purchaseId: purchase.id,
      sellerUserId: 1,
      paymentConfirmationId: "pay_attr"
    });
    await service.recordImpression({
      purchaseId: purchase.id,
      postId: 101,
      viewerUserId: 42,
      metadata: { surface: "feed" }
    });
    const attr = analytics.trackEvent.mock.calls.find((c) => c[0] === "seller_boost_impression_attribution");
    expect(attr).toBeDefined();
    expect(attr[1]).toMatchObject({
      kind: "seller_boost_impression",
      purchaseId: purchase.id,
      postId: 101,
      viewerUserId: 42,
      semantics: "modifier_only_not_override"
    });
  });

  it("listMyPurchases returns purchases for seller ordered by id desc", async () => {
    const { service } = makeService();
    const a = await service.createPurchase({
      sellerUserId: 1,
      postIds: [101],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "l1"
    });
    await service.createPurchase({
      sellerUserId: 1,
      postIds: [102],
      packageTierId: "seller_rank_assist_3d",
      idempotencyKey: "l2"
    });
    const { items } = await service.listMyPurchases({ sellerUserId: 1, limit: 10 });
    expect(items.length).toBe(2);
    expect(items[0].id).toBeGreaterThanOrEqual(items[1].id);
    expect(items.some((p) => p.id === a.purchase.id)).toBe(true);
  });
});
