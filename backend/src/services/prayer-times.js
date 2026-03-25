const adhan = require("adhan");

const PRAYER_SEQUENCE = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const METHOD_MAP = {
  muslim_world_league: adhan.CalculationMethod.MuslimWorldLeague(),
  north_america: adhan.CalculationMethod.NorthAmerica(),
  egyptian: adhan.CalculationMethod.Egyptian(),
  umm_al_qura: adhan.CalculationMethod.UmmAlQura(),
  karachi: adhan.CalculationMethod.Karachi()
};

const DEFAULT_SETTINGS = {
  latitude: 21.4225,
  longitude: 39.8262,
  timezone: "UTC",
  calculation_method: "muslim_world_league",
  quiet_mode: "prayer_windows",
  quiet_minutes_before: 10,
  quiet_minutes_after: 20,
  last_reminded_prayer_key: null
};

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePrayerSettings(input = {}) {
  const calculationMethod = String(
    input.calculation_method || DEFAULT_SETTINGS.calculation_method
  ).trim().toLowerCase();
  const quietMode = String(input.quiet_mode || DEFAULT_SETTINGS.quiet_mode)
    .trim()
    .toLowerCase();
  const timezone = String(input.timezone || DEFAULT_SETTINGS.timezone).trim() || "UTC";

  return {
    latitude: toNumber(input.latitude, DEFAULT_SETTINGS.latitude),
    longitude: toNumber(input.longitude, DEFAULT_SETTINGS.longitude),
    timezone,
    calculation_method: METHOD_MAP[calculationMethod]
      ? calculationMethod
      : DEFAULT_SETTINGS.calculation_method,
    quiet_mode: ["off", "prayer_windows", "always"].includes(quietMode)
      ? quietMode
      : DEFAULT_SETTINGS.quiet_mode,
    quiet_minutes_before: Math.min(Math.max(Math.floor(toNumber(input.quiet_minutes_before, 10)), 0), 180),
    quiet_minutes_after: Math.min(Math.max(Math.floor(toNumber(input.quiet_minutes_after, 20)), 0), 180),
    last_reminded_prayer_key: input.last_reminded_prayer_key
      ? String(input.last_reminded_prayer_key)
      : null
  };
}

function getPrayerTimesForDate(settings, date = new Date()) {
  const normalized = normalizePrayerSettings(settings);
  const params = METHOD_MAP[normalized.calculation_method] || METHOD_MAP.muslim_world_league;
  const coordinates = new adhan.Coordinates(normalized.latitude, normalized.longitude);
  const prayerTimes = new adhan.PrayerTimes(coordinates, date, params);
  return { normalized, prayerTimes };
}

function getWindows(settings, date = new Date()) {
  const { normalized, prayerTimes } = getPrayerTimesForDate(settings, date);
  return PRAYER_SEQUENCE.map((name) => {
    const prayerAt = prayerTimes[name];
    const startAt = new Date(prayerAt.getTime() - normalized.quiet_minutes_before * 60_000);
    const endAt = new Date(prayerAt.getTime() + normalized.quiet_minutes_after * 60_000);
    return { name, prayerAt, startAt, endAt };
  });
}

function evaluatePrayerStatus(settings, now = new Date()) {
  const normalized = normalizePrayerSettings(settings);
  const windows = getWindows(normalized, now);
  const activeWindow = windows.find((window) => now >= window.startAt && now <= window.endAt) || null;
  const nextWindow = windows.find((window) => now < window.prayerAt) || windows[0];
  const isQuietWindow =
    normalized.quiet_mode === "always" ||
    (normalized.quiet_mode === "prayer_windows" && Boolean(activeWindow));

  const activePrayer = activeWindow?.name || null;
  const activePrayerAt = activeWindow?.prayerAt || null;
  const nextPrayer = nextWindow?.name || null;
  const nextPrayerAt = nextWindow?.prayerAt || null;

  const reminderCandidate = windows.find((window) => {
    const reminderEnd = new Date(window.prayerAt.getTime() + 10 * 60_000);
    return now >= window.prayerAt && now <= reminderEnd;
  });
  const dateKey = now.toISOString().slice(0, 10);
  const reminderKey = reminderCandidate ? `${dateKey}:${reminderCandidate.name}` : null;
  const shouldRemind = Boolean(reminderKey && normalized.last_reminded_prayer_key !== reminderKey);

  return {
    settings: normalized,
    isQuietWindow,
    activePrayer,
    activePrayerAt,
    nextPrayer,
    nextPrayerAt,
    reminderPrayer: reminderCandidate?.name || null,
    reminderKey,
    shouldRemind
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  normalizePrayerSettings,
  evaluatePrayerStatus
};
