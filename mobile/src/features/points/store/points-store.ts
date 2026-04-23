import { create } from "zustand";
import type { PointAction } from "../domain/models/points-entity";
import type { AwardResult, PointsState } from "../services/points-local-service";
import { awardPointsForAction, getPointsState } from "../services/points-local-service";

type PointsStoreState = {
  state: PointsState | null;
  loading: boolean;
  userId: string | null;
  hydrate: (userId: string) => Promise<void>;
  clear: () => void;
  award: (action: PointAction, options?: { dedupeKey?: string }) => Promise<AwardResult | null>;
};

export const usePointsStore = create<PointsStoreState>((set, get) => ({
  state: null,
  loading: false,
  userId: null,
  hydrate: async (userId) => {
    set({ loading: true, userId });
    try {
      const state = await getPointsState(userId);
      set({ state, loading: false, userId });
    } catch {
      set({ loading: false, userId });
    }
  },
  clear: () => set({ state: null, userId: null, loading: false }),
  award: async (action, options) => {
    const activeUserId = get().userId;
    if (!activeUserId) {
      return null;
    }
    const result = await awardPointsForAction(activeUserId, action, options);
    const nextState = await getPointsState(activeUserId);
    set({ state: nextState });
    return result;
  }
}));
