/**
 * Persona 状态管理 Hook
 */
import { useState, useCallback, useEffect } from 'react';
import * as api from '../api/persona';
import type { PersonaListItem, PersonaCard } from '../types/persona';

export function usePersona() {
  const [personas, setPersonas] = useState<PersonaListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** 刷新 Persona 列表 + 当前激活 */
  const refresh = useCallback(async () => {
    try {
      const [list, active] = await Promise.all([
        api.listPersonas(),
        api.getActivePersona(),
      ]);
      setPersonas(list);
      setActiveId(active.persona_id);
    } catch (err) {
      console.error('加载 Persona 失败:', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  /** 切换激活的 Persona */
  const switchTo = useCallback(async (personaId: string | null) => {
    await api.switchPersona({ persona_id: personaId });
    setActiveId(personaId);
  }, []);

  /** 创建 Persona 并刷新列表 */
  const create = useCallback(async (id: string, name: string, description?: string, traits?: string[]) => {
    await api.createPersona({ id, name, description, traits });
    await refresh();
  }, [refresh]);

  /** 更新 Persona */
  const update = useCallback(async (id: string, payload: { name?: string; description?: string; traits?: string[] }) => {
    await api.updatePersona(id, payload);
  }, []);

  /** 删除 Persona 并刷新列表 */
  const remove = useCallback(async (id: string) => {
    await api.deletePersona(id);
    await refresh();
  }, [refresh]);

  /** 获取当前激活的 Persona 名称 */
  const activeName = personas.find(p => p.id === activeId)?.name ?? null;

  return {
    personas,
    activeId,
    activeName,
    isLoading,
    switchTo,
    create,
    update,
    remove,
    refresh,
  };
}
