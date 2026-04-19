/**
 * Skill 编辑器页
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '../api/skills';

function SkillEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [form, setForm] = useState({
    name: '',
    description: '',
    content: '',
    enabled: true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditMode || !id) return;
    (async () => {
      try {
        setIsLoading(true);
        const data = await api.getSkill(id);
        setForm({ name: data.name, description: data.description, content: data.content, enabled: data.enabled });
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isEditMode, id]);

  const handleSave = async () => {
    if (!form.name.trim()) { setError('名称不能为空'); return; }
    if (!form.content.trim()) { setError('内容不能为空'); return; }

    try {
      setIsSaving(true);
      setError(null);
      if (isEditMode && id) {
        await api.updateSkill(id, form);
      } else {
        await api.createSkill(form);
      }
      navigate('/settings/skills');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 text-slate-600 flex items-center justify-center">加载中...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* 顶栏 */}
      <div className="flex items-center gap-4 mb-8 px-6 py-4">
        <button onClick={() => navigate('/settings/skills')} className="text-slate-400 hover:text-slate-200 transition-colors">
          ← 返回列表
        </button>
        <h1 className="text-2xl font-bold">{isEditMode ? '编辑 Skill' : '新建 Skill'}</h1>
      </div>

      <div className="max-w-2xl mx-auto px-6 space-y-6">
        {error && (
          <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        {/* 基本信息 */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">基本信息</h2>

          <div>
            <label className="block text-sm text-slate-400 mb-1">名称</label>
            <input
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-none focus:border-amber-500/40 transition-all"
              placeholder="如：写作助手、代码审查"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">描述</label>
            <input
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-none focus:border-amber-500/40 transition-all"
              placeholder="一句话说明这个 Skill 做什么"
            />
          </div>
        </section>

        {/* 提示词内容 */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">提示词内容</h2>
          <div>
            <textarea
              value={form.content}
              onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
              rows={10}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-none focus:border-amber-500/40 transition-all font-mono text-sm resize-y"
              placeholder="定义 AI 在使用这个 Skill 时应该遵循的工作流程...&#10;&#10;例如：&#10;1. 先了解用户的目标&#10;2. 按步骤提供建议&#10;3. 保持专业但友好的语气"
            />
            <p className="text-xs text-slate-600 mt-1">
              这段文字会作为系统提示词注入，告诉 AI 按什么方式工作
            </p>
          </div>
        </section>

        {/* 启用开关 */}
        <section>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">启用此 Skill</span>
            <button
              onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              className={`w-10 h-5 rounded-full transition-colors ${form.enabled ? 'bg-emerald-500/40' : 'bg-slate-700/40'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-slate-300 transition-transform ${form.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </section>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={() => navigate('/settings/skills')}
            className="px-5 py-2.5 rounded-lg text-sm bg-slate-800/40 border border-slate-700/40 text-slate-400 hover:bg-slate-800/60 transition-all"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-lg text-sm bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 disabled:opacity-40 transition-all"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SkillEditor;
