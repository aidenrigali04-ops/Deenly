const {
  buildLedgerReadProjection,
  buildWalletDisplayDto,
  buildDisplayDto,
  buildSourceDto
} = require("../src/modules/rewards/rewards-ledger-read-projection");

describe("rewards-ledger-read-projection", () => {
  it("buildWalletDisplayDto returns stable keys", () => {
    const d = buildWalletDisplayDto();
    expect(d.balanceTitleKey).toMatch(/^rewards\.wallet\./);
    expect(d.ledgerSectionTitleKey).toMatch(/^rewards\.wallet\./);
    expect(d.historyHintKey).toMatch(/^rewards\.wallet\./);
  });

  it("maps signup earn to earn variant and title key", () => {
    const row = {
      entryKind: "earn",
      reason: "signup_complete",
      metadata: { resolvedEarnAction: "signup_complete" },
      idempotencyKey: "earn:signup:user:1",
      deltaPoints: "250",
      reversesLedgerEntryId: null
    };
    const p = buildLedgerReadProjection(row);
    expect(p.ledgerReasonKey).toBe("signup_complete");
    expect(p.resolvedEarnAction).toBe("signup_complete");
    expect(p.display.variant).toBe("earn");
    expect(p.display.titleKey).toBe("rewards.ledger.earn.signup_complete");
    expect(p.reversalOf).toBeNull();
    expect(p.redemption).toBeNull();
  });

  it("infers referral referee subtitle from idempotency key", () => {
    const row = {
      entryKind: "earn",
      reason: "referral_qualified",
      metadata: { attributionId: 9, orderId: 100 },
      idempotencyKey: "referral:qualified:referee:9",
      deltaPoints: "500",
      reversesLedgerEntryId: null
    };
    const p = buildLedgerReadProjection(row);
    expect(p.source?.kind).toBe("attribution");
    expect(p.source?.attributionId).toBe(9);
    expect(p.display.subtitleKey).toBe("rewards.ledger.earn.referral_qualified.subtitle_referee");
  });

  it("maps catalog spend to redemption DTO and spend title", () => {
    const row = {
      entryKind: "spend",
      reason: "redemption_catalog",
      metadata: {
        surface: "product_checkout",
        productId: 42,
        discountMinor: 100,
        listPriceMinor: 1000
      },
      idempotencyKey: "checkout:product:1:req",
      deltaPoints: "-50",
      reversesLedgerEntryId: null
    };
    const p = buildLedgerReadProjection(row);
    expect(p.display.variant).toBe("spend");
    expect(p.display.titleKey).toBe("rewards.ledger.spend.redemption_catalog");
    expect(p.redemption?.surface).toBe("product_checkout");
    expect(p.redemption?.productId).toBe(42);
    expect(p.source?.kind).toBe("checkout");
  });

  it("maps reversal row with reversalOf", () => {
    const row = {
      entryKind: "reversal",
      reason: "checkout_reverse",
      metadata: { surface: "product_checkout" },
      idempotencyKey: "reverse:r:sess",
      deltaPoints: "50",
      reversesLedgerEntryId: 88
    };
    const p = buildLedgerReadProjection(row);
    expect(p.display.variant).toBe("reversal");
    expect(p.display.titleKey).toBe("rewards.ledger.reversal._default");
    expect(p.reversalOf).toEqual({ originalLedgerEntryId: 88 });
  });

  it("buildSourceDto returns order when orderId present without attribution rule", () => {
    const src = buildSourceDto({ orderId: 3, orderKind: "product" }, "earn", "purchase_completed");
    expect(src).toEqual({ kind: "order", orderId: 3, orderKind: "product" });
  });

  it("buildDisplayDto uses unknown title for unfamiliar earn reason", () => {
    const d = buildDisplayDto({
      entryKind: "earn",
      reason: "legacy_promo",
      metadata: {},
      idempotencyKey: "k",
      deltaPoints: "1"
    });
    expect(d.titleKey).toBe("rewards.ledger.earn._unknown");
  });
});
