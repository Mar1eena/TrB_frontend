import { create } from "zustand";
import { persist } from "zustand/middleware";

function legacyCollapsed(): boolean {
  try {
    return localStorage.getItem("trb.sidebar.collapsed") === "1";
  } catch {
    return false;
  }
}

type UiState = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: legacyCollapsed(),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: "trb.ui", version: 1 },
  ),
);
