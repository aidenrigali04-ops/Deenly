"use client";

import { useCallback, useEffect, useState } from "react";
import { DHIKR_STORAGE_KEY, readDhikrCount, writeDhikrCount } from "@/lib/dhikr-count";

export function useDhikrCount() {
  const [count, setCountState] = useState(0);

  useEffect(() => {
    setCountState(readDhikrCount());
    const onStorage = (e: StorageEvent) => {
      if (e.key === DHIKR_STORAGE_KEY || e.key === null) {
        setCountState(readDhikrCount());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setCount = useCallback((updater: number | ((n: number) => number)) => {
    setCountState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const clamped = Math.max(0, Math.floor(next));
      writeDhikrCount(clamped);
      return clamped;
    });
  }, []);

  return [count, setCount] as const;
}
