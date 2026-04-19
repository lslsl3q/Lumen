/**
 * 世界书编辑器页
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../api/worldbook';

function WorldBookEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [form, setForm] = useState({
    id: '',
    name: '',
    keywords: [] as string[],
    content: '',
    enabled: true,
    case_sensitive: false,
    whole_word: true,
    position: 'before_user' as 'before_sys' | 'after_sys' | 'before_user' | 'after_user',
    depth: 4,
    order: 0,
    scan_depth: 10,
    character_ids: [] as string[],
    comment: '',
  });

  const [newKeyword, setNewKeyword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载条目
  useEffect(() => {
    if (!isEditMode || !id) return;
    (async () => {
      try {
        setIsLoading(true);
        const data = await api.getWorldBook(id);
        setForm(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isEditMode, id]);

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    if (form.keywords.includes(trimmed)) {
      setNewKeyword('');
      return;
    }
    setForm(prev => ({ ...prev, keywords: [...prev.keywords, trimmed] }));
    setNewKeyword('');
  };

  const handleRemoveKeyword = (index: number) => {
    setForm(prev => ({ ...prev, keywords: prev.keywords.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('名称不能为空');
      return;
    }

    if (form.keywords.length === 0) {
      setError('至少需要一个关键词');
      return;
    }

    if (!form.content.trim()) {
      setError('内容不能为空');
      return;
    }

    try {
      setIsSaving(true);
      if (isEditMode) {
        const updates = { ...form };
        await api.updateWorldBook(id, updates);
      } else {
        await api.createWorldBook(form);
      }
      navigate('/settings/worldbooks');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* 顶栏 */}
      <div className="flex items-center justify-between mb-8 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/settings/worldbooks')}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-2xl font-bold">{isEditMode ? '编辑世界书' : '新建世界书'}</h1>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-6 space-y-6">
        {/* 基本信息 */}
        <section className="space-y-4">
          <h3 className="text-sm text-slate-400">基本信息</h3>

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">名称</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="魔法系统"
              className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">备注</label>
            <input
              type="text"
              value={form.comment}
              onChange={e => setForm({ ...form, comment: e.target.value })}
              placeholder="可选说明"
              className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all"
            />
          </div>
        </section>

        {/* 触发条件 */}
        <section className="space-y-4">
          <h3 className="text-sm text-slate-400">触发条件</h3>

          {/* 关键词 */}
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">关键词</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {form.keywords.map((kw, i) => (
                <span key={kw} className="px-3 py-1 rounded-full text-sm bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-2">
                  {kw}
                  <button
                    onClick={() => handleRemoveKeyword(i)}
                    className="text-amber-600 hover:text-amber-300"
                  >
                    ×
                  </button>
                </span>
              ))}
              {form.keywords.length === 0 && (
                <span className="text-slate-600 text-sm">暂无关键词</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
                placeholder="添加关键词"
                className="flex-1 px-4 py-2.5 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all"
              />
              <button
                type="button"
                onClick={handleAddKeyword}
                disabled={!newKeyword.trim()}
                className="px-4 py-2.5 rounded-lg text-sm bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                添加
              </button>
            </div>
          </div>

          {/* 匹配选项 */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.case_sensitive}
                onChange={e => setForm({ ...form, case_sensitive: e.target.checked })}
                className="rounded border-slate-600"
              />
              区分大小写
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.whole_word}
                onChange={e => setForm({ ...form, whole_word: e.target.checked })}
                className="rounded border-slate-600"
              />
              全词匹配
            </label>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">扫描深度（最近N条消息）</label>
            <input
              type="number"
              min={1}
              max={50}
              value={form.scan_depth}
              onChange={e => setForm({ ...form, scan_depth: Number(e.target.value) })}
              className="w-24 px-3 py-1.5 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-none focus:border-amber-500/40 transition-all"
            />
          </div>
        </section>

        {/* 注入控制 */}
        <section className="space-y-4">
          <h3 className="text-sm text-slate-400">注入控制</h3>

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">注入位置</label>
            <select
              value={form.position}
              onChange={e => setForm({ ...form, position: e.target.value as any })}
              className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-none focus:border-amber-500/40 transition-all"
            >
              <option value="before_sys">系统提示词之前</option>
              <option value="after_sys">系统提示词之后</option>
              <option value="before_user">用户消息之前</option>
              <option value="after_user">用户消息之后</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">注入深度（1-10，数字越小越优先）</label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.depth}
              onChange={e => setForm({ ...form, depth: Number(e.target.value) })}
              className="w-24 px-3 py-1.5 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-none focus:border-amber-500/40 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">优先级（数字越小越优先）</label>
            <input
              type="number"
              min={0}
              max={100}
              value={form.order}
              onChange={e => setForm({ ...form, order: Number(e.target.value) })}
              className="w-24 px-3 py-1.5 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-none focus:border-amber-500/40 transition-all"
            />
          </div>
        </section>

        {/* 内容 */}
        <section className="space-y-4">
          <h3 className="text-sm text-slate-400">注入内容</h3>
          <textarea
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
            placeholder="当关键词被触发时，这段内容会被注入到提示词中..."
            rows={8}
            className="w-full px-4 py-3 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all resize-y"
          />
        </section>

        {/* 启用开关 */}
        <section>
          <label className="flex items-center justify-between px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
            <div>
              <div className="text-sm text-slate-200">启用此条目</div>
              <div className="text-xs text-slate-600">禁用后不会触发注入</div>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, enabled: !form.enabled })}
              className={`
                relative w-10 h-5 rounded-full transition-colors duration-200
                ${form.enabled ? 'bg-amber-500/30' : 'bg-slate-700'}
              `}
            >
              <span
                className={`
                  absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-slate-300 transition-transform duration-200
                  ${form.enabled ? 'translate-x-[20px]' : ''}
                `}
              />
            </button>
          </label>
        </section>

        {/* 底部操作栏 */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/40">
          <button
            type="button"
            onClick={() => navigate('/settings/worldbooks')}
            className="px-5 py-2.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default WorldBookEditor;
