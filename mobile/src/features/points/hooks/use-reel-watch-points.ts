import { useCallback, useRef } from "react";
import { usePoints } from "./use-points";

const MIN_WATCH_SECONDS = 5;

/**
 * Awards one scroll/reel-watch point after the active reel has been watched
 * for at least MIN_WATCH_SECONDS. A reel can only award once per UTC day.
 */
export function useReelWatchPoints() {
  const points = usePoints();
  const watchedMsRef = useRef<Record<string, number>>({});
  const awardedTodayRef = useRef<Set<string>>(new Set());

  const resetDaily = useCallback((dayKey: string) => {
    const keys = Array.from(awardedTodayRef.current.values());
    for (const k of keys) {
      if (!k.startsWith(`${dayKey}:`)) {
        awardedTodayRef.current.delete(k);
      }
    }
  }, []);

  const onWatchProgress = useCallback(
    (reelId: number | string, deltaMs: number) => {
      const id = String(reelId);
      if (!id || !Number.isFinite(deltaMs) || deltaMs <= 0) {
        return;
      }
      const dayKey = new Date().toISOString().slice(0, 10);
      resetDaily(dayKey);
      const dedupeKey = `${dayKey}:reel:${id}`;
      if (awardedTodayRef.current.has(dedupeKey)) {
        return;
      }
      const next = (watchedMsRef.current[id] || 0) + deltaMs;
      watchedMsRef.current[id] = next;
      if (next < MIN_WATCH_SECONDS * 1000) {
        return;
      }
      awardedTodayRef.current.add(dedupeKey);
      void points.award("scroll", {
        surface: "reels",
        dedupeKey: `scroll:${dedupeKey}`
      });
    },
    [points, resetDaily]
  );

  const onReelBecameInactive = useCallback((reelId: number | string) => {
    delete watchedMsRef.current[String(reelId)];
  }, []);

  return {
    onWatchProgress,
    onReelBecameInactive
  };
}
