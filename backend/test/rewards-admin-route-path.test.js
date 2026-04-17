const { rewardsRoutePath } = require("../src/modules/admin/rewards-admin-routes");

describe("rewardsRoutePath", () => {
  it("builds paths under /rewards for owner admin mount", () => {
    expect(rewardsRoutePath("/rewards", "ledger-entries")).toBe("/rewards/ledger-entries");
    expect(rewardsRoutePath("/rewards", "referrals/queue")).toBe("/rewards/referrals/queue");
  });

  it("builds paths at root for monetization /admin/rewards mount", () => {
    expect(rewardsRoutePath("", "fraud-flags")).toBe("/fraud-flags");
    expect(rewardsRoutePath("", "ledger-entries")).toBe("/ledger-entries");
  });
});
