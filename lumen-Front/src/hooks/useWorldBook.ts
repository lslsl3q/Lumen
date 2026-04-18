/**
 * 世界书状态管理 Hook
 */
import { useState, useCallback, useEffect } from 'react';
import * as api from '../api/worldbook';
import type { WorldBookListItem, WorldBookEntry, WorldBookCreatePayload, WorldBookUpdatePayload } from '../types/worldbook';

export function useWorldBook() {
  const [entries, setEntries] = useState<WorldBookListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  /** 刷新世界书列表 */
  const refresh = useCallback(async () => {
    try {
      const list = await api.listWorldBooks();
      setEntries(list);
    } catch (err) {
      console.error('加载世界书列表失败:', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  /** 创建世界书 */
  const create = useCallback(async (payload: WorldBookCreatePayload): Promise<WorldBookEntry> => {
    const result = await api.createWorldBook(payload);
    await refresh();
    return result;
  }, [refresh]);

  /** 更新世界书 */
  const update = useCallback(async (id: string, payload: WorldBookUpdatePayload) => {
    await api.updateWorldBook(id, payload);
    await refresh();
  }, [refresh]);

  /** 删除世界书 */
  const remove = useCallback(async (id: string) => {
    await api.deleteWorldBook(id);
    await refresh();
  }, [refresh]);

  return {
    entries,
    isLoading,
    create,
    update,
    remove,
    refresh,
  };
}
