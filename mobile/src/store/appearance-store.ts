import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import type { AppearanceMode } from "../theme";

const STORAGE_KEY = "deenly/app-appearance";

export type { AppearanceMode };

type AppearanceState = {
  mode: AppearanceMode;
  /** Load persisted mode (call once after app fonts / early bootstrap). */
  hydrate: () => Promise<void>;
  setMode: (mode: AppearanceMode) => Promise<void>;
};

export const useAppearanceStore = create<AppearanceState>((set) => ({
  mode: "dark",
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark") {
        set({ mode: raw });
      }
    } catch {
      /* ignore */
    }
  },
  setMode: async (mode) => {
    set({ mode });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }
}));
