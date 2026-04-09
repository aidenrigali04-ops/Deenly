const { listBoostPackages, getBoostPackageById } = require("../src/config/boost-catalog");

describe("boost-catalog", () => {
  it("lists stable ids", () => {
    const items = listBoostPackages();
    expect(items.length).toBeGreaterThan(0);
    const ids = items.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves package by id", () => {
    const first = listBoostPackages()[0];
    expect(getBoostPackageById(first.id)?.id).toBe(first.id);
    expect(getBoostPackageById("unknown")).toBeNull();
  });
});
