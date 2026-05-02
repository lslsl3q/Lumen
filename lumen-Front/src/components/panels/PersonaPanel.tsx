/**
 * PersonaPanel — 身份面板（两级导航 + shadcn）
 *
 * Level 1: Persona 列表（选择 / 双击编辑 / 新建）
 * Level 2: 设置编辑（名称、描述、traits）
 *
 * 对齐 CharacterPanel 的交互模式：
 * - 双击打开编辑
 * - 悬浮齿轮按钮
 * - 内联编辑（无"管理"按钮）
 */
import { useState, useCallback } from 'react';
import { PersonaListItem } from '../../types/persona';
import * as api from '../../api/persona';
import { BackButton } from './shared/BackButton';
import { AvatarUpload } from './shared/AvatarUpload';
import { handleListKeyDown, navItemClass } from './shared/listNavigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';

type View = 'list' | 'settings';

interface PersonaPanelProps {
  personas: PersonaListItem[];
  activePersonaId: string | null;
  onSwitchPersona: (personaId: string | null) => void;
  onRefreshPersonas: () => void;
}

interface PersonaForm {
  name: string;
  description: string;
  traits: string[];
}

export default function PersonaPanel({
  personas,
  activePersonaId,
  onSwitchPersona,
  onRefreshPersonas,
}: PersonaPanelProps) {
  const [view, setView] = useState<View>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState<PersonaForm>({
    name: '', description: '', traits: [],
  });
  const [traitInput, setTraitInput] = useState('');

  const updateForm = useCallback((patch: Partial<PersonaForm>) => {
    setForm(prev => ({ ...prev, ...patch }));
  }, []);

  // ─── 数据加载 ───

  const loadDetail = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const d = await api.getPersona(id);
      setForm({
        name: d.name || '',
        description: d.description || '',
        traits: d.traits || [],
      });
    } catch { /* ignore */ }
    setIsLoading(false);
  }, []);

  const openSettings = useCallback((id: string) => {
    setEditingId(id);
    loadDetail(id);
    setView('settings');
  }, [loadDetail]);

  const openNewPersona = useCallback(() => {
    setEditingId(null);
    setForm({ name: '', description: '', traits: [] });
    setTraitInput('');
    setView('settings');
  }, []);

  // ─── Traits 管理 ───

  const addTrait = useCallback(() => {
    const t = traitInput.trim();
    if (t && !form.traits.includes(t)) {
      updateForm({ traits: [...form.traits, t] });
    }
    setTraitInput('');
  }, [traitInput, form.traits, updateForm]);

  const removeTrait = useCallback((trait: string) => {
    updateForm({ traits: form.traits.filter(t => t !== trait) });
  }, [form.traits, updateForm]);

  // ─── 保存 ───

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      if (editingId) {
        await api.updatePersona(editingId, {
          name: form.name,
          description: form.description || undefined,
          traits: form.traits.length > 0 ? form.traits : undefined,
        });
      } else {
        // 生成 ID：小写 + 下划线
        const id = form.name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '_').slice(0, 20);
        await api.createPersona({
          id: id || `persona_${Date.now()}`,
          name: form.name,
          description: form.description || undefined,
          traits: form.traits.length > 0 ? form.traits : undefined,
        });
      }
      onRefreshPersonas();
    } catch { /* ignore */ }
    setIsSaving(false);
    setView('list');
  };

  // ─── Level 2: 设置编辑 ───

  if (view === 'settings') {
    if (isLoading) {
      return (
        <div className="flex flex-col h-full">
          <BackButton label="Persona 列表" onClick={() => setView('list')} />
          <div className="flex-1 flex items-center justify-center text-xs text-slate-600">加载中...</div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <BackButton label="Persona 列表" onClick={() => setView('list')} />

        <ScrollArea className="flex-1">
          {/* 头像 + 名字 */}
          <div className="flex items-center gap-3 px-3 pb-3">
            <AvatarUpload
              preview={null}
              fallback={form.name || '?'}
              size="lg"
              onChange={() => {}}
            />
            <Input
              value={form.name}
              onChange={e => updateForm({ name: e.target.value })}
              placeholder="Persona 名字"
              className="border-0 border-b border-slate-700/40 rounded-none bg-transparent
                focus:border-amber-500/40 focus-visible:ring-0 text-sm text-slate-200 placeholder-slate-700"
            />
          </div>

          <Separator className="mx-3 bg-slate-800/40" />

          {/* 描述 */}
          <div className="px-3 pt-3 space-y-2.5">
            <div>
              <Label className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">描述</Label>
              <Input
                value={form.description}
                onChange={e => updateForm({ description: e.target.value })}
                placeholder="描述这个身份的特点..."
                className="mt-0.5 bg-slate-900/60 border-slate-700/60 text-xs text-slate-300
                  placeholder-slate-700 focus:border-amber-500/40 h-8"
              />
            </div>
          </div>

          {/* Traits */}
          <div className="px-3 pt-3 space-y-2">
            <Label className="text-[10px] text-slate-600 uppercase tracking-wider">特质标签</Label>
            <div className="flex flex-wrap gap-1.5">
              {form.traits.map(trait => (
                <Badge
                  key={trait}
                  variant="secondary"
                  className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[11px] pr-1 cursor-pointer hover:bg-amber-500/20"
                  onClick={() => removeTrait(trait)}
                >
                  {trait}
                  <span className="ml-1 text-amber-500/50 hover:text-red-400">✕</span>
                </Badge>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input
                value={traitInput}
                onChange={e => setTraitInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTrait(); } }}
                placeholder="添加特质..."
                className="flex-1 bg-slate-900/60 border-slate-700/60 text-xs text-slate-300
                  placeholder-slate-700 focus:border-amber-500/40 h-7"
              />
              <Button
                variant="ghost"
                size="xs"
                onClick={addTrait}
                disabled={!traitInput.trim()}
                className="text-slate-500 hover:text-slate-300"
              >
                +
              </Button>
            </div>
          </div>
        </ScrollArea>

        {/* 保存 */}
        <div className="border-t border-slate-800/40 px-3 py-2.5">
          <Button
            onClick={handleSave}
            disabled={isSaving || !form.name.trim()}
            className="w-full bg-amber-500/20 text-amber-400 hover:bg-amber-500/30
              disabled:opacity-50 text-xs"
          >
            {isSaving ? '保存中...' : editingId ? '保存修改' : '创建 Persona'}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Level 1: Persona 列表 ───

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[10px] text-slate-600 font-medium tracking-wider uppercase">Personas</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={openNewPersona}
          className="text-slate-500 hover:text-slate-300"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="pr-1" onKeyDown={handleListKeyDown}>
          {/* "不使用" 选项 */}
          <button
            data-nav-item
            tabIndex={0}
            onClick={() => onSwitchPersona(null)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg text-left cursor-pointer
              transition-colors duration-100 ${navItemClass}
              ${activePersonaId === null
                ? 'bg-amber-500/10 text-amber-300'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
              }`}
          >
            <div className="w-6 h-6 rounded-full bg-slate-800 flex-shrink-0 flex items-center justify-center">
              <span className="text-[9px] text-slate-500">—</span>
            </div>
            <span className="text-xs">不使用</span>
          </button>

          {/* Persona 列表 */}
          {personas.map(p => {
            const isActive = p.id === activePersonaId;
            return (
              <div
                key={p.id}
                data-nav-item
                tabIndex={0}
                onClick={() => onSwitchPersona(p.id)}
                onDoubleClick={() => openSettings(p.id)}
                onKeyDown={e => { if (e.key === 'Enter') onSwitchPersona(p.id); }}
                className={`group flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg cursor-pointer
                  transition-colors duration-100 ${navItemClass}
                  ${isActive
                    ? 'bg-amber-500/10 text-amber-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                  }`}
              >
                <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] text-amber-400">{p.name[0]}</span>
                </div>
                <span className="text-xs truncate flex-1">{p.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); openSettings(p.id); }}
                  className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0
                    text-slate-700 hover:text-slate-400 opacity-0 group-hover:opacity-100
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
