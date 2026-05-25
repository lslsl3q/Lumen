/**
 * CharacterPanel — 角色面板（三级导航 + shadcn）
 *
 * Level 1: 角色列表（选择 / 双击编辑 / 新建）
 * Level 2: 设置概览（基本信息 + 模型 + 记忆 + 区块入口）
 * Level 3: 详情（系统提示词 / 工具 / 技能）
 *
 * Bug 修复：
 * - CharacterInfo 缺失字段导致保存覆盖（已在后端修复）
 * - 工具排序：添加上移/下移按钮
 */
import { useState, useCallback } from 'react';
import { CharacterListItem, CharacterFormData } from '../../types/character';
import { getCharacter, updateCharacter, createCharacter } from '../../api/character';
import { getAvatarUrl } from '../../utils/url';
import { useSkills } from '../../hooks/useSkills';
import { useModels } from '../../hooks/useModels';
import { BackButton } from './shared/BackButton';
import { AvatarUpload } from './shared/AvatarUpload';
import { SectionHeader } from './shared/SectionHeader';
import { handleListKeyDown, navItemClass } from './shared/listNavigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';

interface ToolInfo {
  name: string;
  description: string;
}

async function fetchAvailableTools(): Promise<ToolInfo[]> {
  try {
    const res = await fetch('http://127.0.0.1:8888/config/tools');
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.parsed) return [];
    return Object.entries(data.parsed).map(([name, def]: [string, any]) => ({
      name,
      description: def.description || '',
    }));
  } catch {
    return [];
  }
}

/** 根据模型名 + token 预算，显示实际 API 参数映射 */
function getThinkingMapping(model: string | undefined, budget: number): string {
  if (!model) return '';
  const m = model.toLowerCase();
  if (m.includes('claude')) {
    return `Claude → budget_tokens: ${budget}`;
  }
  if (m.includes('deepseek')) {
    const level = budget >= 16000 ? 'max' : budget >= 4000 ? 'high' : 'low';
    return `DeepSeek → reasoning_effort: ${level}`;
  }
  if (m.includes('kimi') || m.includes('moonshot')) {
    return 'Kimi → thinking: enabled';
  }
  if (m.includes('glm')) {
    return 'GLM → thinking: enabled';
  }
  if (m.includes('gpt-5') || m.includes('o1') || m.includes('o3')) {
    const level = budget >= 8000 ? 'high' : 'medium';
    return `OpenAI → reasoning_effort: ${level}`;
  }
  if (m.includes('qwen')) {
    return 'Qwen → thinking: enabled';
  }
  return `→ ${budget >= 1000 ? (budget / 1000).toFixed(1) + 'K' : budget} tokens`;
}

type View = 'list' | 'settings' | 'tools' | 'skills';

interface CharacterPanelProps {
  characters: CharacterListItem[];
  currentCharacterId: string;
  onSwitchCharacter: (id: string) => void;
  onRefreshCharacters: () => void;
  onEditSystemPrompt?: (content: string, onSave: (newContent: string) => void) => void;
}

