const { createRankingSignalHooks } = require("../src/modules/feed/feed-rank-signals");

describe("feed-rank-signals", () => {
  it("onPostViewSignalsWritten records sampled feed_ranking_signal_ingested", async () => {
    const trackEvent = jest.fn(async () => {});
    const hooks = createRankingSignalHooks({
      analytics: { trackEvent },
      config: { feedRankModifierAnalyticsSampleRate: 1 }
    });
    await hooks.onPostViewSignalsWritten({ userId: 3, postId: 9, deduped: false });
    expect(trackEvent).toHaveBeenCalledWith(
      "feed_ranking_signal_ingested",
      expect.objectContaining({ surface: "post_views", postId: 9, userId: 3 })
    );
  });

  it("onCommerceRankingSignalsUpdated records product order surface", async () => {
    const trackEvent = jest.fn(async () => {});
    const hooks = createRankingSignalHooks({
      analytics: { trackEvent },
      config: { feedRankModifierAnalyticsSampleRate: 1 }
    });
    await hooks.onCommerceRankingSignalsUpdated({ productId: 44, orderId: 501 });
    expect(trackEvent).toHaveBeenCalledWith(
      "feed_ranking_signal_ingested",
      expect.objectContaining({ surface: "orders_completed", productId: 44, orderId: 501 })
    );
  });

  it("onCommerceRankingSignalsUpdated can emit large-order trust flag", async () => {
    const recordFlag = jest.fn(async () => ({ saved: { id: 1 } }));
    const hooks = createRankingSignalHooks({
      analytics: null,
      config: {
        trustSignalsEnabled: true,
        trustCommerceOrderFlagMinor: 1000
      },
      trustFlagService: { recordFlag }
    });
    await hooks.onCommerceRankingSignalsUpdated({
      productId: 1,
      orderId: 2,
      buyerUserId: 9,
      sellerUserId: 8,
      orderAmountMinor: 5000
    });
    expect(recordFlag).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        domain: "ranking",
        flagType: "commerce_large_completed_order",
        subjectUserId: 8
      })
    );
  });

  it("persists post_view row when store enabled", async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1 });
    const hooks = createRankingSignalHooks({
      db: { query },
      analytics: null,
      config: { feedRankingSignalStoreEnabled: true, feedRankModifierAnalyticsSampleRate: 0 }
    });
    await hooks.onPostViewSignalsWritten({ userId: 3, postId: 9, deduped: false });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO feed_ranking_signals"),
      expect.arrayContaining(["post", "9", "post_view_quality_v1", "post_views"])
    );
  });

  it("onSocialEngagementRankingSignalsUpdated persists when store enabled", async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1 });
    const trackEvent = jest.fn(async () => {});
    const hooks = createRankingSignalHooks({
      db: { query },
      analytics: { trackEvent },
      config: { feedRankingSignalStoreEnabled: true, feedRankModifierAnalyticsSampleRate: 1 }
    });
    await hooks.onSocialEngagementRankingSignalsUpdated({
      postId: 12,
      userId: 4,
      interactionType: "benefited"
    });
    expect(query).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith(
      "feed_ranking_signal_ingested",
      expect.objectContaining({ surface: "interactions", postId: 12 })
    );
  });
});
