import { useCallback, useEffect } from "react";
import { useSessionStore } from "../../../store/session-store";
import type { PointAction } from "../domain/models/points-entity";
import { usePointsStore } from "../store/points-store";
import { syncCompletedOrdersToPoints } from "../services/points-local-service";

export function usePoints() {
  const sessionUser = useSessionStore((s) => s.user);
  const userId = sessionUser?.id != null ? String(sessionUser.id) : null;
  const state = usePointsStore((s) => s.state);
  const loading = usePointsStore((s) => s.loading);
  const hydrate = usePointsStore((s) => s.hydrate);
  const clear = usePointsStore((s) => s.clear);
  const awardInternal = usePointsStore((s) => s.award);

  useEffect(() => {
    if (!userId) {
      clear();
      return;
    }
    void hydrate(userId);
  }, [clear, hydrate, userId]);

  const award = useCallback(
    async (action: PointAction, options?: { dedupeKey?: string }) => {
      return awardInternal(action, options);
    },
    [awardInternal]
  );

  const syncCompletedOrders = useCallback(
    async (orders: Array<{ order_id: number | string; status: string }>) => {
      if (!userId) {
        return 0;
      }
      const awarded = await syncCompletedOrdersToPoints(userId, orders);
      if (awarded > 0) {
        await hydrate(userId);
      }
      return awarded;
    },
    [hydrate, userId]
  );

  return {
    userId,
    loading,
    state,
    award,
    syncCompletedOrders
  };
}
