/**
 * 会话状态 — Zustand Store
 *
 * 会话列表 + 当前会话 + CRUD，供 ActivityBar 的 sessions 面板使用。
 * ChatMode 通过此 store 读取/写入会话数据，不再自己维护。
 */
import { create } from 'zustand';
import {
  createSession,
  listSessions,
  deleteSession as apiDeleteSession,
  resetSession as apiResetSession,
} from '../api/session';
import type { SessionListItem } from '../types/session';

function formatSessionLabel(sessionId: string): string {
  const match = sessionId.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/);
  if (!match) return sessionId;
  const [, year, month, day, hour, min] = match;
  const sessionDate = new Date(+year, +month - 1, +day, +hour, +min);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDayStart = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
  const diffDays = Math.round((todayStart.getTime() - sessionDayStart.getTime()) / 86400000);
  const time = `${hour}:${min}`;
  if (diffDays === 0) return time;
  if (diffDays === 1) return `昨天 ${time}`;
  if (now.getFullYear() === sessionDate.getFullYear()) return `${+month}月${+day}日 ${time}`;
  return `${year}/${+month}/${+day} ${time}`;
}

interface SessionState {
  sessions: SessionListItem[];
  currentSessionId: string | null;
  isLoading: boolean;
  filterCharacterId: string;

  setCurrentSessionId: (id: string | null) => void;
  refreshSessions: (characterId?: string) => Promise<SessionListItem[]>;
  setCharacterFilter: (characterId: string) => Promise<SessionListItem[]>;
  createNewSession: (characterId: string) => Promise<string>;
  switchSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<string | null>;
  resetSession: (sessionId: string) => Promise<void>;
  initialize: (characterId: string) => Promise<void>;
  formatSessionLabel: (sessionId: string) => string;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  isLoading: false,
  filterCharacterId: 'default',

  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  refreshSessions: async (characterId?: string) => {
    try {
      const charId = characterId || get().filterCharacterId;
      const list = await listSessions(20, charId);
      set({ sessions: list });
      return list;
    } catch (err) {
      console.error('刷新会话列表失败:', err);
      return [];
    }
  },

  setCharacterFilter: async (characterId: string) => {
    set({ filterCharacterId: characterId });
    return await get().refreshSessions(characterId);
  },

  createNewSession: async (characterId: string) => {
    const data = await createSession(characterId);
    await get().refreshSessions(characterId);
    set({ currentSessionId: data.session_id });
    return data.session_id;
  },

  switchSession: async (sessionId: string) => {
    set({ currentSessionId: sessionId });
  },

  deleteSession: async (sessionId: string) => {
    const { filterCharacterId, currentSessionId } = get();
    await apiDeleteSession(sessionId);
    const list = await get().refreshSessions(filterCharacterId);
    let newId: string | null = currentSessionId;
    if (sessionId === currentSessionId) {
      newId = list.length > 0 ? list[0].session_id : null;
      set({ currentSessionId: newId });
    }
    return newId;
  },

  resetSession: async (sessionId: string) => {
    await apiResetSession(sessionId);
  },

  initialize: async (characterId: string) => {
    set({ isLoading: true, filterCharacterId: characterId });
    const list = await get().refreshSessions(characterId);
    const lastSessionId = localStorage.getItem(`lastSession_${characterId}`);
    if (lastSessionId && list.some(s => s.session_id === lastSessionId)) {
      set({ currentSessionId: lastSessionId, isLoading: false });
    } else if (list.length > 0) {
      set({ currentSessionId: list[0].session_id, isLoading: false });
    } else {
      set({ isLoading: false });
    }
  },

  formatSessionLabel,
}));
