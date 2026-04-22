/**
 * Persona 管理列表页
 *
 * 职责：展示所有 Persona 卡片，支持新建、编辑、删除
 * 复用 CharacterList 的布局风格，用紫色主题区分
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPersonas, deletePersona as apiDeletePersona } from '../api/persona';
import { PersonaListItem } from '../types/persona';

function PersonaList() {
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<PersonaListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const loadList = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const list = await listPersonas();
      setPersonas(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const handleDelete = async (id: string) => {
    if (id === 'default') return;
    if (!confirm(`确定删除 Persona "${id}"？`)) return;

    try {
      setDeletingId(id);
      await apiDeletePersona(id);
      setPersonas(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;

    try {
      const response = await fetch('http://127.0.0.1:8888/personas/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: '', traits: [] }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || '创建失败');
      }

      setShowCreate(false);
      setNewName('');
      loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  return (
    <div className="min-h-screen bg-surface-deep text-slate-200">
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* 顶栏 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="
                px-3 py-1.5 rounded-lg text-sm text-slate-400
                hover:text-slate-200 hover:bg-slate-800/60
                transition-all duration-150
              "
            >
              &larr; 返回聊天
            </button>
            <h1 className="text-xl font-light tracking-wide">Persona 管理</h1>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="
              px-4 py-2 rounded-lg text-sm
              bg-indigo-500/10 text-indigo-400 border border-indigo-500/20
              hover:bg-indigo-500/20 hover:border-indigo-500/40
              transition-all duration-150
            "
          >
            + 新建 Persona
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 新建面板 */}
        {showCreate && (
          <div className="mb-6 p-5 rounded-xl bg-slate-900/60 border border-indigo-500/20">
            <div className="text-sm text-slate-300 mb-4">新建 Persona</div>
            <div className="mb-3">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="名称"
                className="
                  w-full px-3 py-2 rounded-lg text-sm bg-slate-800/60
                  border border-slate-700/60 text-slate-200
                  placeholder:text-slate-600
                  focus:border-indigo-500/40 focus:outline-hidden
                  transition-all duration-150
                "
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowCreate(false); setNewName(''); }}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="
                  px-4 py-1.5 rounded-lg text-sm
                  bg-indigo-500/20 text-indigo-300 border border-indigo-500/30
                  hover:bg-indigo-500/30 disabled:opacity-40
                  transition-all duration-150
                "
              >
                创建
              </button>
            </div>
          </div>
        )}

        {/* 加载状态 */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-600">加载中...</div>
        ) : personas.length === 0 ? (
          <div className="text-center py-16 text-slate-600">
            暂无 Persona，点击右上角「新建 Persona」开始
          </div>
        ) : (
          /* Persona 卡片网格 */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {personas.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/settings/personas/${p.id}`)}
                className="
                  group relative p-5 rounded-xl cursor-pointer
                  bg-slate-900/60 border border-slate-800/40
                  hover:border-indigo-500/30 hover:bg-slate-900/80
                  transition-all duration-200
                "
              >
                {/* 删除按钮 */}
                {p.id !== 'default' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                    disabled={deletingId === p.id}
                    className={`
                      absolute top-3 right-3
                      w-7 h-7 rounded-lg flex items-center justify-center
                      text-slate-600 hover:text-red-400 hover:bg-red-500/10
                      opacity-0 group-hover:opacity-100 transition-all duration-150
                      ${deletingId === p.id ? 'opacity-100 text-red-400' : ''}
                    `}
                  >
                    {deletingId === p.id ? '...' : '\u00d7'}
                  </button>
                )}

                {/* 图标 + 名字 */}
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex-shrink-0 flex items-center justify-center">
                    <span className="text-lg text-indigo-400">{p.name[0]}</span>
                  </div>
                  <div>
                    <div className="text-base text-slate-200">{p.name}</div>
                    <div className="text-xs text-slate-500">ID: {p.id}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PersonaList;
