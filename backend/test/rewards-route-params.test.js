const { parseRewardsLedgerQuery } = require("../src/modules/rewards/rewards-route-params");

describe("parseRewardsLedgerQuery", () => {
  it("defaults cursor null and limit 20", () => {
    expect(parseRewardsLedgerQuery({})).toEqual({ cursor: null, limit: 20 });
  });

  it("clamps limit to 1–100", () => {
    expect(parseRewardsLedgerQuery({ limit: "0" })).toEqual({ cursor: null, limit: 1 });
    expect(parseRewardsLedgerQuery({ limit: "500" })).toEqual({ cursor: null, limit: 100 });
    expect(parseRewardsLedgerQuery({ limit: "15" })).toEqual({ cursor: null, limit: 15 });
  });

  it("passes cursor when present", () => {
    expect(parseRewardsLedgerQuery({ cursor: "abc", limit: "10" })).toEqual({ cursor: "abc", limit: 10 });
  });
});
