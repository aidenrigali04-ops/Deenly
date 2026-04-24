import { create } from "zustand";
import type { PointAction } from "../domain/models/points-entity";
import type { AwardResult, PointsState } from "../services/points-local-service";
import {
  awardPointsForAction,
  getPointsState,
  syncCompletedOrdersToPoints
} from "../services/points-local-service";
import {
  isRemoteTrackedAction,
  loadRemotePointsState
} from "../services/points-remote-service";
import { usePointsRewardToastStore } from "./points-reward-toast-store";

type PointsDataSource = "remote" | "local";

type PointsStoreState = {
  state: PointsState | null;
  loading: boolean;
  userId: string | null;
  source: PointsDataSource | null;
  hydrate: (userId: string) => Promise<void>;
  clear: () => void;
  award: (action: PointAction, options?: { dedupeKey?: string }) => Promise<AwardResult | null>;
  syncCompletedOrders: (
    orders: Array<{ order_id: number | string; status: string }>
  ) => Promise<number>;
};

export const usePointsStore = create<PointsStoreState>((set, get) => ({
  state: null,
  loading: false,
  userId: null,
  source: null,
  hydrate: async (userId) => {
    set({ loading: true, userId, source: null });
    try {
      const state = await loadRemotePointsState(userId);
      if (get().userId !== userId) {
        return;
      }
      set({ state, loading: false, userId, source: "remote" });
    } catch {
      try {
        const state = await getPointsState(userId);
        if (get().userId !== userId) {
          return;
        }
        set({ state, loading: false, userId, source: "local" });
      } catch {
        if (get().userId !== userId) {
          return;
        }
        set({ loading: false, userId, source: null });
      }
    }
  },
  clear: () => set({ state: null, userId: null, source: null, loading: false }),
  award: async (action, options) => {
    const activeUserId = get().userId;
    if (!activeUserId) {
      return null;
    }
    const previousLevel = get().state?.wallet.level ?? null;
    if (get().source === "remote") {
      if (isRemoteTrackedAction(action)) {
        await get().hydrate(activeUserId);
      }
      return null;
    }
    const result = await awardPointsForAction(activeUserId, action, options);
    const nextState = await getPointsState(activeUserId);
    set({ state: nextState, source: "local" });
    if (result.awarded) {
      usePointsRewardToastStore.getState().enqueue({
        id: `toast_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
        action,
        points: result.points,
        totalPoints: result.wallet.totalPoints,
        level: result.wallet.level,
        levelUp: previousLevel != null ? result.wallet.level > previousLevel : false,
        createdAt: result.transaction.createdAt
      });
    }
    return result;
  },
  syncCompletedOrders: async (orders) => {
    const activeUserId = get().userId;
    if (!activeUserId) {
      return 0;
    }
    if (get().source === "remote") {
      await get().hydrate(activeUserId);
      return 0;
    }
    const awarded = await syncCompletedOrdersToPoints(activeUserId, orders);
    const nextState = await getPointsState(activeUserId);
    set({ state: nextState, source: "local" });
    return awarded;
  }
}));
