const { evaluatePrayerStatus, normalizePrayerSettings } = require("../../src/services/prayer-times");

describe("prayer-times", () => {
  it("normalizes invalid values to safe defaults", () => {
    const normalized = normalizePrayerSettings({
      latitude: "bad",
      longitude: null,
      quiet_mode: "invalid"
    });
    expect(normalized.calculation_method).toBe("muslim_world_league");
    expect(normalized.quiet_mode).toBe("prayer_windows");
    expect(typeof normalized.latitude).toBe("number");
    expect(typeof normalized.longitude).toBe("number");
  });

  it("forces quiet window in always mode", () => {
    const status = evaluatePrayerStatus(
      {
        latitude: 21.4225,
        longitude: 39.8262,
        timezone: "UTC",
        quiet_mode: "always",
        quiet_minutes_before: 0,
        quiet_minutes_after: 0
      },
      new Date("2026-03-21T12:00:00.000Z")
    );
    expect(status.isQuietWindow).toBe(true);
  });
});
