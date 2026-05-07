/**
 * PermissionPage — 双标签权限管理页
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PermissionTree, { FolderNode } from '../components/PermissionTree';
import { usePermissions } from '../hooks/usePermissions';
import { getResourcePermissions } from '../api/permissions';
import { getTdbFileTree } from '../api/tdb';

type Tab = 'character' | 'resource';

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

  const [selectedPath, setSelectedPath] = useState('');
  const [authorizedChars, setAuthorizedChars] = useState<string[]>([]);
  const [folders, setFolders] = useState<FolderNode[]>([]);

  useEffect(() => {
    getTdbFileTree('knowledge')
      .then(data => {
        const roots: FolderNode[] = [{
          name: 'knowledge（根）',
          path: '',
          children: data.folders.map(f => ({
            name: f.name,
            path: f.path,
            children: [],
          })),
        }];
        setFolders(roots);
      })
      .catch(() => setFolders([]));
  }, []);

  useEffect(() => {
    if (tab !== 'resource' || !selectedPath) return;
    getResourcePermissions('knowledge', 'knowledge', selectedPath, 'read')
      .then(setAuthorizedChars)
      .catch(() => setAuthorizedChars([]));
  }, [tab, selectedPath]);

  const handleSave = useCallback(async () => {
    await save();
  }, [save]);

  return (
    <div className="h-full bg-slate-950 text-slate-200 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-slate-200 text-sm">
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

      <div className="border-t border-b border-[#2a2926] flex shrink-0">
        <button
          onClick={() => setTab('character')}
          className={`flex-1 py-2.5 text-xs tracking-wide transition-colors ${
            tab === 'character' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          按角色
        </button>
        <button
          onClick={() => setTab('resource')}
          className={`flex-1 py-2.5 text-xs tracking-wide transition-colors ${
            tab === 'resource' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          按知识库
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {tab === 'character' ? (
          <>
            <div className="w-56 border-r border-[#2a2926] overflow-y-auto">
              {characters.map(char => (
                <button
                  key={char.id}
                  onClick={() => setSelectedCharId(char.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    selectedCharId === char.id
                      ? 'bg-slate-800/80 text-amber-400'
                      : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
                  }`}
                >
                  {char.name}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="text-sm text-slate-500 text-center py-8">加载中...</div>
              ) : (
                <PermissionTree
                  folders={folders}
                  rules={rules}
                  defaultPublic={true}
                  onChange={setRules}
                />
              )}
            </div>
          </>
        ) : (
          <>
            <div className="w-80 border-r border-[#2a2926] overflow-y-auto">
              <PermissionTree
                folders={folders}
                rules={new Map()}
                defaultPublic={true}
                onChange={() => {}}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {selectedPath ? (
                <>
                  <h3 className="text-sm text-slate-400 mb-3">
                    「{selectedPath || '根目录'}」的读取权限角色
                  </h3>
                  {authorizedChars.map(charId => {
                    const char = characters.find(c => c.id === charId);
                    return (
                      <div key={charId} className="flex items-center justify-between py-2 px-3 rounded hover:bg-slate-800/50">
                        <span className="text-sm text-slate-300">{char?.name || charId}</span>
                        <button className="text-xs text-slate-500 hover:text-red-400">移除</button>
                      </div>
                    );
                  })}
                  {authorizedChars.length === 0 && (
                    <div className="text-sm text-slate-500">无授权角色</div>
                  )}
                  <button className="mt-3 text-xs text-amber-400 hover:text-amber-300">
                    + 添加角色
                  </button>
                </>
              ) : (
                <div className="text-sm text-slate-500 text-center py-8">
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
