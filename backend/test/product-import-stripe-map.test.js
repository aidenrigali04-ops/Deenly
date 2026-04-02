const { mapStripeProductPriceToDraft } = require("../src/services/product-import-stripe-map");

describe("mapStripeProductPriceToDraft", () => {
  it("maps one-time price to service", () => {
    const draft = mapStripeProductPriceToDraft(
      { name: "Book", description: "Desc" },
      { unit_amount: 999, currency: "usd", recurring: null }
    );
    expect(draft.productType).toBe("service");
    expect(draft.priceMinor).toBe(999);
    expect(draft.currency).toBe("usd");
    expect(draft.title).toBe("Book");
    expect(draft.description).toBe("Desc");
  });

  it("maps recurring price to subscription", () => {
    const draft = mapStripeProductPriceToDraft(
      { name: "Pro" },
      { unit_amount: 1500, currency: "eur", recurring: { interval: "month" } }
    );
    expect(draft.productType).toBe("subscription");
    expect(draft.currency).toBe("eur");
  });

  it("throws on missing unit_amount", () => {
    expect(() =>
      mapStripeProductPriceToDraft({ name: "X" }, { unit_amount: null, currency: "usd" })
    ).toThrow();
  });
});
