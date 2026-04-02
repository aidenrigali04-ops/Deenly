const { hashToken, generateRawToken } = require("../src/services/purchase-access-token");

describe("purchase-access-token", () => {
  it("hashToken is stable for same input", () => {
    const h1 = hashToken("abc");
    const h2 = hashToken("abc");
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
  });

  it("generateRawToken returns distinct values", () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});
