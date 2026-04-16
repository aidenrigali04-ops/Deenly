const {
  requirePositiveInt,
  requireNonNegativeInt,
  requireEnum,
  parsePagination,
  parseOffsetPagination,
  encodeCursor,
  decodeCursor,
  requireRewardString,
} = require("./validators");

describe("rewards validators", () => {
  describe("requirePositiveInt", () => {
    it("accepts positive integers", () => {
      expect(requirePositiveInt("x", 5)).toBe(5);
      expect(requirePositiveInt("x", "42")).toBe(42);
    });
    it("rejects zero, negatives, non-numbers", () => {
      expect(() => requirePositiveInt("x", 0)).toThrow();
      expect(() => requirePositiveInt("x", -1)).toThrow();
      expect(() => requirePositiveInt("x", "abc")).toThrow();
    });
  });

  describe("requireNonNegativeInt", () => {
    it("accepts zero and positives", () => {
      expect(requireNonNegativeInt("x", 0)).toBe(0);
      expect(requireNonNegativeInt("x", 5)).toBe(5);
    });
    it("rejects negatives", () => {
      expect(() => requireNonNegativeInt("x", -5)).toThrow();
    });
  });

  describe("requireEnum", () => {
    it("accepts allowed values (case-insensitive)", () => {
      expect(requireEnum("role", "Admin", ["admin", "user"])).toBe("admin");
    });
    it("rejects disallowed values", () => {
      expect(() => requireEnum("role", "god", ["admin", "user"])).toThrow();
    });
  });

  describe("cursors", () => {
    it("round-trips encode/decode", () => {
      const payload = { createdAt: "2026-01-01T00:00:00Z", id: "abc" };
      const cursor = encodeCursor(payload);
      expect(typeof cursor).toBe("string");
      const decoded = decodeCursor(cursor);
      expect(decoded).toEqual(payload);
    });
    it("decodeCursor returns null for invalid input", () => {
      expect(decodeCursor("not-a-cursor")).toBeNull();
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor("")).toBeNull();
    });
  });

  describe("parsePagination", () => {
    it("uses defaults when empty", () => {
      const r = parsePagination({});
      expect(r.limit).toBeGreaterThan(0);
      expect(r.cursor).toBeNull();
    });
    it("clamps limit to max", () => {
      const r = parsePagination({ limit: 9999 });
      expect(r.limit).toBeLessThanOrEqual(100);
    });
  });

  describe("parseOffsetPagination", () => {
    it("respects numeric offset", () => {
      const r = parseOffsetPagination({ limit: 10, offset: 20 });
      expect(r.limit).toBe(10);
      expect(r.offset).toBe(20);
    });
  });

  describe("requireRewardString", () => {
    it("trims and enforces length bounds", () => {
      expect(requireRewardString("x", "  hi there  ", { min: 3, max: 50 })).toBe(
        "hi there"
      );
      expect(() => requireRewardString("x", "ab", { min: 3, max: 50 })).toThrow();
      expect(() => requireRewardString("x", "a".repeat(60), { min: 1, max: 50 })).toThrow();
    });
  });
});
