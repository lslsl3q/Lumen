/**
 * usePermissions — 权限数据管理 hook
 */
import { useState, useEffect, useCallback } from 'react';
import type { AclRule } from '../types/permissions';
import {
  getCharacterPermissions,
  setCharacterPermissions,
} from '../api/permissions';
import { listCharacters } from '../api/character';

interface CharacterBrief {
  id: string;
  name: string;
  avatar?: string;
}

export function usePermissions() {
  const [characters, setCharacters] = useState<CharacterBrief[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [rules, setRules] = useState<Map<string, 'allow' | 'deny'>>(new Map());
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    listCharacters().then(list => {
      const briefs = list.map(c => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
      }));
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
        const map = new Map<string, 'allow' | 'deny'>();
        for (const rule of r) {
          map.set(rule.folder_path, rule.access as 'allow' | 'deny');
        }
        setRules(map);
        setDirty(false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedCharId]);

  const save = useCallback(async () => {
    if (!selectedCharId) return;
    const entries: AclRule[] = [];
    rules.forEach((access, folder_path) => {
      entries.push({ folder_path, action: 'read', access });
    });
    await setCharacterPermissions(selectedCharId, {
      resource_type: 'knowledge',
      resource_id: 'knowledge',
      entries,
    });
    setDirty(false);
  }, [selectedCharId, rules]);

  return {
    characters,
    selectedCharId,
    setSelectedCharId,
    rules,
    setRules: (r: Map<string, 'allow' | 'deny'>) => { setRules(r); setDirty(true); },
    loading,
    dirty,
    save,
  };
}
