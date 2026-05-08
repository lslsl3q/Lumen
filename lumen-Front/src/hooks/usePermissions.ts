/**
 * usePermissions — 权限数据管理 hook（纯白名单模型）
 *
 * rules: Set<string> — 有显式 allow 规则的文件夹路径集合
 */
import { useState, useEffect, useCallback } from 'react';
import { getCharacterPermissions, setCharacterPermissions } from '../api/permissions';
import { listCharacters } from '../api/character';

interface CharacterBrief {
  id: string;
  name: string;
  avatar?: string;
}

export function usePermissions() {
  const [characters, setCharacters] = useState<CharacterBrief[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [rules, setRulesState] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    listCharacters().then(list => {
      const briefs = list.map(c => ({ id: c.id, name: c.name, avatar: c.avatar }));
      setCharacters(briefs);
      if (briefs.length > 0 && !selectedCharId) {
        setSelectedCharId(briefs[0].id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCharId) return;
    setLoading(true);
    getCharacterPermissions(selectedCharId, 'knowledge', 'knowledge')
      .then(r => {
        setRulesState(new Set(r.map(e => e.folder_path)));
        setDirty(false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedCharId]);

  const save = useCallback(async () => {
    if (!selectedCharId) return;
    const entries = [...rules].map(folder_path => ({ folder_path, action: 'read' as const }));
    await setCharacterPermissions(selectedCharId, {
      resource_type: 'knowledge',
      resource_id: 'knowledge',
      entries,
    });
    setDirty(false);
  }, [selectedCharId, rules]);

  const setRules = useCallback((r: Set<string>) => {
    setRulesState(r);
    setDirty(true);
  }, []);

  return { characters, selectedCharId, setSelectedCharId, rules, setRules, loading, dirty, save };
}
