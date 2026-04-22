/**
 * 知识库状态管理 Hook
 */
import { useState, useEffect, useCallback } from 'react';
import type { KnowledgeFile } from '../types/knowledge';
import {
  listKnowledgeFiles,
  deleteKnowledgeFile as apiDelete,
  uploadKnowledgeFile as apiUpload,
  createKnowledgeEntry as apiCreate,
} from '../api/knowledge';

export function useKnowledge(category?: string) {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await listKnowledgeFiles(category);
      setFiles(data);
    } catch (err) {
      console.error('加载知识库失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  useEffect(() => { refresh(); }, [refresh]);

  const upload = useCallback(async (file: File, subdir: string = '') => {
    const result = await apiUpload(file, category || 'imports', subdir);
    await refresh();
    return result;
  }, [refresh, category]);

  const create = useCallback(async (filename: string, content: string, subdir: string = '') => {
    const result = await apiCreate({ filename, content, category: category || 'imports', subdir });
    await refresh();
    return result;
  }, [refresh, category]);

  const remove = useCallback(async (fileId: string) => {
    await apiDelete(fileId);
    await refresh();
  }, [refresh]);

  return { files, isLoading, upload, create, remove, refresh };
}
