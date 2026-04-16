/**
 * 会话列表管理 Hook
 *
 * 职责：管理会话列表、当前选中会话、会话 CRUD
 * 遵循单向依赖：hook → api/session.ts
 */
import { useState, useCallback, useEffect } from 'react';
import { createSession, listSessions, deleteSession as apiDeleteSession, resetSession as apiResetSession } from '../api/session';
import { SessionListItem } from '../types/session';

/** 格式化 session_id 为可读标签
 *  session_id 格式: "2026-04-16_143700"
 */
function formatSessionLabel(sessionId: string): string {
  // 解析 "2026-04-16_143700" → Date
  const match = sessionId.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/);
  if (!match) return sessionId;

  const [, year, month, day, hour, min] = match;
  const sessionDate = new Date(+year, +month - 1, +day, +hour, +min);
  const now = new Date();

  // 同一天 → "HH:MM"
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDayStart = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
  const diffDays = Math.round((todayStart.getTime() - sessionDayStart.getTime()) / 86400000);

  const time = `${hour}:${min}`;
  if (diffDays === 0) return time;
  if (diffDays === 1) return `昨天 ${time}`;
  if (now.getFullYear() === sessionDate.getFullYear()) {
    return `${+month}月${+day}日 ${time}`;
  }
  return `${year}/${+month}/${+day} ${time}`;
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** 刷新会话列表 */
  const refreshSessions = useCallback(async () => {
    try {
      const list = await listSessions();
      setSessions(list);
      return list;
    } catch (err) {
      console.error('刷新会话列表失败:', err);
      return [];
    }
  }, []);

  /** 初始化：加载会话列表，自动选中第一个 */
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const list = await refreshSessions();
      if (list.length > 0) {
        setCurrentSessionId(list[0].session_id);
      }
      setIsLoading(false);
    })();
  }, [refreshSessions]);

  /** 创建新会话，返回新 session_id */
  const createNewSession = useCallback(async (): Promise<string> => {
    const data = await createSession();
    await refreshSessions();
    setCurrentSessionId(data.session_id);
    return data.session_id;
  }, [refreshSessions]);

  /** 切换到指定会话 */
  const switchSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  /** 删除会话，如果删的是当前会话则自动切换 */
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await apiDeleteSession(sessionId);
    const list = await refreshSessions();

    // 如果删的是当前会话，自动切到列表第一个或清空
    if (sessionId === currentSessionId) {
      setCurrentSessionId(list.length > 0 ? list[0].session_id : null);
    }
  }, [currentSessionId, refreshSessions]);

  /** 重置会话（清空历史，但会话 ID 不变） */
  const resetSession = useCallback(async (sessionId: string) => {
    await apiResetSession(sessionId);
  }, []);

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    isLoading,
    createNewSession,
    switchSession,
    deleteSession: handleDeleteSession,
    resetSession,
    refreshSessions,
    formatSessionLabel,
  };
}
