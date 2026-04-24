import { useCallback, useEffect } from "react";
import { useSessionStore } from "../../../store/session-store";
import type { PointAction } from "../domain/models/points-entity";
import {
  buildCommentDedupeKey,
  buildFollowDedupeKey,
  buildLikeDedupeKey,
  buildPurchaseDedupeKey,
  canSurfaceAwardAction,
  type PointAwardSurface
} from "../domain/config/points-award-policy";
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
    async (
      action: PointAction,
      options: {
        surface: PointAwardSurface;
        dedupeKey?: string;
        postId?: number | string;
        targetUserId?: number | string;
        orderId?: number | string;
        commentText?: string;
      }
    ) => {
      const surface = options.surface;
      if (!canSurfaceAwardAction(surface, action)) {
        return null;
      }
      if (source === "remote" && action === "scroll") {
        return null;
      }
      let dedupeKey = options.dedupeKey;
      if (!dedupeKey) {
        if (action === "like" && options.postId != null) {
          dedupeKey = buildLikeDedupeKey(options.postId);
        } else if (action === "comment" && options.postId != null && options.commentText != null) {
          dedupeKey = buildCommentDedupeKey(options.postId, options.commentText);
        } else if (action === "follow" && options.targetUserId != null) {
          dedupeKey = buildFollowDedupeKey(options.targetUserId);
        } else if (action === "purchase" && options.orderId != null) {
          dedupeKey = buildPurchaseDedupeKey(options.orderId);
        }
      }
      return awardInternal(action, dedupeKey ? { dedupeKey } : undefined);
    },
    [awardInternal, source]
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
