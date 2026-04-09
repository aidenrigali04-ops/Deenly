const {
  hasRecentAdBoostLiveForCampaign,
  parseAdBoostLiveDedupeMinutes
} = require("../src/services/ad-boost-notifications");

describe("ad-boost-notifications", () => {
  const origDedupe = process.env.AD_BOOST_LIVE_NOTIFY_DEDUPE_MINUTES;

  it("parseAdBoostLiveDedupeMinutes defaults and rejects out-of-range", () => {
    delete process.env.AD_BOOST_LIVE_NOTIFY_DEDUPE_MINUTES;
    expect(parseAdBoostLiveDedupeMinutes()).toBe(3);
    process.env.AD_BOOST_LIVE_NOTIFY_DEDUPE_MINUTES = "5";
    expect(parseAdBoostLiveDedupeMinutes()).toBe(5);
    process.env.AD_BOOST_LIVE_NOTIFY_DEDUPE_MINUTES = "61";
    expect(parseAdBoostLiveDedupeMinutes()).toBe(3);
    process.env.AD_BOOST_LIVE_NOTIFY_DEDUPE_MINUTES = "not-a-number";
    expect(parseAdBoostLiveDedupeMinutes()).toBe(3);
    if (origDedupe === undefined) {
      delete process.env.AD_BOOST_LIVE_NOTIFY_DEDUPE_MINUTES;
    } else {
      process.env.AD_BOOST_LIVE_NOTIFY_DEDUPE_MINUTES = origDedupe;
    }
  });

  it("hasRecentAdBoostLiveForCampaign short-circuits when window is zero", async () => {
    const db = { query: jest.fn() };
    expect(await hasRecentAdBoostLiveForCampaign(db, 1, 2, 0)).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("hasRecentAdBoostLiveForCampaign reflects rowCount", async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 1 })
    };
    expect(await hasRecentAdBoostLiveForCampaign(db, 10, 20, 3)).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ad_boost_live"),
      [10, 20, 3]
    );
  });
});
