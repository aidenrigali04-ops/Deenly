const {
  orderQualifiesForReferral,
  purchaseWithinAttributionWindow,
  computeClearAfterAt,
  isClearWindowSatisfied
} = require("../src/modules/referrals/referral-qualification");

describe("referral-qualification", () => {
  const baseCfg = {
    minQualifyingOrderAmountMinor: 50,
    qualifyingOrderKinds: ["product"],
    allowBuyerIsSellerForQualification: false
  };

  it("accepts completed product order above min with distinct buyer/seller", () => {
    const r = orderQualifiesForReferral(
      {
        id: 1,
        buyer_user_id: 2,
        seller_user_id: 3,
        status: "completed",
        kind: "product",
        amount_minor: 100
      },
      baseCfg
    );
    expect(r).toEqual({ ok: true });
  });

  it("rejects buyer equals seller when disabled", () => {
    const r = orderQualifiesForReferral(
      {
        id: 1,
        buyer_user_id: 2,
        seller_user_id: 2,
        status: "completed",
        kind: "product",
        amount_minor: 100
      },
      baseCfg
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("buyer_is_seller");
  });

  it("rejects excluded order kind", () => {
    const r = orderQualifiesForReferral(
      {
        id: 1,
        buyer_user_id: 2,
        seller_user_id: 3,
        status: "completed",
        kind: "subscription",
        amount_minor: 100
      },
      baseCfg
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("order_kind_excluded");
  });

  it("rejects below min amount", () => {
    const r = orderQualifiesForReferral(
      {
        id: 1,
        buyer_user_id: 2,
        seller_user_id: 3,
        status: "completed",
        kind: "product",
        amount_minor: 10
      },
      baseCfg
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("below_min_amount");
  });

  it("purchaseWithinAttributionWindow respects days", () => {
    const attributed = new Date("2026-01-01T00:00:00.000Z");
    const inside = new Date("2026-01-15T12:00:00.000Z");
    const outside = new Date("2026-02-05T00:00:00.000Z");
    expect(purchaseWithinAttributionWindow(attributed, inside, 30)).toBe(true);
    expect(purchaseWithinAttributionWindow(attributed, outside, 30)).toBe(false);
  });

  it("computeClearAfterAt adds hours", () => {
    const o = new Date("2026-01-01T12:00:00.000Z");
    const clear = computeClearAfterAt(o, 2);
    expect(clear.getTime()).toBe(o.getTime() + 2 * 3_600_000);
  });

  it("isClearWindowSatisfied", () => {
    const clearAfter = new Date("2026-01-02T00:00:00.000Z");
    expect(isClearWindowSatisfied(new Date("2026-01-01T23:00:00.000Z"), clearAfter)).toBe(false);
    expect(isClearWindowSatisfied(new Date("2026-01-02T01:00:00.000Z"), clearAfter)).toBe(true);
  });
});
