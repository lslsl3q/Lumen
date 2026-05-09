/**
 * 角色状态 — Zustand Store
 *
 * 跨模式共享（ActivityBar / ChatMode / BaseMode / WritingMode）
 * 替代 useCharacters hook，单一数据源
 */
import { create } from 'zustand';
import { listCharacters as apiListCharacters } from '../api/character';
import type { CharacterListItem } from '../types/character';

interface CharacterState {
  characters: CharacterListItem[];
  currentCharacterId: string;
  currentCharacter: CharacterListItem | null;
  isLoading: boolean;
  setCurrentCharacterId: (id: string) => void;
  refreshCharacters: () => Promise<CharacterListItem[]>;
  initialize: () => Promise<void>;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  currentCharacterId: localStorage.getItem('lastCharacterId') || 'default',
  currentCharacter: null,
  isLoading: false,

  setCurrentCharacterId: (id: string) => {
    localStorage.setItem('lastCharacterId', id);
    const { characters } = get();
    set({
      currentCharacterId: id,
      currentCharacter: characters.find(c => c.id === id) ?? null,
    });
  },

  refreshCharacters: async () => {
    try {
      const list = await apiListCharacters();
      const { currentCharacterId } = get();
      set({
        characters: list,
        currentCharacter: list.find(c => c.id === currentCharacterId) ?? null,
      });
      return list;
    } catch (err) {
      console.error('刷新角色列表失败:', err);
      return [];
    }
  },

  initialize: async () => {
    set({ isLoading: true });
    await get().refreshCharacters();
    set({ isLoading: false });
  },
}));
