// @ts-nocheck — AI 功能旧组件，NC 研究后重写
/**
 * WritingSidePanel — 左侧浮动面板
 *
 * 所有面板浮动在编辑器上方（absolute 定位）。
 * 每个设定类别（人物/地点/世界/物品）有专属编辑器。
 * 数据存储在 content JSON 字段中。
 */
import { useEffect, useState } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import { getExportUrl } from "../../api/writing";
import type { CodexEntry } from "../../api/writing";
import { Plus, Trash2, X, Download, Edit3, FileText, ChevronDown, ChevronRight } from "lucide-react";

type WritingPanelType = "chapters" | "snapshots" | "chat" | "project" | "characters" | "locations" | "world" | "items" | "outline" | "export";

interface WritingSidePanelProps {
  panel: WritingPanelType;
  onClose: () => void;
}

const PANEL_TITLES: Record<string, string> = {
  chapters: "章节列表",
  project: "作品管理",
  characters: "人物设定",
  locations: "地点设定",
  world: "世界设定",
  items: "物品设定",
  outline: "大纲",
  export: "导出",
};

export function WritingSidePanel({ panel, onClose }: WritingSidePanelProps) {
  if (!panel) return null;

  const isChapters = panel === "chapters";

  return (
    <div className={`z-20 bg-surface-panel flex flex-col
      ${isChapters
        ? "absolute left-12 top-0 bottom-0 w-[260px] border-r border-border-default"
        : "absolute left-16 top-4 bottom-4 w-[300px] rounded-xl border border-border-default shadow-2xl shadow-black/50"
      }`}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default flex-shrink-0">
        <span className="text-[12px] font-medium text-text-primary">{PANEL_TITLES[panel] ?? panel}</span>
        <button onClick={onClose} className="p-1 rounded text-text-muted hover:text-text-secondary cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-lumen">
        {panel === "chapters" && <ChaptersPanel />}
        {panel === "project" && <ProjectManagementPanel />}
        {panel === "characters" && <CategoryPanel category="character" label="角色" icon="👤" fieldConfig={CHARACTER_FIELDS} />}
        {panel === "locations" && <CategoryPanel category="location" label="地点" icon="📍" fieldConfig={LOCATION_FIELDS} />}
        {panel === "world" && <CategoryPanel category="world" label="世界" icon="🌍" fieldConfig={WORLD_FIELDS} />}
        {panel === "items" && <CategoryPanel category="object" label="物品" icon="📦" fieldConfig={ITEM_FIELDS} />}
        {panel === "outline" && <OutlinePanel />}
        {panel === "export" && <ExportPanel />}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   通用组件
   ══════════════════════════════════════ */

/** 通用标签选择器 */
function ChipSelect({ options, value, onChange }: {
  options: { value: string; label: string; color?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer border
            ${value === opt.value
              ? `border-primary/30 ${opt.color ?? "bg-primary/10 text-primary"}`
              : "border-border-default text-text-muted hover:text-text-primary hover:border-slate-600"
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** 通用文本域（失焦保存） */
function FieldTextarea({ label, value, placeholder, rows = 3, onUpdate }: {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  onUpdate: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-text-muted uppercase tracking-wider">{label}</label>
      <textarea
        defaultValue={value}
        onBlur={(e) => { if (e.target.value !== value) onUpdate(e.target.value); }}
        placeholder={placeholder}
        rows={rows}
        className="w-full mt-1 bg-surface-elevated border border-border-default rounded px-2 py-1.5 text-[12px] text-text-primary placeholder-[var(--color-text-dim)] outline-none focus:border-primary/30 resize-y leading-relaxed"
      />
    </div>
  );
}

/** 通用单行输入（失焦保存） */
function FieldInput({ label, value, placeholder, onUpdate }: {
  label: string;
  value: string;
  placeholder?: string;
  onUpdate: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-text-muted uppercase tracking-wider">{label}</label>
      <input
        defaultValue={value}
        onBlur={(e) => { if (e.target.value !== value) onUpdate(e.target.value); }}
        placeholder={placeholder}
        className="w-full mt-1 bg-surface-elevated border border-border-default rounded px-2 py-1 text-[12px] text-text-primary outline-none focus:border-primary/30"
      />
    </div>
  );
}

/* ══════════════════════════════════════
   字段配置
   ══════════════════════════════════════ */

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder?: string;
  rows?: number;
  options?: { value: string; label: string; color?: string }[];
}

const CHARACTER_FIELDS: FieldDef[] = [
  {
    key: "role", label: "角色定位", type: "select",
    options: [
      { value: "protagonist", label: "主角", color: "bg-primary/15 text-primary" },
      { value: "antagonist", label: "反派", color: "bg-red-400/15 text-red-300" },
      { value: "supporting", label: "配角", color: "bg-blue-400/15 text-blue-300" },
      { value: "minor", label: "龙套", color: "bg-slate-400/10 text-text-primary" },
    ],
  },
  { key: "gender", label: "性别", type: "text", placeholder: "如：男/女/未知" },
  { key: "age", label: "年龄", type: "text", placeholder: "如：25岁 / 不明" },
  { key: "appearance", label: "外貌", type: "textarea", placeholder: "描述角色的外貌特征…", rows: 3 },
  { key: "personality", label: "性格", type: "textarea", placeholder: "描述角色的性格特点…", rows: 3 },
  { key: "background", label: "背景", type: "textarea", placeholder: "角色的身世和经历…", rows: 4 },
  { key: "abilities", label: "能力", type: "textarea", placeholder: "角色的特殊能力或技能…", rows: 3 },
  { key: "text", label: "备注", type: "textarea", placeholder: "其他补充信息…", rows: 3 },
];

const LOCATION_FIELDS: FieldDef[] = [
  {
    key: "loc_type", label: "类型", type: "select",
    options: [
      { value: "city", label: "城市" },
      { value: "building", label: "建筑" },
      { value: "natural", label: "自然" },
      { value: "indoor", label: "室内" },
      { value: "other", label: "其他" },
    ],
  },
  { key: "environment", label: "环境", type: "textarea", placeholder: "气候、氛围、环境特征…", rows: 3 },
  { key: "features", label: "特色", type: "textarea", placeholder: "值得注意的地点特色…", rows: 3 },
  { key: "connections", label: "关联地点", type: "text", placeholder: "相邻或相关的地点" },
  { key: "text", label: "详细描述", type: "textarea", placeholder: "地点的详细描述…", rows: 4 },
];

const WORLD_FIELDS: FieldDef[] = [
  {
    key: "sub_type", label: "分类", type: "select",
    options: [
      { value: "magic", label: "魔法体系" },
      { value: "physics", label: "物理规则" },
      { value: "history", label: "历史" },
      { value: "culture", label: "文化" },
      { value: "economy", label: "经济" },
      { value: "religion", label: "宗教" },
      { value: "tech", label: "科技" },
    ],
  },
  { key: "rules", label: "规则", type: "textarea", placeholder: "这个世界设定的核心规则…", rows: 3 },
  { key: "geography", label: "地理", type: "textarea", placeholder: "相关的地理信息…", rows: 3 },
  { key: "history", label: "历史", type: "textarea", placeholder: "相关历史事件和时间线…", rows: 4 },
  { key: "text", label: "详细描述", type: "textarea", placeholder: "详细的世界观描述…", rows: 4 },
];

const ITEM_FIELDS: FieldDef[] = [
  {
    key: "rarity", label: "稀有度", type: "select",
    options: [
      { value: "common", label: "普通", color: "bg-slate-400/10 text-text-primary" },
      { value: "uncommon", label: "稀有", color: "bg-green-400/15 text-green-300" },
      { value: "rare", label: "史诗", color: "bg-purple-400/15 text-purple-300" },
      { value: "legendary", label: "传说", color: "bg-primary/15 text-primary" },
    ],
  },
  {
    key: "item_type", label: "类型", type: "select",
    options: [
      { value: "weapon", label: "武器" },
      { value: "tool", label: "道具" },
      { value: "treasure", label: "宝物" },
      { value: "key", label: "关键物品" },
      { value: "consumable", label: "消耗品" },
    ],
  },
  { key: "properties", label: "属性", type: "textarea", placeholder: "物品的特殊属性和效果…", rows: 3 },
  { key: "owner", label: "持有者", type: "text", placeholder: "当前持有该物品的角色" },
  { key: "text", label: "描述", type: "textarea", placeholder: "物品的详细描述和来历…", rows: 4 },
];

/* ── AI 上下文追踪模式（所有类别共用）── */

const TRACKING_OPTIONS = [
  { value: "always",      label: "始终注入", color: "bg-primary/15 text-primary" },
  { value: "detected",    label: "自动检测", color: "bg-blue-400/15 text-blue-300" },
  { value: "anti_spoiler", label: "防剧透",   color: "bg-amber-400/15 text-amber-300" },
];


/* ══════════════════════════════════════
   通用设定面板（带类别专属编辑器）
   ══════════════════════════════════════ */

function CategoryPanel({ category, label, icon, fieldConfig }: {
  category: string;
  label: string;
  icon: string;
  fieldConfig: FieldDef[];
}) {
  const { settings, activeProjectId, loadCodex, createCodexEntry, updateCodexEntry, deleteCodexEntry } = useWritingStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [pendingEditName, setPendingEditName] = useState("");

  useEffect(() => {
    if (activeProjectId) loadCodex(activeProjectId);
  }, [activeProjectId]);

  const filtered = settings.filter((s) => s.type === category);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}列表</span>
        <button
          onClick={async () => {
            if (!activeProjectId) return;
            try {
              const ns = await createCodexEntry("新" + label, category);
              setPendingEditId(ns.id);
              setPendingEditName("新" + label);
            } catch {}
          }}
          className="p-0.5 rounded text-text-muted hover:text-text-primary cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {!activeProjectId && (
        <p className="text-[11px] text-text-muted italic py-2">请先选择一个作品</p>
      )}

      {filtered.length === 0 && activeProjectId && (
        <p className="text-[11px] text-text-muted italic py-2">暂无{label}，点击 + 创建</p>
      )}

      <div className="space-y-0.5">
        {filtered.map((s) => {
          const isExpanded = expandedId === s.id;
          return (
            <SettingItem
              key={s.id}
              setting={s}
              icon={icon}
              fieldConfig={fieldConfig}
              isExpanded={isExpanded}
              onToggle={() => setExpandedId(isExpanded ? null : s.id)}
              onUpdate={updateCodexEntry}
              onDelete={async () => {
                await deleteCodexEntry(s.id);
              }}
              pendingEdit={pendingEditId === s.id}
              pendingEditName={pendingEditName}
              onPendingEditNameChange={setPendingEditName}
              onPendingEditConfirm={async (name) => {
                if (name) { try { await updateCodexEntry(s.id, { name }); } catch {} }
                setPendingEditId(null);
              }}
              onPendingEditCancel={() => setPendingEditId(null)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** 单个设定项（列表行 + 展开编辑器） */
function SettingItem({ setting, icon, fieldConfig, isExpanded, onToggle, onUpdate, onDelete,
  pendingEdit, pendingEditName, onPendingEditNameChange, onPendingEditConfirm, onPendingEditCancel }: {
  setting: CodexEntry;
  icon: string;
  fieldConfig: FieldDef[];
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, data: Partial<CodexEntry>) => Promise<void>;
  onDelete: () => Promise<void>;
  pendingEdit?: boolean;
  pendingEditName?: string;
  onPendingEditNameChange?: (v: string) => void;
  onPendingEditConfirm?: (name: string) => void;
  onPendingEditCancel?: () => void;
}) {
  const content = (setting.description as Record<string, string>) ?? {};

  // 从字段配置推导显示标签（如角色类型、稀有度等）
  const badgeFields = fieldConfig.filter((f) => f.type === "select");
  const badge = badgeFields.length > 0
    ? badgeFields[0].options?.find((o) => o.value === content[badgeFields[0].key])?.label
    : null;

  return (
    <div className="rounded-md overflow-hidden">
      {/* 列表行 */}
      <div
        onClick={onToggle}
        className="flex items-center gap-2 px-2.5 py-2 text-[13px] text-text-secondary hover:bg-surface-elevated cursor-pointer transition-colors group"
      >
        <span className="text-sm">{icon}</span>
        {isExpanded ? <ChevronDown className="w-3 h-3 text-text-muted" /> : <ChevronRight className="w-3 h-3 text-text-muted" />}
        {pendingEdit ? (
          <input
            autoFocus
            value={pendingEditName ?? ""}
            onChange={(e) => onPendingEditNameChange?.(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.preventDefault(); onPendingEditConfirm?.(pendingEditName?.trim() ?? ""); }
              else if (e.key === "Escape") { e.preventDefault(); onPendingEditCancel?.(); }
            }}
            onBlur={() => onPendingEditCancel?.()}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-surface-elevated border border-primary/30 rounded px-2 py-0 text-[13px] text-text-primary outline-none min-w-0"
          />
        ) : (
          <span className="truncate flex-1">{setting.name}</span>
        )}
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated text-text-muted flex-shrink-0">
            {badge}
          </span>
        )}
        <button
          onClick={async (e) => { e.stopPropagation(); await onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 cursor-pointer"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* 展开编辑器 */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 bg-surface-deep">
          {/* 名称 */}
          <FieldInput
            label="名称"
            value={setting.name}
            onUpdate={async (v) => { if (v.trim()) await onUpdate(setting.id, { name: v }); }}
          />

          {/* AI 上下文控制 */}
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider">AI 上下文</label>
            <div className="mt-1 flex items-center gap-2">
              <ChipSelect
                options={TRACKING_OPTIONS}
                value={content._tracking ?? "detected"}
                onChange={async (v) => {
                  await onUpdate(setting.id, {
                    description: { ...content, _tracking: v },
                  } as any);
                }}
              />
              <button
                onClick={async () => {
                  await onUpdate(setting.id, { enabled: setting.enabled ? 0 : 1 });
                }}
                className={`ml-auto text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer
                  ${setting.enabled
                    ? "border-green-500/30 text-green-400 bg-green-500/10"
                    : "border-border-default text-text-muted line-through"
                  }`}
              >
                {setting.enabled ? "启用" : "禁用"}
              </button>
            </div>
          </div>

          {/* 类别专属字段 */}
          {fieldConfig.map((field) => {
            if (field.type === "select" && field.options) {
              return (
                <div key={field.key}>
                  <label className="text-[10px] text-text-muted uppercase tracking-wider">{field.label}</label>
                  <div className="mt-1">
                    <ChipSelect
                      options={field.options}
                      value={content[field.key] ?? ""}
                      onChange={async (v) => {
                        await onUpdate(setting.id, {
                          description: { ...content, [field.key]: v },
                        } as any);
                      }}
                    />
                  </div>
                </div>
              );
            }
            if (field.type === "textarea") {
              return (
                <FieldTextarea
                  key={field.key}
                  label={field.label}
                  value={content[field.key] ?? ""}
                  placeholder={field.placeholder}
                  rows={field.rows ?? 3}
                  onUpdate={async (v) => {
                    await onUpdate(setting.id, {
                      description: { ...content, [field.key]: v },
                    } as any);
                  }}
                />
              );
            }
            return (
              <FieldInput
                key={field.key}
                label={field.label}
                value={content[field.key] ?? ""}
                placeholder={field.placeholder}
                onUpdate={async (v) => {
                  await onUpdate(setting.id, {
                    description: { ...content, [field.key]: v },
                  } as any);
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   章节面板
   ══════════════════════════════════════ */

function ChaptersPanel() {
  const {
    projects, activeProjectId, chapters, activeChapterId,
    loadProjects,
    createChapter, renameChapter, deleteChapter, reorderChapters, setActiveChapter,
  } = useWritingStore();

  const [dragId, setDragId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => { loadProjects(); }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div className="p-3 space-y-3">
      {activeProject && (
        <div className="px-2.5 py-1.5 rounded-md bg-primary/5 border border-primary/10">
          <p className="text-[11px] text-primary/70 truncate">
            <FileText className="inline w-3 h-3 mr-1 -mt-0.5" />
            {activeProject.name}
          </p>
        </div>
      )}

      {!activeProject && (
        <p className="text-[11px] text-text-muted italic px-2">
          请先在「作品管理」中创建或选择作品
        </p>
      )}

      {activeProject && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">章节</span>
            <button
              onClick={() => createChapter("新章节")}
              className="p-0.5 rounded text-text-muted hover:text-text-primary cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {chapters.length === 0 && (
              <p className="text-[11px] text-text-muted italic px-1 py-2">点击 + 创建第一章</p>
            )}
            {chapters.map((ch, idx) => (
              <div
                key={ch.id}
                draggable
                onClick={() => setActiveChapter(ch.id)}
                onDoubleClick={() => { setEditingId(ch.id); setEditTitle(ch.title); }}
                onDragStart={() => setDragId(ch.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!dragId || dragId === ch.id) return;
                  const ordered = chapters.map((c) => c.id);
                  const from = ordered.indexOf(dragId);
                  const to = ordered.indexOf(ch.id);
                  if (from !== -1 && to !== -1) {
                    ordered.splice(from, 1);
                    ordered.splice(to, 0, dragId);
                    reorderChapters(ordered);
                  }
                  setDragId(null);
                }}
                className={`flex items-center justify-between px-2.5 py-2 rounded-md text-[13px] cursor-pointer group transition-colors
                  ${ch.id === activeChapterId ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-surface-elevated"}
                  ${dragId === ch.id ? "opacity-50" : ""}`}
              >
                {editingId === ch.id ? (
                  <input
                    autoFocus value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={async (e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const title = editTitle.trim();
                        try { if (title) await renameChapter(ch.id, title); } catch {}
                        setEditingId(null);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditingId(null);
                      }
                    }}
                    onBlur={() => setEditingId(null)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-surface-elevated border border-primary/30 rounded px-2 py-0 text-[13px] text-text-primary outline-none"
                  />
                ) : (
                  <span className="truncate flex-1">
                    <span className="text-text-muted mr-1 text-[11px]">{idx + 1}.</span>
                    {ch.title}
                  </span>
                )}
                <span className="text-[10px] text-text-muted mr-1">{ch.word_count ?? 0}字</span>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm("删除此章节？")) return;
                    await deleteChapter(ch.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   作品管理面板
   ══════════════════════════════════════ */

function ProjectManagementPanel() {
  const {
    projects, activeProjectId,
    loadProjects, createProject, deleteProject, setActiveProject, updateProject,
  } = useWritingStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => { loadProjects(); }, []);

  return (
    <div className="p-3 space-y-3">
      <button
        onClick={async () => {
          try {
            const project = await createProject("新作品");
            setEditingId(project.id);
            setEditName("新作品");
          } catch {}
        }}
        className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md bg-primary/10 text-primary hover:bg-primary/15 cursor-pointer transition-colors text-[13px]"
      >
        <Plus className="w-4 h-4" />
        新建作品
      </button>

      {projects.length === 0 && (
        <p className="text-[11px] text-text-muted italic px-1 py-2">暂无作品</p>
      )}

      <div className="space-y-1">
        {projects.map((p) => {
          const isActive = p.id === activeProjectId;
          const isEditing = editingId === p.id;
          return (
            <div
              key={p.id}
              className={`rounded-md overflow-hidden transition-colors
                ${isActive ? "bg-primary/5 border border-primary/10" : "border border-transparent"}`}
            >
              <div
                onClick={() => setActiveProject(p.id)}
                className="flex items-center justify-between px-3 py-2.5 cursor-pointer group"
              >
                {isEditing ? (
                  <input
                    autoFocus value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && editName.trim()) {
                        await updateProject(p.id, { name: editName.trim() });
                        setEditingId(null);
                      } else if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => setEditingId(null)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-surface-elevated border border-primary/30 rounded px-2 py-0.5 text-[13px] text-text-primary outline-none"
                  />
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] truncate ${isActive ? "text-primary" : "text-text-primary"}`}>
                        {p.name}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {new Date(p.created_at * 1000).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(p.id); setEditName(p.name); }}
                        className="p-1 rounded text-text-muted hover:text-text-primary cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`删除「${p.name}」及其所有章节和设定？`)) return;
                          await deleteProject(p.id);
                        }}
                        className="p-1 rounded text-text-muted hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 当前作品详细信息 */}
      {activeProjectId && (() => {
        const proj = projects.find((p) => p.id === activeProjectId);
        if (!proj) return null;
        const chapterCount = useWritingStore.getState().chapters.length;
        const totalWords = useWritingStore.getState().chapters.reduce((sum, c) => sum + (c.word_count ?? 0), 0);
        return (
          <div className="mt-2 pt-3 border-t border-border-default">
            <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">作品信息</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="px-2.5 py-2 rounded-md bg-surface-elevated">
                <p className="text-[10px] text-text-muted">章节</p>
                <p className="text-[14px] text-text-primary">{chapterCount}</p>
              </div>
              <div className="px-2.5 py-2 rounded-md bg-surface-elevated">
                <p className="text-[10px] text-text-muted">总字数</p>
                <p className="text-[14px] text-text-primary">{totalWords.toLocaleString()}</p>
              </div>
            </div>
            {proj.description && (
              <div className="mt-2">
                <label className="text-[10px] text-text-muted uppercase">简介</label>
                <p className="text-[12px] text-text-secondary mt-0.5">{proj.description}</p>
              </div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-muted uppercase">创建</label>
                <p className="text-[11px] text-text-secondary mt-0.5">{new Date(proj.created_at * 1000).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-[10px] text-text-muted uppercase">更新</label>
                <p className="text-[11px] text-text-secondary mt-0.5">{new Date(proj.updated_at * 1000).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ══════════════════════════════════════
   大纲面板（增强版）
   ══════════════════════════════════════ */

function OutlinePanel() {
  const { chapters, activeChapterId, setActiveChapter, settings, activeProjectId, loadCodex, createCodexEntry, updateCodexEntry } = useWritingStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (activeProjectId) loadCodex(activeProjectId);
  }, [activeProjectId]);

  const outlineSettings = settings.filter((s) => s.type === "outline");

  const getOutlineContent = (chapterId: string) => {
    const s = outlineSettings.find((o) => o.name === chapterId);
    return (s?.content as Record<string, string>)?.text ?? "";
  };

  const getOrCreateOutlineSetting = async (chapterId: string) => {
    let s = outlineSettings.find((o) => o.name === chapterId);
    if (!s && activeProjectId) {
      await createCodexEntry(chapterId, "outline");
      await loadCodex(activeProjectId);
      s = useWritingStore.getState().codexEntries.find((o) => o.name === chapterId && o.category === "outline");
    }
    return s;
  };

  const totalWords = chapters.reduce((sum, c) => sum + (c.word_count ?? 0), 0);

  return (
    <div className="p-3">
      {/* 概览 */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="px-2.5 py-2 rounded-md bg-surface-elevated">
          <p className="text-[10px] text-text-muted">总章节</p>
          <p className="text-[14px] text-text-primary">{chapters.length}</p>
        </div>
        <div className="px-2.5 py-2 rounded-md bg-surface-elevated">
          <p className="text-[10px] text-text-muted">总字数</p>
          <p className="text-[14px] text-text-primary">{totalWords.toLocaleString()}</p>
        </div>
      </div>

      <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">章节大纲</p>
      {chapters.length === 0 && (
        <p className="text-[11px] text-text-muted italic">暂无章节</p>
      )}
      <div className="space-y-0.5">
        {chapters.map((ch, idx) => {
          const isExpanded = expandedId === ch.id;
          const outlineText = getOutlineContent(ch.id);
          return (
            <div key={ch.id} className="rounded-md overflow-hidden">
              <div
                onClick={() => {
                  setExpandedId(isExpanded ? null : ch.id);
                  setActiveChapter(ch.id);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-2 text-[13px] cursor-pointer transition-colors group
                  ${ch.id === activeChapterId ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-surface-elevated"}`}
              >
                {isExpanded ? <ChevronDown className="w-3 h-3 text-text-muted" /> : <ChevronRight className="w-3 h-3 text-text-muted" />}
                <span className="text-text-muted text-[11px]">{idx + 1}.</span>
                <span className="truncate flex-1">{ch.title}</span>
                <span className="text-[10px] text-text-muted">{ch.word_count ?? 0}字</span>
              </div>
              {isExpanded && (
                <div className="px-3 pb-2 pt-1 bg-surface-deep">
                  <textarea
                    defaultValue={outlineText}
                    onBlur={async (e) => {
                      const s = await getOrCreateOutlineSetting(ch.id);
                      if (s) {
                        await updateCodexEntry(s.id, { content: { text: e.target.value } } as any);
                      }
                    }}
                    placeholder={`${ch.title} 的大纲备注…`}
                    rows={4}
                    className="w-full bg-surface-elevated border border-border-default rounded px-2 py-1.5 text-[12px] text-text-primary placeholder-[var(--color-text-dim)] outline-none focus:border-primary/30 resize-y leading-relaxed"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   导出面板
   ══════════════════════════════════════ */

function ExportPanel() {
  const { activeProjectId, projects } = useWritingStore();
  const project = projects.find((p) => p.id === activeProjectId);

  if (!activeProjectId || !project) {
    return <p className="text-[12px] text-text-muted p-4">请先选择一个作品</p>;
  }

  const formats: { format: "txt" | "md"; label: string; desc: string; icon: string }[] = [
    { format: "txt", label: "TXT 纯文本", desc: "去除所有格式标记", icon: "📄" },
    { format: "md", label: "Markdown", desc: "保留格式标记", icon: "📝" },
  ];

  // 预留格式（未来实现）
  const futureFormats = [
    { label: "DOCX Word", desc: "即将支持", icon: "📘" },
    { label: "EPUB 电子书", desc: "即将支持", icon: "📚" },
    { label: "PDF", desc: "即将支持", icon: "📋" },
  ];

  return (
    <div className="p-4 space-y-2">
      <p className="text-[12px] text-text-secondary mb-3">导出「{project.name}」</p>

      {formats.map((opt) => (
        <a
          key={opt.format}
          href={getExportUrl(activeProjectId, opt.format)}
          download
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md bg-surface-elevated text-text-primary hover:bg-primary/10 hover:text-primary cursor-pointer transition-colors no-underline"
        >
          <span className="text-lg">{opt.icon}</span>
          <div>
            <p className="text-[13px]">{opt.label}</p>
            <p className="text-[10px] text-text-muted">{opt.desc}</p>
          </div>
          <Download className="w-4 h-4 ml-auto text-text-muted" />
        </a>
      ))}

      {/* 未来格式 */}
      <div className="pt-3 mt-3 border-t border-border-default">
        <p className="text-[10px] text-text-muted mb-2">更多格式开发中</p>
        {futureFormats.map((opt) => (
          <div
            key={opt.label}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-text-muted opacity-50"
          >
            <span className="text-lg">{opt.icon}</span>
            <div>
              <p className="text-[13px]">{opt.label}</p>
              <p className="text-[10px]">{opt.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
