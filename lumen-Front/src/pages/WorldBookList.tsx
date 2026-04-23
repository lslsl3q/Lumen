/**
 * 世界书列表页
 */
import { useNavigate } from 'react-router-dom';
import { useWorldBook } from '../hooks/useWorldBook';
import { SettingsPageProps } from '../types/settings';

interface WorldBookListProps extends SettingsPageProps {}

function WorldBookList({ onBack, onNavigate }: WorldBookListProps) {
  const navigate = useNavigate();
  const goBack = onBack ?? (() => navigate('/'));
  const goTo = onNavigate ?? ((page: string, _params?: { id?: string; resource?: string }) => navigate(`/settings/${page}`));
  const { entries, isLoading, create, remove } = useWorldBook();

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除世界书「${name}」吗？`)) return;
    try {
      await remove(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleCreate = async () => {
    const name = prompt('请输入世界书名称：');
    if (!name) return;

    try {
      const result = await create({
        name,
        keywords: [],
        content: '',
        enabled: true,
        secondary_keywords: [],
        selective: false,
        selective_logic: 'and',
        case_sensitive: false,
        whole_word: true,
        position: 'before_user',
        depth: 4,
        order: 0,
        scan_depth: 10,
        character_ids: [],
        comment: '',
      });
      // 使用后端返回的 ID 导航
      goTo('worldbook-editor', { id: result.id });
    } catch (err) {
      alert(err instanceof Error ? err.message : '创建失败');
    }
  };

  return (
    <div className="h-full bg-slate-950 text-slate-200">
      {/* 顶栏 */}
      <div className="flex items-center justify-between mb-8 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => goBack()}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            ← 返回聊天
          </button>
          <h1 className="text-2xl font-bold">世界书管理</h1>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all"
        >
          + 新建世界书
        </button>
      </div>

      {/* 内容区 */}
      <div className="max-w-6xl mx-auto px-6">
        {isLoading ? (
          <div className="text-center py-16 text-slate-600">加载中...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-slate-600">
            <p className="mb-4">还没有世界书条目</p>
            <button onClick={handleCreate} className="text-amber-400 hover:underline">
              创建第一个世界书
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {entries.map((entry) => (
              <div
                key={entry.id}
                onClick={() => goTo('worldbook-editor', { id: entry.id })}
                className="group relative p-5 rounded-xl cursor-pointer bg-slate-900/60 border border-slate-800/40 hover:border-amber-500/30 hover:bg-slate-900/80 transition-all"
              >
                {/* 删除按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(entry.id, entry.name);
                  }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
                >
                  ×
                </button>

                {/* 内容 */}
                <h3 className="text-lg font-medium text-slate-200 mb-2 pr-6">{entry.name}</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {entry.keywords.map((kw) => (
                    <span key={kw} className="px-2 py-1 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {kw}
                    </span>
                  ))}
                  {entry.keywords.length === 0 && (
                    <span className="text-slate-600 text-sm">无关键词</span>
                  )}
                </div>
                {entry.comment && (
                  <p className="text-sm text-slate-500 line-clamp-2">{entry.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default WorldBookList;
