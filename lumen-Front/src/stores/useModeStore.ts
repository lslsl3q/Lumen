import { create } from 'zustand';

export type AppMode = 'chat' | 'base' | 'rpg' | 'writing';

interface ModeState {
  activeMode: AppMode;
  mounted: Set<AppMode>;
  switchMode: (mode: AppMode) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  activeMode: 'chat',
  mounted: new Set<AppMode>(['chat']),
  switchMode: (mode) =>
    set((state) => {
      const next = new Set(state.mounted);
      next.add(mode);
      return { activeMode: mode, mounted: next };
    }),
}));
