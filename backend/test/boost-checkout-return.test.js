const {
  normalizeBoostCheckoutReturnClient,
  resolveAdBoostStripeReturnUrls
} = require("../src/utils/boost-checkout-return");

describe("boost-checkout-return", () => {
  it("normalizes return client", () => {
    expect(normalizeBoostCheckoutReturnClient(undefined)).toBe("web");
    expect(normalizeBoostCheckoutReturnClient("WEB")).toBe("web");
    expect(normalizeBoostCheckoutReturnClient("mobile_app")).toBe("mobile_app");
    expect(normalizeBoostCheckoutReturnClient("app")).toBe("mobile_app");
    expect(normalizeBoostCheckoutReturnClient("evil")).toBeNull();
  });

  it("resolves web URLs from APP base", () => {
    const r = resolveAdBoostStripeReturnUrls({
      appBaseUrl: "https://app.example.com/",
      campaignId: 12,
      returnClient: "web"
    });
    expect(r.successUrl).toContain("https://app.example.com/checkout/success");
    expect(r.successUrl).toContain("campaign_id=12");
    expect(r.successUrl).toContain("{CHECKOUT_SESSION_ID}");
    expect(r.cancelUrl).toBe("https://app.example.com/checkout/cancel?kind=ad_boost&campaign_id=12");
  });

  it("resolves mobile deep links", () => {
    const r = resolveAdBoostStripeReturnUrls({
      appBaseUrl: "https://ignored.example/",
      campaignId: 7,
      returnClient: "mobile_app"
    });
    expect(r.successUrl).toBe(
      "deenly:///checkout/success?kind=ad_boost&campaign_id=7&session_id={CHECKOUT_SESSION_ID}"
    );
    expect(r.cancelUrl).toBe("deenly:///checkout/cancel?kind=ad_boost&campaign_id=7");
  });
});
