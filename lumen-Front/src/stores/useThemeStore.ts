// lumen-Front/src/stores/useThemeStore.ts

import { create } from "zustand";
import { injectAIThemeStyle, removeAIThemeStyle } from "../lib/theme/utils";

const CACHE_KEY = "lumen-theme-override-cache";

interface ThemeStoreState {
  aiOverrides: Record<string, string>;
  currentThemeId: string;
  applyAIOverrides: (tokens: Record<string, string>) => void;
  resetOverrides: () => void;
  setCurrentThemeId: (id: string) => void;
}

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  aiOverrides: {},
  currentThemeId:
    typeof localStorage !== "undefined"
      ? localStorage.getItem("lumen-theme") || "lumen-dark"
      : "lumen-dark",

  applyAIOverrides: (tokens) => {
    const merged = { ...get().aiOverrides, ...tokens };
    set({ aiOverrides: merged });
    injectAIThemeStyle(merged);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
    } catch { /* ignore quota errors */ }
  },

  resetOverrides: () => {
    set({ aiOverrides: {} });
    removeAIThemeStyle();
    localStorage.removeItem(CACHE_KEY);
  },

  setCurrentThemeId: (id) => {
    set({ currentThemeId: id });
    get().resetOverrides();
  },
}));

export function initThemeOverrideCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const overrides = JSON.parse(cached);
      if (Object.keys(overrides).length > 0) {
        injectAIThemeStyle(overrides);
      }
    }
  } catch { /* ignore parse errors */ }
}

export async function syncThemeFromBackend() {
  try {
    const resp = await fetch("/api/theme/current");
    if (!resp.ok) return;
    const data = await resp.json();
    // API returns { theme_id, tokens: { tokens, overrides, ... } }
    const themeData = data.tokens || data;
    const overrides = themeData.overrides || {};
    if (Object.keys(overrides).length > 0) {
      useThemeStore.getState().applyAIOverrides(overrides);
    }
  } catch { /* ignore network errors */ }
}
