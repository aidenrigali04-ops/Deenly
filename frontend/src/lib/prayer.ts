import { apiRequest } from "@/lib/api";

export type PrayerSettings = {
  latitude: number;
  longitude: number;
  timezone: string;
  calculation_method: string;
  quiet_mode: "off" | "prayer_windows" | "always";
  quiet_minutes_before: number;
  quiet_minutes_after: number;
  last_reminded_prayer_key: string | null;
};

export type PrayerStatus = {
  isQuietWindow: boolean;
  activePrayer: string | null;
  activePrayerAt: string | null;
  nextPrayer: string | null;
  nextPrayerAt: string | null;
  reminderPrayer: string | null;
  reminderKey: string | null;
  shouldRemind: boolean;
  reminderText: string | null;
};

export function fetchPrayerSettings() {
  return apiRequest<PrayerSettings>("/notifications/prayer-settings", { auth: true });
}

export function updatePrayerSettings(input: Partial<PrayerSettings>) {
  return apiRequest<PrayerSettings>("/notifications/prayer-settings", {
    method: "PUT",
    auth: true,
    body: input
  });
}

export function fetchPrayerStatus() {
  return apiRequest<PrayerStatus>("/notifications/prayer-status", { auth: true });
}

export function ackPrayerReminder(reminderKey: string) {
  return apiRequest<{ ok: boolean; reminderKey: string }>("/notifications/prayer-status/ack", {
    method: "POST",
    auth: true,
    body: { reminderKey }
  });
}
