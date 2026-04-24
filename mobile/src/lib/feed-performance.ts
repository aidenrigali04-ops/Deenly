import { useCallback, useRef } from "react";
import type { FeedListItem } from "../types";

const EVENT_ROW_HEIGHT = 176;
const POST_ROW_HEIGHT = 560;
const IMPRESSION_CACHE_LIMIT = 500;

export const REELS_WINDOW_SIZE = 5;
export const REELS_MAX_TO_RENDER_PER_BATCH = 3;

export function estimateFeedRowHeight(item: FeedListItem | undefined): number {
  if (!item) {
    return POST_ROW_HEIGHT;
  }
  if ("card_type" in item && item.card_type === "event") {
    return EVENT_ROW_HEIGHT;
  }
  return POST_ROW_HEIGHT;
}

/**
 * Prevent duplicate sponsored impression events during repeated rerenders.
 */
export function useFeedImpressionTracker() {
  const seenRef = useRef<Set<number>>(new Set());

  const markAndShouldSend = useCallback((campaignId: number) => {
    if (!Number.isFinite(campaignId)) {
      return false;
    }
    if (seenRef.current.has(campaignId)) {
      return false;
    }
    seenRef.current.add(campaignId);
    if (seenRef.current.size > IMPRESSION_CACHE_LIMIT) {
      // Keep memory bounded on long feed sessions.
      const trimmed = Array.from(seenRef.current).slice(-Math.floor(IMPRESSION_CACHE_LIMIT * 0.7));
      seenRef.current = new Set(trimmed);
    }
    return true;
  }, []);

  return { markAndShouldSend };
}
