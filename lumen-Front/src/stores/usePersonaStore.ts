/**
 * Persona 状态 — Zustand Store
 *
 * 跨模式共享（ActivityBar / ChatMode / BaseMode）
 * 替代 usePersona hook，单一数据源
 */
import { create } from 'zustand';
import * as api from '../api/persona';
import type { PersonaListItem } from '../types/persona';

interface PersonaState {
  personas: PersonaListItem[];
  activeId: string | null;
  activeName: string | null;
  isLoading: boolean;
  switchTo: (id: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const usePersonaStore = create<PersonaState>((set, get) => ({
  personas: [],
  activeId: null,
  activeName: null,
  isLoading: false,

  switchTo: async (personaId: string | null) => {
    await api.switchPersona({ persona_id: personaId });
    const { personas } = get();
    set({
      activeId: personaId,
      activeName: personas.find(p => p.id === personaId)?.name ?? null,
    });
  },

  refresh: async () => {
    try {
      const [list, active] = await Promise.all([
        api.listPersonas(),
        api.getActivePersona(),
      ]);
      set({
        personas: list,
        activeId: active.persona_id,
        activeName: list.find(p => p.id === active.persona_id)?.name ?? null,
      });
    } catch (err) {
      console.error('加载 Persona 失败:', err);
    }
  },

  initialize: async () => {
    set({ isLoading: true });
    await get().refresh();
    set({ isLoading: false });
  },
}));
