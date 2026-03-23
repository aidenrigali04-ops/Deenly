import fs from "node:fs";

describe("release gates baseline", () => {
  it("checks required env keys exist in example", () => {
    const content = fs.readFileSync(".env.example", "utf8");
    expect(content).toContain("EXPO_PUBLIC_API_BASE_URL");
    expect(content).toContain("EXPO_PUBLIC_ADMIN_OWNER_EMAIL");
  });
});
