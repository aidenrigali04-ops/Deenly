"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SALAH_DAILY_STORAGE_KEY,
  readSalahDaily,
  toggleSalahPrayerIndex,
  type SalahDailyState
} from "@/lib/salah-daily";

export function useSalahDaily() {
  const [state, setState] = useState<SalahDailyState>({ date: "", mask: 0 });

  useEffect(() => {
    setState(readSalahDaily());
    const onStorage = (e: StorageEvent) => {
      if (e.key === SALAH_DAILY_STORAGE_KEY || e.key === null) {
        setState(readSalahDaily());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((index: number) => {
    const next = toggleSalahPrayerIndex(index);
    setState(next);
  }, []);

  return [state, toggle] as const;
}
