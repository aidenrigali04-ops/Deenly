const { parseProductHtml, isRestrictedIp } = require("../src/services/product-import-url");

describe("parseProductHtml", () => {
  it("reads JSON-LD Product and Offer", () => {
    const html = `<html><script type="application/ld+json">{"@type":"Product","name":"Widget","description":"Nice","offers":{"@type":"Offer","price":4.99,"priceCurrency":"USD"}}</script></html>`;
    const r = parseProductHtml(html, "https://example.com/p");
    expect(r.draft.title).toBe("Widget");
    expect(r.draft.description).toBe("Nice");
    expect(r.draft.priceMinor).toBe(499);
    expect(r.draft.currency).toBe("usd");
    expect(r.draft.websiteUrl).toBe("https://example.com/p");
    expect(r.confidence).toBe("high");
  });

  it("falls back to Open Graph", () => {
    const html = `<head><meta property="og:title" content="OG Title" /><meta property="og:description" content="OG Desc" /></head>`;
    const r = parseProductHtml(html, "https://shop.example/x");
    expect(r.draft.title).toBe("OG Title");
    expect(r.draft.description).toBe("OG Desc");
    expect(r.confidence).toBe("medium");
    expect(r.draft.priceMinor).toBe(100);
  });
});

describe("isRestrictedIp", () => {
  it("blocks loopback and private IPv4", () => {
    expect(isRestrictedIp("127.0.0.1")).toBe(true);
    expect(isRestrictedIp("10.0.0.1")).toBe(true);
    expect(isRestrictedIp("192.168.1.1")).toBe(true);
  });

  it("allows public IPv4", () => {
    expect(isRestrictedIp("8.8.8.8")).toBe(false);
    expect(isRestrictedIp("1.1.1.1")).toBe(false);
  });
});
