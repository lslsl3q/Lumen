/**
 * 角色列表管理 Hook
 *
 * 职责：管理角色列表、当前角色
 * 遵循单向依赖：hook → api/character.ts
 */
import { useState, useCallback, useEffect } from 'react';
import { listCharacters as apiListCharacters, switchCharacter as apiSwitchCharacter } from '../api/character';
import { CharacterListItem } from '../types/character';

export function useCharacters() {
  const [characters, setCharacters] = useState<CharacterListItem[]>([]);
  const [currentCharacterId, setCurrentCharacterId] = useState<string>('default');
  const [isLoading, setIsLoading] = useState(true);

  /** 刷新角色列表 */
  const refreshCharacters = useCallback(async () => {
    try {
      const list = await apiListCharacters();
      setCharacters(list);
      return list;
    } catch (err) {
      console.error('刷新角色列表失败:', err);
      return [];
    }
  }, []);

  /** 初始化：加载角色列表 */
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await refreshCharacters();
      setIsLoading(false);
    })();
  }, [refreshCharacters]);

  /** 切换角色（切换当前会话的角色） */
  const handleSwitchCharacter = useCallback(async (characterId: string, sessionId: string) => {
    await apiSwitchCharacter(characterId, sessionId);
    setCurrentCharacterId(characterId);
  }, []);

  /** 获取当前角色信息 */
  const currentCharacter = characters.find(c => c.id === currentCharacterId) ?? null;

  return {
    characters,
    currentCharacterId,
    currentCharacter,
    setCurrentCharacterId,
    isLoading,
    switchCharacter: handleSwitchCharacter,
    refreshCharacters,
  };
}
