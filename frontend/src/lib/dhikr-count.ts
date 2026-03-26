/** Shared with Dhikr page — device-local tasbeeh total. */
export const DHIKR_STORAGE_KEY = "deenly_dhikr_count_v1";

export function readDhikrCount(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  const raw = window.localStorage.getItem(DHIKR_STORAGE_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function writeDhikrCount(next: number): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DHIKR_STORAGE_KEY, String(Math.max(0, Math.floor(next))));
}
