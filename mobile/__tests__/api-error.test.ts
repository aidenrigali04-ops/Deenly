import { ApiError } from "../src/lib/api-error";

describe("ApiError", () => {
  it("carries HTTP or synthetic status for UI branching (e.g. offline === 0)", () => {
    const offline = new ApiError("offline", 0);
    expect(offline.status).toBe(0);
    expect(offline.message).toBe("offline");
    expect(offline.name).toBe("ApiError");
    expect(offline).toBeInstanceOf(Error);
    expect(offline).toBeInstanceOf(ApiError);
  });

  it("is distinguishable with instanceof for auth and checkout error paths", () => {
    const unauthorized = new ApiError("Session expired", 401);
    expect(unauthorized.status).toBe(401);
  });
});
