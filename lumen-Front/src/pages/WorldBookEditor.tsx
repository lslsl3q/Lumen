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
    secondary_keywords: [] as string[],
    selective: false,
    selective_logic: 'and' as 'and' | 'not',
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
  const [newSecondary, setNewSecondary] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditMode || !id) return;
    (async () => {
      try {
        setIsLoading(true);
        const data = await api.getWorldBook(id);
        setForm({
          ...form,
          ...data,
          secondary_keywords: data.secondary_keywords || [],
          selective: data.selective || false,
          selective_logic: data.selective_logic || 'and',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, id]);

  // --- 关键词管理 ---
  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed || form.keywords.includes(trimmed)) { setNewKeyword(''); return; }
    setForm(prev => ({ ...prev, keywords: [...prev.keywords, trimmed] }));
    setNewKeyword('');
  };
  const handleRemoveKeyword = (index: number) => {
    setForm(prev => ({ ...prev, keywords: prev.keywords.filter((_, i) => i !== index) }));
  };

  // --- 次关键词管理 ---
  const handleAddSecondary = () => {
    const trimmed = newSecondary.trim();
    if (!trimmed || form.secondary_keywords.includes(trimmed)) { setNewSecondary(''); return; }
    setForm(prev => ({ ...prev, secondary_keywords: [...prev.secondary_keywords, trimmed] }));
    setNewSecondary('');
  };
  const handleRemoveSecondary = (index: number) => {
    setForm(prev => ({ ...prev, secondary_keywords: prev.secondary_keywords.filter((_, i) => i !== index) }));
  };

  // --- 提交 ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('名称不能为空'); return; }
    if (form.keywords.length === 0) { setError('至少需要一个关键词'); return; }
    if (!form.content.trim()) { setError('内容不能为空'); return; }
    if (form.selective && form.secondary_keywords.length === 0) { setError('启用条件组合时需要至少一个次关键词'); return; }

    try {
      setIsSaving(true);
      if (isEditMode) {
        await api.updateWorldBook(id, { ...form });
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

  // 复用样式常量
  const inputCls = "w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 placeholder-slate-600 focus:outline-hidden focus:border-amber-500/40 transition-all";
  const numInputCls = "w-24 px-3 py-1.5 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-hidden focus:border-amber-500/40 transition-all";
  const sectionTitleCls = "text-sm text-slate-400 mb-3";
  const tagCls = (color: string) => `px-3 py-1 rounded-full text-sm bg-${color}-500/10 text-${color}-400 border border-${color}-500/20 flex items-center gap-2`;
  const addBtnCls = (color: string) => `px-4 py-2.5 rounded-lg text-sm bg-${color}-500/10 border border-${color}-500/30 text-${color}-400 hover:bg-${color}-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* 顶栏 */}
      <div className="flex items-center justify-between mb-6 px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/settings/worldbooks')} className="text-slate-400 hover:text-slate-200 transition-colors">
            ← 返回
          </button>
          <h1 className="text-2xl font-bold">{isEditMode ? '编辑世界书' : '新建世界书'}</h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-6 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="px-6 space-y-6">
        {/* 基本信息 */}
        <section className="space-y-3">
          <h3 className={sectionTitleCls}>基本信息</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">名称</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="魔法系统" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">备注</label>
              <input type="text" value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} placeholder="可选说明" className={inputCls} />
            </div>
          </div>
        </section>

        {/* 双栏：触发条件 + 注入控制 */}
        <div className="grid grid-cols-2 gap-6">
          {/* 左栏：触发条件 */}
          <section className="space-y-4">
            <h3 className={sectionTitleCls}>触发条件</h3>

            {/* 主关键词 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">主关键词（任一命中即触发）</label>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                {form.keywords.map((kw, i) => (
                  <span key={kw} className={tagCls('amber')}>
                    {kw}
                    <button onClick={() => handleRemoveKeyword(i)} className="text-amber-600 hover:text-amber-300">×</button>
                  </span>
                ))}
                {form.keywords.length === 0 && <span className="text-slate-600 text-xs">暂无</span>}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newKeyword} onChange={e => setNewKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
                  placeholder="添加关键词" className={`${inputCls} flex-1`} />
                <button type="button" onClick={handleAddKeyword} disabled={!newKeyword.trim()} className={addBtnCls('amber')}>添加</button>
              </div>
            </div>

            {/* 次关键词 + selective */}
            <div>
              <label className="flex items-center gap-2 text-xs text-slate-500 mb-2 cursor-pointer">
                <input type="checkbox" checked={form.selective} onChange={e => setForm({ ...form, selective: e.target.checked })} className="rounded border-slate-600" />
                启用条件组合（次关键词）
              </label>

              {form.selective && (
                <div className="space-y-3 pl-1 border-l-2 border-slate-800 ml-1">
                  <div>
                    <select value={form.selective_logic} onChange={e => setForm({ ...form, selective_logic: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-hidden focus:border-amber-500/40 transition-all">
                      <option value="and">AND — 次关键词也必须命中才触发</option>
                      <option value="not">NOT — 次关键词命中时不触发</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
                      {form.secondary_keywords.map((kw, i) => (
                        <span key={kw} className={tagCls('blue')}>
                          {kw}
                          <button onClick={() => handleRemoveSecondary(i)} className="text-blue-600 hover:text-blue-300">×</button>
                        </span>
                      ))}
                      {form.secondary_keywords.length === 0 && <span className="text-slate-600 text-xs">暂无次关键词</span>}
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={newSecondary} onChange={e => setNewSecondary(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddSecondary())}
                        placeholder="添加次关键词" className={`${inputCls} flex-1`} />
                      <button type="button" onClick={handleAddSecondary} disabled={!newSecondary.trim()} className={addBtnCls('blue')}>添加</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 匹配选项 */}
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                <input type="checkbox" checked={form.case_sensitive} onChange={e => setForm({ ...form, case_sensitive: e.target.checked })} className="rounded border-slate-600" />
                区分大小写
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                <input type="checkbox" checked={form.whole_word} onChange={e => setForm({ ...form, whole_word: e.target.checked })} className="rounded border-slate-600" />
                全词匹配
              </label>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">扫描深度（最近N条消息）</label>
              <input type="number" min={1} max={50} value={form.scan_depth} onChange={e => setForm({ ...form, scan_depth: Number(e.target.value) })} className={numInputCls} />
            </div>
          </section>

          {/* 右栏：注入控制 */}
          <section className="space-y-4">
            <h3 className={sectionTitleCls}>注入控制</h3>

            <div>
              <label className="block text-xs text-slate-500 mb-1">注入位置</label>
              <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value as any })}
                className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-hidden focus:border-amber-500/40 transition-all">
                <option value="before_sys">系统提示词之前</option>
                <option value="after_sys">系统提示词之后</option>
                <option value="before_user">用户消息之前</option>
                <option value="after_user">用户消息之后</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">注入深度（1-10，越小越优先）</label>
              <input type="number" min={1} max={10} value={form.depth} onChange={e => setForm({ ...form, depth: Number(e.target.value) })} className={numInputCls} />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">优先级（越小越优先）</label>
              <input type="number" min={0} max={100} value={form.order} onChange={e => setForm({ ...form, order: Number(e.target.value) })} className={numInputCls} />
            </div>

            {/* 启用开关 */}
            <label className="flex items-center justify-between px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
              <div>
                <div className="text-sm text-slate-200">启用此条目</div>
                <div className="text-xs text-slate-600">禁用后不会触发注入</div>
              </div>
              <button type="button" onClick={() => setForm({ ...form, enabled: !form.enabled })}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${form.enabled ? 'bg-amber-500/30' : 'bg-slate-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-slate-300 transition-transform duration-200 ${form.enabled ? 'translate-x-[20px]' : ''}`} />
              </button>
            </label>
          </section>
        </div>

        {/* 内容区 — 全宽 */}
        <section className="space-y-2">
          <h3 className={sectionTitleCls}>注入内容</h3>
          <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
            placeholder="当关键词被触发时，这段内容会被注入到提示词中..."
            rows={10}
            className="w-full px-4 py-3 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-200 placeholder-slate-600 focus:outline-hidden focus:border-amber-500/40 transition-all resize-y" />
        </section>

        {/* 底部操作栏 */}
        <div className="flex justify-end gap-3 pt-4 pb-8 border-t border-slate-800/40">
          <button type="button" onClick={() => navigate('/settings/worldbooks')} className="px-5 py-2.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors">
            取消
          </button>
          <button type="submit" disabled={isSaving}
            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default WorldBookEditor;
