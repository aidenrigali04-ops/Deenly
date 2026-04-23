import {
  buildCommentDedupeKey,
  buildFollowDedupeKey,
  buildLikeDedupeKey,
  buildPurchaseDedupeKey,
  canSurfaceAwardAction
} from "../src/features/points/domain/config/points-award-policy";

describe("points-award-policy", () => {
  it("enforces surface action policy", () => {
    expect(canSurfaceAwardAction("reels", "scroll")).toBe(true);
    expect(canSurfaceAwardAction("reels", "comment")).toBe(true);
    expect(canSurfaceAwardAction("reels", "follow")).toBe(false);

    expect(canSurfaceAwardAction("home_feed", "like")).toBe(true);
    expect(canSurfaceAwardAction("home_feed", "scroll")).toBe(false);
    expect(canSurfaceAwardAction("marketplace_feed", "scroll")).toBe(false);
  });

  it("builds stable dedupe keys", () => {
    const now = new Date("2026-04-23T10:00:00.000Z");
    expect(buildLikeDedupeKey(99, now)).toBe("like:d:2026-04-23:post:99");
    expect(buildCommentDedupeKey(7, "Nice reel!", now)).toBe("comment:d:2026-04-23:post:7:txt:nice_reel");
    expect(buildFollowDedupeKey("u-44")).toBe("follow:user:u-44");
    expect(buildPurchaseDedupeKey("order-300")).toBe("order:order-300");
  });
});
