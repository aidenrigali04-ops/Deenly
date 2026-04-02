const { parseSmsOptIn } = require("../src/services/purchase-fulfillment");

describe("parseSmsOptIn", () => {
  it("detects true variants", () => {
    expect(parseSmsOptIn({ smsOptIn: true })).toBe(true);
    expect(parseSmsOptIn({ smsOptIn: "true" })).toBe(true);
  });

  it("defaults false", () => {
    expect(parseSmsOptIn(null)).toBe(false);
    expect(parseSmsOptIn({})).toBe(false);
    expect(parseSmsOptIn({ smsOptIn: false })).toBe(false);
  });
});
