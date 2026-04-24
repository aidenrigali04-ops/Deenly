import { canSurfaceAwardAction } from "../src/features/points/domain/config/points-award-policy";

describe("points surface policy invariants", () => {
  it("only allows scroll on reels surface", () => {
    expect(canSurfaceAwardAction("reels", "scroll")).toBe(true);
    expect(canSurfaceAwardAction("home_feed", "scroll")).toBe(false);
    expect(canSurfaceAwardAction("marketplace_feed", "scroll")).toBe(false);
    expect(canSurfaceAwardAction("post_detail", "scroll")).toBe(false);
    expect(canSurfaceAwardAction("user_profile", "scroll")).toBe(false);
  });

  it("allows like/comment on home and marketplace feeds", () => {
    expect(canSurfaceAwardAction("home_feed", "like")).toBe(true);
    expect(canSurfaceAwardAction("home_feed", "comment")).toBe(true);
    expect(canSurfaceAwardAction("marketplace_feed", "like")).toBe(true);
    expect(canSurfaceAwardAction("marketplace_feed", "comment")).toBe(true);
  });
});
