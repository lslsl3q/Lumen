/**
 * 角色管理列表页
 *
 * 职责：展示所有角色卡片，支持新建、编辑、删除
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listCharacters,
  deleteCharacter as apiDeleteCharacter,
  getAvatarUrl,
} from '../api/character';
import { CharacterListItem } from '../types/character';

function CharacterList() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<CharacterListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const list = await listCharacters();
      setCharacters(list);
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
    if (!confirm(`确定删除角色 "${id}"？此操作不可恢复。`)) return;

    try {
      setDeletingId(id);
      await apiDeleteCharacter(id);
      setCharacters(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface-deep text-slate-200">
      {/* 顶栏 */}
      <div className="max-w-5xl mx-auto px-6 py-6">
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
            <h1 className="text-xl font-light tracking-wide">角色管理</h1>
          </div>
          <button
            onClick={() => navigate('/settings/characters/new')}
            className="
              px-4 py-2 rounded-lg text-sm
              bg-teal-500/10 text-teal-400 border border-teal-500/20
              hover:bg-teal-500/20 hover:border-teal-500/40
              transition-all duration-150
            "
          >
            + 新建角色
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 加载状态 */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-600">加载中...</div>
        ) : characters.length === 0 ? (
          <div className="text-center py-16 text-slate-600">
            暂无角色，点击右上角「新建角色」开始
          </div>
        ) : (
          /* 角色卡片网格 */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {characters.map(char => (
              <div
                key={char.id}
                onClick={() => navigate(`/settings/characters/${char.id}`)}
                className="
                  group relative p-5 rounded-xl cursor-pointer
                  bg-slate-900/60 border border-slate-800/40
                  hover:border-teal-500/30 hover:bg-slate-900/80
                  transition-all duration-200
                "
              >
                {/* 删除按钮 */}
                {char.id !== 'default' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(char.id);
                    }}
                    disabled={deletingId === char.id}
                    className={`
                      absolute top-3 right-3
                      w-7 h-7 rounded-lg flex items-center justify-center
                      text-slate-600 hover:text-red-400 hover:bg-red-500/10
                      opacity-0 group-hover:opacity-100 transition-all duration-150
                      ${deletingId === char.id ? 'opacity-100 text-red-400' : ''}
                    `}
                    title={char.id === 'default' ? '默认角色不可删除' : '删除角色'}
                  >
                    {deletingId === char.id ? '...' : '\u00d7'}
                  </button>
                )}
                {char.id === 'default' && (
                  <div
                    className="
                      absolute top-3 right-3
                      w-7 h-7 rounded-lg flex items-center justify-center
                      text-slate-700 opacity-0 group-hover:opacity-100 transition-all duration-150
                    "
                    title="默认角色不可删除"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10" />
                    </svg>
                  </div>
                )}

                {/* 头像 + 名字 */}
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-12 h-12 rounded-full bg-surface-elevated flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {char.avatar ? (
                      <img
                        src={getAvatarUrl(char.avatar)!}
                        alt={char.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-lg text-slate-400">{char.name[0]}</span>
                    )}
                  </div>
                  <div>
                    <div className="text-base text-slate-200">{char.name}</div>
                    <div className="text-xs text-slate-500">ID: {char.id}</div>
                  </div>
                </div>

                {/* 描述 */}
                {char.description && (
                  <div className="text-sm text-slate-400 mb-3 line-clamp-2">
                    {char.description}
                  </div>
                )}

                {/* 工具标签 */}
                {char.tools && char.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {char.tools.map(tool => (
                      <span
                        key={tool}
                        className="
                          px-2 py-0.5 rounded text-[10px]
                          bg-teal-500/10 text-teal-400/80 border border-teal-500/15
                        "
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CharacterList;
