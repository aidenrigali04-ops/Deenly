"use client";

import { create } from "zustand";
import type { UserSession } from "@/types";

type SessionState = {
  user: UserSession | null;
  setUser: (user: UserSession | null) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  setUser: (user) => set({ user })
}));
