/**
 * 角色编辑器 — 创建/编辑角色
 *
 * 路由：
 *   /settings/characters/new  → 新建模式
 *   /settings/characters/:id  → 编辑模式
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCharacter,
  createCharacter as apiCreate,
  updateCharacter as apiUpdate,
  getAvatarUrl,
} from '../api/character';
import { CharacterFormData } from '../types/character';
import ModelSelect from '../components/ModelSelect';

/** registry.json 中单个工具的信息 */
interface ToolInfo {
  name: string;
  description: string;
  usage_guide: string;
}

/** 从 config API 获取可用工具列表（含 usage_guide） */
async function fetchAvailableTools(): Promise<ToolInfo[]> {
  try {
    const res = await fetch('http://127.0.0.1:8888/config/tools');
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.parsed) return [];
    return Object.entries(data.parsed).map(([name, def]: [string, any]) => ({
      name,
      description: def.description || '',
      usage_guide: def.usage_guide || '',
    }));
  } catch {
    return [];
  }
}

function CharacterEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = !!id;

  // 表单状态
  const [characterId, setCharacterId] = useState('');
  const [form, setForm] = useState<CharacterFormData>({
    name: '',
    description: '',
    system_prompt: '',
    greeting: '',
    tools: [],
    tool_tips: {},
    model: '',
    context_size: undefined,
    auto_compact: false,
    compact_threshold: 0.7,
    memory_enabled: true,
    memory_token_budget: 300,
    memory_auto_summarize: false,
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([]);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  // UI 状态
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);

  // 从 registry 提取的默认 tips（usage_guide）
  const defaultTips: Record<string, string> = {};
  for (const t of availableTools) {
    if (t.usage_guide) defaultTips[t.name] = t.usage_guide;
  }

  // 加载可用工具列表
  useEffect(() => {
    fetchAvailableTools().then(setAvailableTools);
  }, []);

  // 编辑模式：加载角色数据
  useEffect(() => {
    if (!isEditMode || !id) return;
    (async () => {
      try {
        setIsLoading(true);
        const char = await getCharacter(id);
        setCharacterId(id);
        setForm({
          name: char.name,
          description: char.description || '',
          system_prompt: char.system_prompt || '',
          greeting: char.greeting || '',
          tools: char.tools || [],
          tool_tips: char.tool_tips || {},
          model: char.model || '',
          context_size: char.context_size || undefined,
          auto_compact: char.auto_compact || false,
          compact_threshold: char.compact_threshold || 0.7,
          memory_enabled: char.memory_enabled ?? true,
          memory_token_budget: char.memory_token_budget || 300,
          memory_auto_summarize: char.memory_auto_summarize || false,
        });
        if (char.avatar) {
          setAvatarPreview(getAvatarUrl(char.avatar));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载角色失败');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isEditMode, id]);

  // 头像预览
  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  // 工具开关
  const toggleTool = useCallback((tool: string) => {
    setForm(prev => ({
      ...prev,
      tools: prev.tools?.includes(tool)
        ? prev.tools.filter(t => t !== tool)
        : [...(prev.tools || []), tool],
    }));
  }, []);

  // 工具排序
  const moveTool = useCallback((index: number, direction: -1 | 1) => {
    setForm(prev => {
      const tools = [...(prev.tools || [])];
      const target = index + direction;
      if (target < 0 || target >= tools.length) return prev;
      [tools[index], tools[target]] = [tools[target], tools[index]];
      return { ...prev, tools };
    });
  }, []);

  // 工具 tips 编辑
  const handleTipChange = useCallback((tool: string, value: string) => {
    setForm(prev => ({
      ...prev,
      tool_tips: { ...(prev.tool_tips || {}), [tool]: value },
    }));
  }, []);

  // 恢复默认 tips
  const resetTip = useCallback((tool: string) => {
    setForm(prev => {
      const tips = { ...(prev.tool_tips || {}) };
      delete tips[tool];
      return { ...prev, tool_tips: tips };
    });
    setExpandedTool(null);
  }, []);

  // 提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('请输入角色名字');
      return;
    }

    try {
      setIsSaving(true);

      // 清理 tool_tips：只保留与默认值不同的自定义内容
      const cleanedTips: Record<string, string> = {};
      for (const [tool, tip] of Object.entries(form.tool_tips || {})) {
        if (tip !== (defaultTips[tool] || '')) {
          cleanedTips[tool] = tip;
        }
      }

      const dataToSubmit = { ...form, tool_tips: cleanedTips };

      if (isEditMode) {
        await apiUpdate(id!, dataToSubmit, avatarFile || undefined);
        navigate('/settings/characters');
      } else {
        // 新建模式，不传 ID，让后端自动生成
        const result = await apiCreate(dataToSubmit, avatarFile || undefined);
        // 使用后端返回的 ID 导航
        navigate(`/settings/characters/${result.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-deep flex items-center justify-center text-slate-600">
        加载中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-deep text-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* 顶栏 */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/settings/characters')}
            className="
              px-3 py-1.5 rounded-lg text-sm text-slate-400
              hover:text-slate-200 hover:bg-slate-800/60
              transition-all duration-150
            "
          >
            &larr; 返回列表
          </button>
          <h1 className="text-xl font-light tracking-wide">
            {isEditMode ? `编辑角色: ${form.name}` : '新建角色'}
          </h1>
        </div>

        {/* 错误 */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 基本信息 */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">基本信息</h2>

            <div className="flex gap-6">
              {/* 头像上传 */}
              <div className="flex-shrink-0">
                <label className="block cursor-pointer group">
                  <div className="
                    w-24 h-24 rounded-full bg-surface border-2 border-dashed border-surface-elevated
                    flex items-center justify-center overflow-hidden
                    group-hover:border-teal-500/40 transition-all duration-200
                  ">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="头像" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-slate-600">上传头像</span>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* ID + 名字 */}
              <div className="flex-1 space-y-3">
                {/* 名字 */}
                <div>
                  <label className="block text-xs text-slate-500 mb-1">名字</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="角色的显示名称"
                    className="
                      w-full px-3 py-2 rounded-lg text-sm
                      bg-slate-800/40 border border-slate-700/40
                      text-slate-200 placeholder-slate-600
                      focus:border-teal-500/40 focus:outline-none
                      transition-all duration-150
                    "
                  />
                </div>
              </div>
            </div>

            {/* 描述 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">描述</label>
              <input
                type="text"
                value={form.description || ''}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="简短描述角色身份（如：一个热心的猫咪助手）"
                className="
                  w-full px-3 py-2 rounded-lg text-sm
                  bg-slate-800/40 border border-slate-700/40
                  text-slate-200 placeholder-slate-600
                  focus:border-teal-500/40 focus:outline-none
                  transition-all duration-150
                "
              />
            </div>

            {/* 开场白 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">开场白</label>
              <input
                type="text"
                value={form.greeting || ''}
                onChange={e => setForm(prev => ({ ...prev, greeting: e.target.value }))}
                placeholder="新会话时 AI 的第一句话"
                className="
                  w-full px-3 py-2 rounded-lg text-sm
                  bg-slate-800/40 border border-slate-700/40
                  text-slate-200 placeholder-slate-600
                  focus:border-teal-500/40 focus:outline-none
                  transition-all duration-150
                "
              />
            </div>
          </section>

          {/* 系统提示词 */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">系统提示词</h2>
            <div className="text-[10px] text-slate-600">
              角色的核心设定。name 和 description 会自动拼入提示词，不需要在这里重复。
            </div>
            <textarea
              value={form.system_prompt || ''}
              onChange={e => setForm(prev => ({ ...prev, system_prompt: e.target.value }))}
              placeholder="你的角色设定、行为准则、说话风格..."
              rows={10}
              className="
                w-full px-4 py-3 rounded-lg text-sm
                bg-slate-800/40 border border-slate-700/40
                text-slate-200 placeholder-slate-600
                focus:border-teal-500/40 focus:outline-none
                transition-all duration-150 resize-y
                font-mono leading-relaxed
              "
            />
          </section>

          {/* 模型与上下文 */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">模型与上下文</h2>

            {/* 模型名称 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">模型名称</label>
              <ModelSelect
                value={form.model || ''}
                onChange={(v) => setForm(prev => ({ ...prev, model: v || undefined }))}
                placeholder="留空使用全局默认"
                allowEmpty={true}
              />
            </div>

            {/* 上下文大小 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">上下文大小 (tokens)</label>
              <input
                type="number"
                value={form.context_size || ''}
                onChange={(e) => setForm(prev => ({
                  ...prev,
                  context_size: e.target.value ? parseInt(e.target.value) : undefined,
                }))}
                placeholder="留空使用默认 8192"
                className="
                  w-full bg-slate-900/60 border border-slate-700/60 rounded-lg
                  px-3 py-2 text-sm text-slate-300 placeholder-slate-600
                  focus:outline-none focus:border-teal-500/50
                "
              />
              <p className="text-xs text-slate-600 mt-1">此模型的最大上下文窗口（tokens）</p>
            </div>

            {/* 自动 Compact 开关 */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-slate-300">自动压缩</label>
                <p className="text-xs text-slate-600">上下文达到阈值时自动摘要压缩</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, auto_compact: !prev.auto_compact }))}
                className={`
                  w-9 h-5 rounded-full transition-colors duration-200 relative
                  ${form.auto_compact ? 'bg-teal-500' : 'bg-slate-700'}
                `}
              >
                <div className={`
                  absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm
                  transition-transform duration-200
                  ${form.auto_compact ? 'translate-x-4' : 'translate-x-0.5'}
                `} />
              </button>
            </div>

            {/* 阈值滑块（仅开启时显示） */}
            {form.auto_compact && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-500">触发阈值</label>
                  <span className="text-xs text-teal-400 font-mono">
                    {Math.round((form.compact_threshold || 0.7) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  value={form.compact_threshold || 0.7}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    compact_threshold: parseFloat(e.target.value),
                  }))}
                  className="w-full accent-teal-500"
                />
                <div className="flex justify-between text-xs text-slate-600">
                  <span>50%</span>
                  <span>95%</span>
                </div>
              </div>
            )}
          </section>

          {/* 跨会话记忆 */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">跨会话记忆</h2>

            {/* 记忆开关 */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-slate-300">记忆召回</label>
                <p className="text-xs text-slate-600">自动搜索历史对话，注入相关记忆</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, memory_enabled: !prev.memory_enabled }))}
                className={`
                  w-9 h-5 rounded-full transition-colors duration-200 relative
                  ${form.memory_enabled !== false ? 'bg-teal-500' : 'bg-slate-700'}
                `}
              >
                <div className={`
                  absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm
                  transition-transform duration-200
                  ${form.memory_enabled !== false ? 'translate-x-4' : 'translate-x-0.5'}
                `} />
              </button>
            </div>

            {form.memory_enabled !== false && (
              <>
                {/* Token 上限 */}
                <div>
                  <label className="block text-xs text-slate-500 mb-1">召回 Token 上限</label>
                  <input
                    type="number"
                    value={form.memory_token_budget || 300}
                    onChange={(e) => setForm(prev => ({
                      ...prev,
                      memory_token_budget: Math.max(50, parseInt(e.target.value) || 300),
                    }))}
                    min={50}
                    max={2000}
                    className="
                      w-full bg-slate-900/60 border border-slate-700/60 rounded-lg
                      px-3 py-2 text-sm text-slate-300 placeholder-slate-600
                      focus:outline-none focus:border-teal-500/50
                    "
                  />
                  <p className="text-xs text-slate-600 mt-1">每次对话最多花多少 token 召回历史（50~2000）</p>
                </div>

                {/* 超预算处理 */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm text-slate-300">超预算自动总结</label>
                    <p className="text-xs text-slate-600">关闭则直接截断，开启则用摘要模型压缩</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, memory_auto_summarize: !prev.memory_auto_summarize }))}
                    className={`
                      w-9 h-5 rounded-full transition-colors duration-200 relative
                      ${form.memory_auto_summarize ? 'bg-teal-500' : 'bg-slate-700'}
                    `}
                  >
                    <div className={`
                      absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm
                      transition-transform duration-200
                      ${form.memory_auto_summarize ? 'translate-x-4' : 'translate-x-0.5'}
                    `} />
                  </button>
                </div>
              </>
            )}
          </section>

          {/* 工具配置 */}
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">工具配置</h2>
            <div className="text-[10px] text-slate-600">
              启用工具并自定义使用提示。排列顺序影响 AI 优先级——排在前面的工具更优先使用。
            </div>

            {availableTools.length === 0 ? (
              <div className="text-xs text-slate-600">没有找到可用工具（确保后端正在运行）</div>
            ) : (
              <>
                {/* 已启用工具（按顺序排列，可排序、可编辑 tips） */}
                {form.tools && form.tools.length > 0 && (
                  <div className="space-y-2">
                    {form.tools.map((toolName, index) => {
                      const toolInfo = availableTools.find(t => t.name === toolName);
                      if (!toolInfo) return null; // 工具已从 registry 移除
                      const isExpanded = expandedTool === toolName;
                      const customTip = form.tool_tips?.[toolName];
                      const displayTip = customTip ?? defaultTips[toolName] ?? '';
                      const isModified = !!customTip && customTip !== defaultTips[toolName];

                      return (
                        <div
                          key={toolName}
                          className={`
                            rounded-lg border transition-all duration-150
                            ${isExpanded
                              ? 'border-teal-500/30 bg-teal-500/5'
                              : 'border-slate-700/40 bg-slate-800/20'
                            }
                          `}
                        >
                          {/* 工具卡片头部 */}
                          <div className="flex items-center gap-2 px-3 py-2">
                            {/* 排序手柄 */}
                            <span className="text-slate-600 text-xs select-none">&#8942;</span>

                            {/* 工具名 */}
                            <span className="font-mono text-sm text-teal-400">{toolName}</span>

                            {/* 自定义标记 */}
                            {isModified && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                已自定义
                              </span>
                            )}

                            <div className="flex-1" />

                            {/* 展开/收起 */}
                            <button
                              type="button"
                              onClick={() => setExpandedTool(isExpanded ? null : toolName)}
                              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                            >
                              {isExpanded ? '收起' : '编辑提示'}
                            </button>

                            {/* 上移 */}
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveTool(index, -1)}
                              className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-20 transition-opacity"
                            >
                              &#9650;
                            </button>

                            {/* 下移 */}
                            <button
                              type="button"
                              disabled={index === (form.tools?.length ?? 0) - 1}
                              onClick={() => moveTool(index, 1)}
                              className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-20 transition-opacity"
                            >
                              &#9660;
                            </button>

                            {/* 移除 */}
                            <button
                              type="button"
                              onClick={() => toggleTool(toolName)}
                              className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                            >
                              &#10005;
                            </button>
                          </div>

                          {/* 展开的 tips 编辑区 */}
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-1 border-t border-slate-700/30 space-y-2">
                              <textarea
                                value={displayTip}
                                onChange={e => handleTipChange(toolName, e.target.value)}
                                placeholder="描述这个工具的使用时机和规则..."
                                rows={3}
                                className="
                                  w-full px-3 py-2 rounded-lg text-sm
                                  bg-slate-800/40 border border-slate-700/40
                                  text-slate-200 placeholder-slate-600
                                  focus:border-teal-500/40 focus:outline-none
                                  transition-all duration-150 resize-y
                                "
                              />
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-600">
                                  {isModified ? '已自定义，不会被工具更新覆盖' : '使用默认提示'}
                                </span>
                                {isModified && (
                                  <button
                                    type="button"
                                    onClick={() => resetTip(toolName)}
                                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                                  >
                                    恢复默认
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 未启用工具 */}
                {(() => {
                  const enabledSet = new Set(form.tools || []);
                  const disabledTools = availableTools.filter(t => !enabledSet.has(t.name));
                  if (disabledTools.length === 0) return null;
                  return (
                    <div>
                      <div className="text-xs text-slate-600 mb-2">未启用</div>
                      <div className="flex flex-wrap gap-2">
                        {disabledTools.map(tool => (
                          <button
                            key={tool.name}
                            type="button"
                            onClick={() => toggleTool(tool.name)}
                            className="
                              px-3 py-1.5 rounded-lg text-sm font-mono
                              text-slate-500 border border-slate-700/40
                              hover:text-slate-300 hover:border-slate-600/40
                              transition-all duration-150
                            "
                          >
                            + {tool.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </section>

          {/* 提交按钮 */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/40">
            <button
              type="button"
              onClick={() => navigate('/settings/characters')}
              className="
                px-5 py-2.5 rounded-lg text-sm
                text-slate-400 hover:text-slate-200
                hover:bg-slate-800/40
                transition-all duration-150
              "
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`
                px-6 py-2.5 rounded-lg text-sm font-medium
                bg-teal-500/15 text-teal-400 border border-teal-500/25
                hover:bg-teal-500/25 hover:border-teal-500/40
                transition-all duration-150
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {isSaving ? '保存中...' : isEditMode ? '保存修改' : '创建角色'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CharacterEditor;
