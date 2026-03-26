/** Device-local tracker for five daily prayers (Fajr → Isha). Resets each calendar day (local). */
export const SALAH_DAILY_STORAGE_KEY = "deenly_salah_daily_v1";

export type SalahDailyState = { date: string; mask: number };

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function readSalahDaily(): SalahDailyState {
  if (typeof window === "undefined") {
    return { date: todayKey(), mask: 0 };
  }
  try {
    const raw = window.localStorage.getItem(SALAH_DAILY_STORAGE_KEY);
    if (!raw) {
      return { date: todayKey(), mask: 0 };
    }
    const parsed = JSON.parse(raw) as SalahDailyState;
    const today = todayKey();
    if (parsed.date !== today || typeof parsed.mask !== "number") {
      return { date: today, mask: 0 };
    }
    return { date: today, mask: parsed.mask & 31 };
  } catch {
    return { date: todayKey(), mask: 0 };
  }
}

export function writeSalahDaily(state: SalahDailyState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SALAH_DAILY_STORAGE_KEY, JSON.stringify(state));
}

export function toggleSalahPrayerIndex(index: number): SalahDailyState {
  if (index < 0 || index > 4) {
    return readSalahDaily();
  }
  const today = todayKey();
  const current = readSalahDaily();
  let mask = current.date === today ? current.mask : 0;
  const bit = 1 << index;
  mask ^= bit;
  mask &= 31;
  const next = { date: today, mask };
  writeSalahDaily(next);
  return next;
}

export function countSalahDone(mask: number): number {
  let n = mask & 31;
  let c = 0;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  return c;
}

export const SALAH_LABELS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
