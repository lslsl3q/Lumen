/**
 * Skill 编辑器页
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '../api/skills';
import { SettingsPageProps } from '../types/settings';

interface SkillEditorProps extends SettingsPageProps {
  skillId?: string;
}

function SkillEditor({ skillId, onBack }: SkillEditorProps) {
  const { id: paramId } = useParams<{ id: string }>();
  const id = skillId || paramId;
  const isEditMode = !!id;

  // 导航辅助：优先用回调，回退到路由
  const goBack = onBack ?? (() => goBack());

  const [form, setForm] = useState({
    name: '',
    description: '',
    content: '',
    enabled: true,
    when_to_use: '',
    argument_hint: '',
    priority: 0,
    script: '',
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
        setForm({
          name: data.name,
          description: data.description,
          content: data.content,
          enabled: data.enabled,
          when_to_use: data.when_to_use || '',
          argument_hint: data.argument_hint || '',
          priority: data.priority || 0,
          script: data.script || '',
        });
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
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="h-full bg-slate-950 text-slate-600 flex items-center justify-center">加载中...</div>;

  return (
    <div className="h-full bg-slate-950 text-slate-200">
      {/* 顶栏 */}
      <div className="flex items-center gap-4 mb-8 px-6 py-4">
        <button onClick={() => goBack()} className="text-slate-400 hover:text-slate-200 transition-colors">
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
              className="w-full px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-hidden focus:border-amber-500/40 transition-all"
              placeholder="如：写作助手、代码审查"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">描述</label>
            <input
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-hidden focus:border-amber-500/40 transition-all"
              placeholder="一句话说明这个 Skill 做什么"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">使用时机 <span className="text-slate-600">(帮助 AI 判断何时使用)</span></label>
            <input
              value={form.when_to_use}
              onChange={(e) => setForm(f => ({ ...f, when_to_use: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-hidden focus:border-amber-500/40 transition-all"
              placeholder="如：当用户需要写作帮助、创意灵感时"
            />
            <p className="text-xs text-slate-600 mt-1">AI 会根据这段描述自主判断是否使用此 Skill</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">优先级</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-hidden focus:border-amber-500/40 transition-all"
                placeholder="0"
              />
              <p className="text-xs text-slate-600 mt-1">数字越大，越优先注入</p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">参数提示 <span className="text-slate-600">(可选)</span></label>
              <input
                value={form.argument_hint}
                onChange={(e) => setForm(f => ({ ...f, argument_hint: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-hidden focus:border-amber-500/40 transition-all"
                placeholder="[主题或需求]"
              />
            </div>
          </div>
        </section>

        {/* 脚本配置 */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">脚本配置 <span className="text-slate-600 normal-case">(可选)</span></h2>
          <div>
            <input
              value={form.script}
              onChange={(e) => setForm(f => ({ ...f, script: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-hidden focus:border-amber-500/40 transition-all font-mono text-sm"
              placeholder="scripts/run.py"
            />
            <p className="text-xs text-slate-600 mt-1">
              脚本路径（相对于 skill 目录），调用时自动执行并注入输出。脚本可通过 lumen_skill_api 调用 Lumen 工具。
            </p>
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
              className="w-full px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-200 focus:outline-hidden focus:border-amber-500/40 transition-all font-mono text-sm resize-y"
              placeholder={`定义 AI 在使用这个 Skill 时应该遵循的工作流程...\n\n建议格式：\n## Goal\n目标描述\n\n## 原则\n1. 原则一\n2. 原则二`}
            />
            <p className="text-xs text-slate-600 mt-1">
              建议 Goal + 原则/步骤 的结构化格式，帮助 AI 理解工作流程
            </p>
          </div>
        </section>

        {/* 启用开关 */}
        <section>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-slate-400">启用此 Skill</span>
              <p className="text-xs text-slate-600">关闭后不注入提示词，但仍可通过命令调用</p>
            </div>
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
            onClick={() => goBack()}
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
