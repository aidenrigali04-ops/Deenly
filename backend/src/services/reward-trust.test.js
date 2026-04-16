const { scoreToBand } = require("./reward-trust");

describe("reward-trust.scoreToBand", () => {
  it("maps 0 -> high_risk", () => {
    expect(scoreToBand(0)).toBe("high_risk");
    expect(scoreToBand(249)).toBe("high_risk");
  });
  it("maps 250-449 -> poor", () => {
    expect(scoreToBand(250)).toBe("poor");
    expect(scoreToBand(449)).toBe("poor");
  });
  it("maps 450-649 -> fair", () => {
    expect(scoreToBand(450)).toBe("fair");
    expect(scoreToBand(649)).toBe("fair");
  });
  it("maps 650-799 -> good", () => {
    expect(scoreToBand(650)).toBe("good");
    expect(scoreToBand(799)).toBe("good");
  });
  it("maps 800+ -> excellent", () => {
    expect(scoreToBand(800)).toBe("excellent");
    expect(scoreToBand(1000)).toBe("excellent");
  });
});
