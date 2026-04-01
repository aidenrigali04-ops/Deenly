const { parseSearchKeywords } = require("../src/utils/search-keywords");

describe("parseSearchKeywords", () => {
  it("treats empty query as unfiltered (all)", () => {
    expect(parseSearchKeywords("")).toEqual({ all: true, terms: [] });
    expect(parseSearchKeywords("   ")).toEqual({ all: true, terms: [] });
  });

  it("splits multi-word queries into AND terms", () => {
    expect(parseSearchKeywords("crypto trading")).toEqual({
      all: false,
      terms: ["crypto", "trading"]
    });
  });

  it("preserves underscores inside tokens", () => {
    expect(parseSearchKeywords("search_").terms).toContain("search_");
  });

  it("returns empty terms for a single-character query", () => {
    expect(parseSearchKeywords("a")).toEqual({ all: false, terms: [] });
  });
});
