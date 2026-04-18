/**
 * Author's Note 状态管理 Hook
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import * as api from '../api/authorNote';
import type { AuthorsNoteConfig } from '../types/authorNote';

export function useAuthorNote(sessionId: string | null) {
  const [config, setConfig] = useState<AuthorsNoteConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 加载会话的 Author's Note */
  const load = useCallback(async (sid: string) => {
    try {
      const data = await api.getAuthorsNote(sid);
      setConfig(data);
    } catch (err) {
      console.error("加载 Author's Note 失败:", err);
      setConfig(null);
    }
  }, []);

  // sessionId 变化时自动加载
  useEffect(() => {
    if (sessionId) {
      setIsLoading(true);
      load(sessionId).finally(() => setIsLoading(false));
    } else {
      setConfig(null);
    }
  }, [sessionId, load]);

  /** 保存完整配置 */
  const save = useCallback(async (updates: Partial<AuthorsNoteConfig>) => {
    if (!sessionId) return;
    try {
      const saved = await api.saveAuthorsNote(sessionId, updates);
      setConfig(saved);
    } catch (err) {
      console.error("保存 Author's Note 失败:", err);
    }
  }, [sessionId]);

  /** 开关切换 */
  const toggle = useCallback((enabled: boolean) => {
    save({ enabled });
  }, [save]);

  /** 内容变更（debounced 500ms） */
  const saveContent = useCallback((content: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      save({ content });
    }, 500);
  }, [save]);

  /** 位置切换 */
  const setPosition = useCallback((position: 'before_user' | 'after_user') => {
    save({ injection_position: position });
  }, [save]);

  /** 删除整个 note */
  const remove = useCallback(async () => {
    if (!sessionId) return;
    try {
      await api.deleteAuthorsNote(sessionId);
      setConfig(null);
    } catch (err) {
      console.error("删除 Author's Note 失败:", err);
    }
  }, [sessionId]);

  return {
    config,
    isLoading,
    toggle,
    saveContent,
    setPosition,
    remove,
    save,
  };
}
