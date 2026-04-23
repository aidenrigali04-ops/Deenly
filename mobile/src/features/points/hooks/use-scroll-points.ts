import { useCallback, useRef } from "react";
import { usePoints } from "./use-points";

/**
 * Returns a callback for list-style onScroll handlers.
 * It awards `scroll` points once the user meaningfully advances content.
 */
export function useScrollPoints() {
  const points = usePoints();
  const lastOffsetYRef = useRef(0);

  const onScroll = useCallback(
    (offsetY: number) => {
      const next = Number.isFinite(offsetY) ? offsetY : 0;
      const delta = Math.abs(next - lastOffsetYRef.current);
      lastOffsetYRef.current = next;
      if (delta < 140) {
        return;
      }
      void points.award("scroll");
    },
    [points]
  );

  return onScroll;
}