export default function CharacterPanel({
  characters,
  currentCharacterId,
  onSwitchCharacter,
  onRefreshCharacters,
  onEditSystemPrompt,
}: CharacterPanelProps) {
  const [view, setView] = useState<View>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState<CharacterFormData>({
    name: '', description: '', system_prompt: '', greeting: '',
    tools: [], tool_tips: {}, model: '', context_size: undefined,
    auto_compact: false, compact_threshold: 0.7,
    memory_enabled: true, memory_token_budget: 300, memory_auto_summarize: false,
    skills: [],
    accessible_knowledge: ['public'],
    thinking: { enabled: false, budget_tokens: 1024 },
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([]);
  const { models: availableModels, refresh: refreshModels, isLoading: modelsLoading } = useModels();
  const { skills: availableSkills } = useSkills();

  const updateForm = useCallback((patch: Partial<CharacterFormData>) => {
    setForm(prev => ({ ...prev, ...patch }));
  }, []);

  // ─── 数据加载 ───

  const loadDetail = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const d = await getCharacter(id);
      setForm({
        name: d.name,
        description: d.description ?? '',
        system_prompt: d.system_prompt ?? '',
        greeting: d.greeting ?? '',
        tools: d.tools ?? [],
        tool_tips: d.tool_tips ?? {},
        model: d.model ?? '',
        context_size: d.context_size ?? undefined,
        auto_compact: d.auto_compact ?? false,
        compact_threshold: d.compact_threshold ?? 0.7,
        memory_enabled: d.memory_enabled ?? true,
        memory_token_budget: d.memory_token_budget ?? 300,
        memory_auto_summarize: d.memory_auto_summarize ?? false,
        skills: d.skills ?? [],
        accessible_knowledge: d.accessible_knowledge ?? ['public'],
        thinking: d.thinking ?? { enabled: false, budget_tokens: 1024 },
      });
      if (d.avatar) {
        setAvatarPreview(getAvatarUrl(d.avatar));
      } else {
        setAvatarPreview(null);
      }
      setAvatarFile(null);
      if (availableTools.length === 0) fetchAvailableTools().then(setAvailableTools);
    } catch { /* ignore */ }
    setIsLoading(false);
  }, [availableTools.length]);

  const openSettings = useCallback((id: string) => {
    setEditingId(id);
    setAvatarFile(null);
    loadDetail(id);
    setView('settings');
  }, [loadDetail]);

  const openNewCharacter = useCallback(() => {
    setEditingId(null);
    setAvatarFile(null);
    setAvatarPreview(null);
    setForm({
      name: '', description: '', system_prompt: '', greeting: '',
      tools: [], tool_tips: {}, model: '', context_size: undefined,
      auto_compact: false, compact_threshold: 0.7,
      memory_enabled: true, memory_token_budget: 300, memory_auto_summarize: false,
      skills: [],
      accessible_knowledge: ['public'],
      thinking: { enabled: false, budget_tokens: 1024 },
    });
    if (availableTools.length === 0) fetchAvailableTools().then(setAvailableTools);
    setView('settings');
  }, [availableTools.length]);

  const handleAvatarChange = useCallback((file: File) => {
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (editingId) {
        await updateCharacter(editingId, { ...form, tool_tips: {} }, avatarFile || undefined);
      } else {
        const result = await createCharacter({ ...form, tool_tips: {} }, avatarFile || undefined);
        setEditingId(result.character.id);
      }
      onRefreshCharacters();
    } catch { /* ignore */ }
    setIsSaving(false);
  };

  // ─── 工具排序 ───

  const moveTool = useCallback((index: number, direction: -1 | 1) => {
    const tools = [...(form.tools || [])];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tools.length) return;
    [tools[index], tools[newIndex]] = [tools[newIndex], tools[index]];
    updateForm({ tools });
  }, [form.tools, updateForm]);

  const toggleTool = useCallback((name: string) => {
    const tools = form.tools || [];
    updateForm({
      tools: tools.includes(name)
        ? tools.filter(t => t !== name)
        : [...tools, name],
    });
  }, [form.tools, updateForm]);

  // ─── Level 3: 工具配置（含排序） ───

  if (view === 'tools') {
    const enabledSet = new Set(form.tools || []);
    const disabledTools = availableTools.filter(t => !enabledSet.has(t.name));

    return (
      <div className="flex flex-col h-full">
        <BackButton label="设置" onClick={() => setView('settings')} />
        <SectionHeader>工具配置</SectionHeader>
        <div className="px-3 pb-1">
          <span className="text-[10px] text-text-dim">
            排列顺序影响 AI 优先级。点击 ← → 调整顺序。
          </span>
        </div>
        <ScrollArea className="flex-1 px-3 pb-3">
          <div className="space-y-1.5 pr-1">
            {/* 已启用（可排序） */}
            {form.tools && form.tools.length > 0 && (
              <div className="space-y-1">
                {form.tools.map((name, idx) => {
                  const info = availableTools.find(t => t.name === name);
                  return (
                    <div key={name} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/15">
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => moveTool(idx, -1)}
                          disabled={idx === 0}
                          className="text-[9px] text-text-muted hover:text-text-primary disabled:opacity-20 cursor-pointer leading-none"
                        >▲</button>
                        <button
                          onClick={() => moveTool(idx, 1)}
                          disabled={idx === form.tools!.length - 1}
                          className="text-[9px] text-text-muted hover:text-text-primary disabled:opacity-20 cursor-pointer leading-none"
                        >▼</button>
                      </div>
                      <span className="font-mono text-xs text-primary flex-shrink-0">{name}</span>
                      <span className="text-[10px] text-text-muted truncate flex-1">{info?.description}</span>
                      <button onClick={() => toggleTool(name)}
                        className="text-[10px] text-text-muted hover:text-red-400 cursor-pointer flex-shrink-0">✕</button>
                    </div>
                  );
                })}
              </div>
            )}
            {/* 未启用 */}
            {disabledTools.length > 0 && (
              <div>
                {form.tools && form.tools.length > 0 && (
                  <span className="text-[10px] text-text-dim mb-1 block">未启用</span>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {disabledTools.map(tool => (
                    <button key={tool.name} onClick={() => toggleTool(tool.name)}
                      className="px-2 py-1 rounded text-[11px] font-mono text-text-muted
                        border border-border-subtle hover:text-text-primary hover:border-border-default
                        transition-colors cursor-pointer">
                      + {tool.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // ─── Level 3: 技能配置 ───

  if (view === 'skills') {
    const toggleSkill = (skillId: string) => {
      updateForm({
        skills: form.skills?.includes(skillId)
          ? form.skills.filter(s => s !== skillId)
          : [...(form.skills || []), skillId],
      });
    };

    return (
      <div className="flex flex-col h-full">
        <BackButton label="设置" onClick={() => setView('settings')} />
        <SectionHeader>技能配置</SectionHeader>
        <div className="px-3 pb-1">
          <span className="text-[10px] text-text-dim">定义 AI 的工作方式。</span>
        </div>
        <ScrollArea className="flex-1 px-3 pb-3">
          <div className="space-y-1.5 pr-1">
            {availableSkills.length === 0 ? (
              <div className="text-[11px] text-text-dim py-4 text-center">暂无可用技能</div>
            ) : availableSkills.map(skill => {
              const isActive = form.skills?.includes(skill.id) ?? false;
              return (
                <button
                  key={skill.id}
                  onClick={() => toggleSkill(skill.id)}
                  className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer border transition-colors text-left
                    ${isActive
                      ? 'border-primary/25 bg-primary/5'
                      : 'border-border-subtle bg-transparent hover:border-border-default'
                    }`}
                >
                  <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0
                    ${isActive ? 'border-primary bg-primary/20' : 'border-text-muted'}`}>
                    {isActive && <span className="text-primary text-[9px]">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs ${isActive ? 'text-primary' : 'text-text-secondary'}`}>{skill.name}</span>
                    {skill.description && (
                      <div className="text-[10px] text-text-muted truncate">{skill.description}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // ─── Level 2: 设置概览 ───

  if (view === 'settings') {
    const enabledToolCount = form.tools?.length ?? 0;
    const enabledSkillCount = form.skills?.length ?? 0;

    if (isLoading) {
      return (
        <div className="flex flex-col h-full">
          <BackButton label="角色列表" onClick={() => setView('list')} />
          <div className="flex-1 flex items-center justify-center text-xs text-text-muted">加载中...</div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <BackButton label="角色列表" onClick={() => setView('list')} />

        <ScrollArea className="flex-1 min-h-0">
          {/* 头像 + 名字 */}
          <div className="flex items-center gap-3 px-3 pb-3">
            <AvatarUpload
              preview={avatarPreview}
              fallback={form.name || '?'}
              size="lg"
              onChange={handleAvatarChange}
            />
            <Input
              type="text"
              value={form.name}
              onChange={e => updateForm({ name: e.target.value })}
              placeholder="角色名字"
              className="border-0 border-b border-border-subtle rounded-none bg-transparent
                focus:border-primary/40 focus-visible:ring-0 text-sm text-text-primary placeholder-[var(--color-text-dim)]"
            />
          </div>

          <Separator className="mx-3 my-2 bg-border-subtle" />

          {/* 基本信息 */}
          <div className="px-3 pt-3 space-y-2.5">
            <div>
              <Label className="text-[10px] text-text-muted uppercase tracking-wider mb-1">描述</Label>
              <Input
                value={form.description || ''}
                onChange={e => updateForm({ description: e.target.value })}
                placeholder="简短描述角色身份"
                className="mt-0.5 bg-surface-elevated border-border-default text-xs text-text-primary
                  placeholder-[var(--color-text-dim)] focus:border-primary/40 h-8"
              />
            </div>
            <div>
              <Label className="text-[10px] text-text-muted uppercase tracking-wider mb-1">开场白</Label>
              <Input
                value={form.greeting || ''}
                onChange={e => updateForm({ greeting: e.target.value })}
                placeholder="新会话时 AI 的第一句话"
                className="mt-0.5 bg-surface-elevated border-border-default text-xs text-text-primary
                  placeholder-[var(--color-text-dim)] focus:border-primary/40 h-8"
              />
            </div>
          </div>

          {/* 模型与上下文 */}
          <div className="px-3 pt-3 space-y-2.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-[10px] text-text-muted uppercase tracking-wider">模型</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-elevated"
                  onClick={refreshModels}
                  disabled={modelsLoading}
                  title="刷新模型列表"
                >
                  <RefreshCw className={`h-3 w-3 ${modelsLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <Select
                value={form.model || ''}
                onValueChange={v => updateForm({ model: v || undefined })}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full bg-surface-elevated border-border-default text-xs text-text-primary
                    focus:border-primary/40 h-8 data-placeholder:text-text-dim"
                >
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="">
                    <span className="text-text-muted">（全局默认）</span>
                  </SelectItem>
                  {availableModels.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="font-mono text-xs">{m.id}</span>
                      {m.owned_by && (
                        <span className="text-text-muted text-[10px] ml-1">{m.owned_by}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-text-muted uppercase tracking-wider mb-1">上下文大小</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={form.context_size ?? ''}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  updateForm({ context_size: v ? parseInt(v) : undefined });
                }}
                placeholder="默认 8192"
                className="mt-0.5 bg-surface-elevated border-border-default text-xs text-text-primary
                  placeholder-[var(--color-text-dim)] focus:border-primary/40 h-8"
              />
            </div>
          </div>

          {/* 思考链 */}
          <Separator className="mx-3 my-3 bg-border-subtle" />
          <div className="px-3 space-y-2.5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Label className="text-[10px] text-text-muted uppercase tracking-wider mb-1">思考链</Label>
                {form.thinking?.enabled && (
                  <div className="mt-1.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="range" min="256" max="32000" step="256"
                        value={form.thinking.budget_tokens}
                        onChange={e => updateForm({ thinking: { ...form.thinking!, budget_tokens: parseInt(e.target.value) } })}
                        className="flex-1 accent-primary h-1" />
                      <span className="text-[10px] text-text-secondary font-mono w-12 text-right tabular-nums">
                        {form.thinking.budget_tokens >= 1000
                          ? `${(form.thinking.budget_tokens / 1000).toFixed(1)}K`
                          : form.thinking.budget_tokens}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {[1024, 4096, 8192, 16384, 32000].map(n => {
                        const label = n >= 1000 ? `${n / 1000}K` : n;
                        let color = 'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10';
                        if (n >= 4096) color = 'text-primary border-primary/20 hover:bg-primary/10';
                        if (n >= 16384) color = 'text-red-400 border-red-500/20 hover:bg-red-500/10';
                        return (
                          <button key={n} onClick={() => updateForm({ thinking: { ...form.thinking!, budget_tokens: n } })}
                            className={`text-[9px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors
                              ${form.thinking?.budget_tokens === n ? 'bg-zinc-700/40' : 'bg-transparent'} ${color}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[9px] text-text-dim">
                      {form.thinking.budget_tokens < 1024 ? '快速思考（适合简单任务）'
                        : form.thinking.budget_tokens < 4096 ? '标准推理（适合日常对话）'
                        : form.thinking.budget_tokens < 16384 ? '深度推理（适合代码、逻辑）'
                        : '极限拆解（高消耗，慎用）'}
                    </span>
                    {form.model && (
                      <span className="text-[9px] text-text-muted font-mono">
                        → {getThinkingMapping(form.model, form.thinking.budget_tokens)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <ToggleSwitch
                checked={form.thinking?.enabled ?? false}
                onChange={() => updateForm({
                  thinking: { ...form.thinking!, enabled: !(form.thinking?.enabled ?? false), budget_tokens: form.thinking?.budget_tokens ?? 1024 }
                })}
              />
            </div>
          </div>

          {/* 开关 */}
          <div className="px-3 pt-3 space-y-2.5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Label className="text-xs text-text-secondary">自动压缩</Label>
                {form.auto_compact && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <input type="range" min="0.5" max="0.95" step="0.05"
                      value={form.compact_threshold || 0.7}
                      onChange={e => updateForm({ compact_threshold: parseFloat(e.target.value) })}
                      className="w-28 accent-primary" />
                    <span className="text-[10px] text-text-muted font-mono w-6 text-right">
                      {Math.round((form.compact_threshold || 0.7) * 100)}%
                    </span>
                  </div>
                )}
              </div>
              <ToggleSwitch
                checked={!!form.auto_compact}
                onChange={() => updateForm({ auto_compact: !form.auto_compact })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-text-secondary">记忆召回</Label>
              <ToggleSwitch
                checked={form.memory_enabled !== false}
                onChange={() => updateForm({ memory_enabled: !(form.memory_enabled === true) })}
              />
            </div>
            {form.memory_enabled !== false && (
              <div className="pl-2 space-y-1.5 border-l border-border-default">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-text-muted">Token 上限</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={form.memory_token_budget ?? ''}
                    onChange={e => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      updateForm({ memory_token_budget: v ? parseInt(v) : undefined });
                    }}
                    placeholder="300"
                    className="w-20 bg-surface-elevated border-border-default text-[11px] text-text-secondary
                      placeholder-[var(--color-text-dim)] focus:border-primary/40 h-6 px-2 text-right"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-text-muted">超预算总结</Label>
                  <ToggleSwitch
                    checked={!!form.memory_auto_summarize}
                    onChange={() => updateForm({ memory_auto_summarize: !form.memory_auto_summarize })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 知识库访问 */}
          <div className="px-3 pt-3 space-y-2.5">
            <Label className="text-[10px] text-text-muted uppercase tracking-wider">知识库访问</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-text-secondary">公共知识</Label>
                  <p className="text-[10px] text-text-dim">导入的文档、世界观、技术参考</p>
                </div>
                <ToggleSwitch
                  checked={form.accessible_knowledge?.includes('public') ?? true}
                  onChange={() => {
                    const has = form.accessible_knowledge?.includes('public') ?? true;
                    updateForm({
                      accessible_knowledge: has
                        ? (form.accessible_knowledge || []).filter(k => k !== 'public')
                        : [...(form.accessible_knowledge || []), 'public'],
                    });
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-text-secondary">共享记忆</Label>
                  <p className="text-[10px] text-text-dim">Agent 间共享的经历、偏好</p>
                </div>
                <ToggleSwitch
                  checked={form.accessible_knowledge?.includes('shared') ?? false}
                  onChange={() => {
                    const has = form.accessible_knowledge?.includes('shared') ?? false;
                    updateForm({
                      accessible_knowledge: has
                        ? (form.accessible_knowledge || []).filter(k => k !== 'shared')
                        : [...(form.accessible_knowledge || []), 'shared'],
                    });
                  }}
                />
              </div>
            </div>
          </div>

          {/* 区块入口 */}
          <div className="px-3 pt-3 pb-2 space-y-1">
            <Separator className="bg-border-subtle mb-2" />
            <button onClick={() => onEditSystemPrompt?.(form.system_prompt || '', (c) => updateForm({ system_prompt: c }))}
              className="w-full flex items-center justify-between px-2 py-2 rounded-lg text-left
                hover:bg-primary-subtle transition-colors cursor-pointer group">
              <div>
                <span className="text-xs text-text-primary group-hover:text-text-primary">系统提示词</span>
                {form.system_prompt && (
                  <div className="text-[10px] text-text-dim truncate max-w-[180px]">
                    {form.system_prompt.slice(0, 40)}...
                  </div>
                )}
              </div>
              <svg className="w-3 h-3 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button onClick={() => setView('tools')}
              className="w-full flex items-center justify-between px-2 py-2 rounded-lg text-left
                hover:bg-primary-subtle transition-colors cursor-pointer group">
              <span className="text-xs text-text-primary group-hover:text-text-primary">工具配置</span>
              <div className="flex items-center gap-1.5">
                {enabledToolCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary/60 border-0">
                    {enabledToolCount}
                  </Badge>
                )}
                <svg className="w-3 h-3 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
            <button onClick={() => setView('skills')}
              className="w-full flex items-center justify-between px-2 py-2 rounded-lg text-left
                hover:bg-primary-subtle transition-colors cursor-pointer group">
              <span className="text-xs text-text-primary group-hover:text-text-primary">技能配置</span>
              <div className="flex items-center gap-1.5">
                {enabledSkillCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary/60 border-0">
                    {enabledSkillCount}
                  </Badge>
                )}
                <svg className="w-3 h-3 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </div>
        </ScrollArea>

        {/* 保存 */}
        <div className="border-t border-border-default px-3 py-2.5">
          <Button
            onClick={handleSave}
            disabled={isSaving || !form.name.trim()}
            className="w-full bg-primary/20 text-primary hover:bg-primary/30
              disabled:opacity-50 text-xs"
          >
            {isSaving ? '保存中...' : editingId ? '保存修改' : '创建角色'}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Level 1: 角色列表 ───

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[10px] text-text-muted font-medium tracking-wider uppercase">Characters</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={openNewCharacter}
          className="text-text-muted hover:text-text-primary"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="pr-1" onKeyDown={handleListKeyDown}>
          {characters.map(char => {
            const isActive = char.id === currentCharacterId;
            return (
              <div
                key={char.id}
                data-nav-item
                tabIndex={0}
                onClick={() => onSwitchCharacter(char.id)}
                onDoubleClick={() => openSettings(char.id)}
                onKeyDown={e => { if (e.key === 'Enter') onSwitchCharacter(char.id); }}
                className={`group flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg cursor-pointer
                  transition-colors duration-100 ${navItemClass}
                  ${isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-primary-subtle'
                  }`}
              >
                {char.avatar ? (
                  <img src={getAvatarUrl(char.avatar)!} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] text-primary">{(char.display_name || char.name)[0]}</span>
                  </div>
                )}
                <span className="text-xs truncate flex-1">{char.display_name || char.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); openSettings(char.id); }}
                  className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0
                    text-text-dim hover:text-text-secondary opacity-0 group-hover:opacity-100
                    transition-opacity duration-150 cursor-pointer"
                  title="设置"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
