import { create } from 'zustand';

export type AppMode = 'dashboard' | 'chat' | 'base' | 'rpg' | 'writing';

interface ModeState {
  activeMode: AppMode;
  mounted: Set<AppMode>;
  // 写作模式侧边栏
  writingSidebarExpanded: boolean;
  writingSidebarTab: 'codex' | 'snippets' | 'chat';
  switchMode: (mode: AppMode) => void;
  toggleWritingSidebar: () => void;
  setWritingSidebarTab: (tab: 'codex' | 'snippets' | 'chat') => void;
}

export const useModeStore = create<ModeState>((set) => ({
  activeMode: 'dashboard',
  mounted: new Set<AppMode>(['dashboard']),
  writingSidebarExpanded: false,
  writingSidebarTab: 'codex',
  switchMode: (mode) =>
    set((state) => {
      const next = new Set(state.mounted);
      next.add(mode);
      return { activeMode: mode, mounted: next };
    }),
  toggleWritingSidebar: () => set((s) => ({ writingSidebarExpanded: !s.writingSidebarExpanded })),
  setWritingSidebarTab: (tab) => set({ writingSidebarTab: tab, writingSidebarExpanded: true }),
}));
