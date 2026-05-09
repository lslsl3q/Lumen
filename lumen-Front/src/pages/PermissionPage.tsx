/**
 * PermissionPage — 双标签权限管理页
 *
 * 按角色：树形复选框，勾选=授权，取消=撤销
 * 按知识库：选文件夹 → 查看可访问角色 → 添加/移除
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PermissionTree, { FolderNode } from '../components/PermissionTree';
import { usePermissions } from '../hooks/usePermissions';
import { batchCheckPermissions, grantAccess, revokeAccess } from '../api/permissions';
import { getTdbFileTree, type TdbFileFolder } from '../api/tdb';

type Tab = 'character' | 'resource';

/** 从扁平文件夹列表构建递归层级树 */
function buildFolderTree(flatFolders: TdbFileFolder[]): FolderNode[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trie: Record<string, any> = {};

  for (const f of flatFolders) {
    if (f.path === '') continue;
    const parts = f.path.split('/');
    let node = trie;
    for (const part of parts) {
      if (!node[part]) node[part] = {};
      node = node[part];
    }
  }

  function toNodes(obj: Record<string, unknown>, parentPath: string): FolderNode[] {
    return Object.entries(obj).map(([name, v]) => {
      const path = parentPath ? `${parentPath}/${name}` : name;
      const children = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
      return { name, path, children: toNodes(children, path) };
    });
  }

  return [{
    name: 'knowledge（根）',
    path: '',
    children: toNodes(trie, ''),
  }];
}

export default function PermissionPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('character');
  const {
    characters,
    selectedCharId,
    setSelectedCharId,
    rules,
    setRules,
    loading,
    dirty,
    save,
  } = usePermissions();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [allowedChars, setAllowedChars] = useState<Set<string>>(new Set());
  const [resourceLoading, setResourceLoading] = useState(false);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const fetchCharPermissions = useCallback(async (path: string) => {
    if (characters.length === 0) return;
    setResourceLoading(true);
    try {
      const perms = await batchCheckPermissions(
        'knowledge', 'knowledge', path,
        characters.map(c => c.id), 'read',
      );
      setAllowedChars(new Set(Object.entries(perms).filter(([, v]) => v).map(([k]) => k)));
    } catch {
      setAllowedChars(new Set());
    } finally {
      setResourceLoading(false);
    }
  }, [characters]);

  useEffect(() => {
    setTreeLoading(true);
    getTdbFileTree('knowledge')
      .then(data => setFolders(buildFolderTree(data.folders)))
      .catch(() => setFolders([]))
      .finally(() => setTreeLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'resource' || selectedPath === null) {
      setAllowedChars(new Set());
      return;
    }
    fetchCharPermissions(selectedPath);
  }, [tab, selectedPath, fetchCharPermissions]);

  const handleGrant = useCallback(async (charId: string) => {
    if (selectedPath === null) return;
    setShowAddMenu(false);
    try {
      await grantAccess(charId, 'knowledge', 'knowledge', selectedPath, 'read');
      await fetchCharPermissions(selectedPath);
    } catch (err) {
      console.error('授权失败:', err);
    }
  }, [selectedPath, fetchCharPermissions]);

  const handleRevoke = useCallback(async (charId: string) => {
    if (selectedPath === null) return;
    try {
      await revokeAccess(charId, 'knowledge', 'knowledge', selectedPath, 'read');
      await fetchCharPermissions(selectedPath);
    } catch (err) {
      console.error('撤销失败:', err);
    }
  }, [selectedPath, fetchCharPermissions]);

  const handleSave = useCallback(async () => {
    await save();
  }, [save]);

  const allowedList = characters.filter(c => allowedChars.has(c.id));
  const availableList = characters.filter(c => !allowedChars.has(c.id));

  return (
    <div className="h-full bg-[var(--color-bg-deep)] text-[var(--color-text-primary)] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm">
            ← 返回
          </button>
          <h1 className="text-xl font-bold">权限管理</h1>
        </div>
        {tab === 'character' && dirty && (
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-amber-500 text-black text-sm font-medium rounded hover:bg-amber-400 transition-colors"
          >
            保存
          </button>
        )}
      </div>

      <div className="border-t border-b border-[var(--color-border)] flex shrink-0">
        <button
          onClick={() => setTab('character')}
          className={`flex-1 py-2.5 text-xs tracking-wide transition-colors ${
            tab === 'character' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          按角色
        </button>
        <button
          onClick={() => setTab('resource')}
          className={`flex-1 py-2.5 text-xs tracking-wide transition-colors ${
            tab === 'resource' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          按知识库
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {tab === 'character' ? (
          <>
            <div className="w-56 border-r border-[var(--color-border)] overflow-y-auto">
              {characters.map(char => (
                <button
                  key={char.id}
                  onClick={() => setSelectedCharId(char.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    selectedCharId === char.id
                      ? 'bg-slate-800/80 text-amber-400'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {char.name}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="text-sm text-[var(--color-text-muted)] text-center py-8">加载中...</div>
              ) : (
                <PermissionTree
                  folders={folders}
                  rules={rules}
                  onChange={setRules}
                />
              )}
            </div>
          </>
        ) : (
          <>
            <div className="w-80 border-r border-[var(--color-border)] overflow-y-auto">
              {treeLoading ? (
                <div className="text-sm text-[var(--color-text-muted)] text-center py-8">加载文件夹...</div>
              ) : (
                <PermissionTree
                  folders={folders}
                  rules={new Set()}
                  onChange={() => {}}
                  onSelect={setSelectedPath}
                  showCheckboxes={false}
                />
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {selectedPath !== null ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm text-[var(--color-text-secondary)]">
                      「{selectedPath || '根目录'}」可访问的角色
                    </h3>
                    <div className="relative">
                      <button
                        onClick={() => setShowAddMenu(!showAddMenu)}
                        className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-[var(--color-text-primary)] rounded transition-colors"
                      >
                        + 添加
                      </button>
                      {showAddMenu && availableList.length > 0 && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded shadow-lg z-10 max-h-60 overflow-y-auto">
                          {availableList.map(char => (
                            <button
                              key={char.id}
                              onClick={() => handleGrant(char.id)}
                              className="w-full text-left px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-slate-700 transition-colors"
                            >
                              {char.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {resourceLoading ? (
                    <div className="text-sm text-[var(--color-text-muted)] py-2">加载中...</div>
                  ) : (
                    <>
                      {allowedList.map(char => (
                        <div key={char.id} className="flex items-center justify-between py-2 px-3 rounded hover:bg-slate-800/50">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span className="text-sm text-[var(--color-text-primary)]">{char.name}</span>
                          </div>
                          <button
                            className="text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
                            onClick={() => handleRevoke(char.id)}
                          >
                            移除
                          </button>
                        </div>
                      ))}
                      {allowedList.length === 0 && (
                        <div className="text-sm text-[var(--color-text-muted)] py-4 text-center">
                          暂无角色有访问权限，点击右上角添加
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
                  请在左侧选择一个文件夹
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
