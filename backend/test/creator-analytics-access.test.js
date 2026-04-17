const { resolveTargetCreatorUserId } = require("../src/modules/creator/creator-analytics-access");

describe("creator-analytics-access", () => {
  it("returns self id when query omitted", () => {
    const req = { user: { id: 5, role: "user" } };
    expect(resolveTargetCreatorUserId(req, null)).toBe(5);
  });

  it("allows self when query matches", () => {
    const req = { user: { id: 5, role: "user" } };
    expect(resolveTargetCreatorUserId(req, 5)).toBe(5);
  });

  it("blocks non-elevated users from other creators", () => {
    const req = { user: { id: 5, role: "user" } };
    expect(() => resolveTargetCreatorUserId(req, 9)).toThrow(/Cannot access another creator/);
  });

  it("allows moderators to query other creators", () => {
    const req = { user: { id: 2, role: "moderator" } };
    expect(resolveTargetCreatorUserId(req, 99)).toBe(99);
  });

  it("allows admins to query other creators", () => {
    const req = { user: { id: 2, role: "admin" } };
    expect(resolveTargetCreatorUserId(req, 100)).toBe(100);
  });

  it("rejects invalid creator id", () => {
    const req = { user: { id: 5, role: "user" } };
    expect(() => resolveTargetCreatorUserId(req, 0)).toThrow();
  });
});
