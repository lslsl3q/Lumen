/**
 * Skills 状态管理 Hook
 */
import { useState, useEffect, useCallback } from 'react';
import type { SkillCard, SkillCreatePayload, SkillUpdatePayload } from '../types/skills';
import { listSkills, createSkill as apiCreate, updateSkill as apiUpdate, deleteSkill as apiDelete } from '../api/skills';

export function useSkills() {
  const [skills, setSkills] = useState<SkillCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await listSkills();
      setSkills(data);
    } catch (err) {
      console.error('加载 Skills 失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (payload: SkillCreatePayload) => {
    const result = await apiCreate(payload);
    await refresh();
    return result;
  }, [refresh]);

  const update = useCallback(async (id: string, payload: SkillUpdatePayload) => {
    await apiUpdate(id, payload);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await apiDelete(id);
    await refresh();
  }, [refresh]);

  return { skills, isLoading, create, update, remove, refresh };
}
