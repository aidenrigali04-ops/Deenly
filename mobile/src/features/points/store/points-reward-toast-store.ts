import { create } from "zustand";
import type { PointAction } from "../domain/models/points-entity";

export type PointsRewardToastPayload = {
  id: string;
  action: PointAction;
  points: number;
  totalPoints: number;
  dailyPoints: number;
  level: number;
  streak: number;
  levelUp: boolean;
  celebration: "standard" | "level_up" | "milestone" | "streak";
  milestonePoints?: number;
  createdAt: string;
};

type PointsRewardToastState = {
  queue: PointsRewardToastPayload[];
  enqueue: (payload: PointsRewardToastPayload) => void;
  dequeue: () => PointsRewardToastPayload | null;
  clear: () => void;
};

export const usePointsRewardToastStore = create<PointsRewardToastState>((set, get) => ({
  queue: [],
  enqueue: (payload) =>
    set((state) => ({
      queue: [...state.queue, payload].slice(-40)
    })),
  dequeue: () => {
    const queue = get().queue;
    if (queue.length === 0) {
      return null;
    }
    const [next, ...rest] = queue;
    set({ queue: rest });
    return next;
  },
  clear: () => set({ queue: [] })
}));
