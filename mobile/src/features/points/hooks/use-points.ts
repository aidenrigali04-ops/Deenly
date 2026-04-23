import { useCallback, useEffect } from "react";
import { useSessionStore } from "../../../store/session-store";
import type { PointAction } from "../domain/models/points-entity";
import { usePointsStore } from "../store/points-store";

export function usePoints() {
  const sessionUser = useSessionStore((s) => s.user);
  const userId = sessionUser?.id != null ? String(sessionUser.id) : null;
  const state = usePointsStore((s) => s.state);
  const loading = usePointsStore((s) => s.loading);
  const source = usePointsStore((s) => s.source);
  const hydrate = usePointsStore((s) => s.hydrate);
  const clear = usePointsStore((s) => s.clear);
  const awardInternal = usePointsStore((s) => s.award);
  const syncCompletedOrdersInternal = usePointsStore((s) => s.syncCompletedOrders);

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
      return syncCompletedOrdersInternal(orders);
    },
    [syncCompletedOrdersInternal]
  );

  return {
    userId,
    loading,
    source,
    state,
    award,
    syncCompletedOrders
  };
}
