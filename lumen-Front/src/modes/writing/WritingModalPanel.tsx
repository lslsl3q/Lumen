/**
 * WritingModalPanel — Author 风格居中模态弹窗
 *
 * 全屏居中弹窗 + 半透明遮罩 + 左右分栏（列表 + 详情编辑器）
 * 参考 Author 的设定集面板：1100px 宽，圆角 20px，重阴影
 */
import React, { useEffect, useState } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import { getExportUrl } from "../../api/writing";
import type { WritingPanelType } from "./WritingIconStrip";
import type { WritingSetting } from "../../api/writing";
import {
  Plus, Trash2, X, Download, Edit3, Search,
  ChevronRight, ChevronDown,
} from "lucide-react";
import { RichTextField } from "../../components/editors/RichTextField";

interface WritingModalPanelProps {
  panel: WritingPanelType;
  onClose: () => void;
}

const PANEL_TITLES: Record<string, string> = {
  project: "作品管理",
  characters: "人物设定",
  locations: "地点设定",
  world: "世界设定",
  items: "物品设定",
  outline: "大纲",
  export: "导出",
};

const PANEL_ICONS: Record<string, string> = {
  project: "📚",
  characters: "👤",
  locations: "📍",
  world: "🌍",
  items: "📦",
  outline: "📋",
  export: "📤",
};

/* ── 字段配置 ── */

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
      { value: "protagonist", label: "主角", color: "bg-amber-400/15 text-amber-200" },
      { value: "antagonist", label: "反派", color: "bg-red-400/15 text-red-300" },
      { value: "supporting", label: "配角", color: "bg-blue-400/15 text-blue-300" },
      { value: "minor", label: "龙套", color: "bg-slate-400/10 text-[var(--color-text-primary)]" },
    ],
  },
  { key: "gender", label: "性别", type: "text", placeholder: "男/女/未知" },
  { key: "age", label: "年龄", type: "text", placeholder: "如：25岁" },
  { key: "appearance", label: "外貌描述", type: "textarea", rows: 4, placeholder: "描述角色的外貌特征…" },
  { key: "personality", label: "性格特征", type: "textarea", rows: 4, placeholder: "描述角色的性格特点…" },
  { key: "background", label: "背景故事", type: "textarea", rows: 5, placeholder: "角色的身世和经历…" },
  { key: "abilities", label: "能力技能", type: "textarea", rows: 4, placeholder: "角色的特殊能力或技能…" },
  { key: "text", label: "备注", type: "textarea", rows: 3, placeholder: "其他补充信息…" },
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
  { key: "environment", label: "环境氛围", type: "textarea", rows: 3, placeholder: "气候、氛围、环境特征…" },
  { key: "features", label: "特色标记", type: "textarea", rows: 3, placeholder: "值得注意的地点特色…" },
  { key: "connections", label: "关联地点", type: "text", placeholder: "相邻或相关的地点" },
  { key: "text", label: "详细描述", type: "textarea", rows: 5, placeholder: "地点的详细描述…" },
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
  { key: "rules", label: "核心规则", type: "textarea", rows: 4, placeholder: "这个世界设定的核心规则…" },
  { key: "geography", label: "地理信息", type: "textarea", rows: 3, placeholder: "相关的地理信息…" },
  { key: "history", label: "历史时间线", type: "textarea", rows: 5, placeholder: "相关历史事件和时间线…" },
  { key: "text", label: "详细描述", type: "textarea", rows: 5, placeholder: "详细的世界观描述…" },
];

const ITEM_FIELDS: FieldDef[] = [
  {
    key: "rarity", label: "稀有度", type: "select",
    options: [
      { value: "common", label: "普通", color: "bg-slate-400/10 text-[var(--color-text-primary)]" },
      { value: "uncommon", label: "稀有", color: "bg-green-400/15 text-green-300" },
      { value: "rare", label: "史诗", color: "bg-purple-400/15 text-purple-300" },
      { value: "legendary", label: "传说", color: "bg-amber-400/15 text-amber-200" },
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
  { key: "properties", label: "属性效果", type: "textarea", rows: 3, placeholder: "物品的特殊属性和效果…" },
  { key: "owner", label: "持有者", type: "text", placeholder: "当前持有该物品的角色" },
  { key: "text", label: "详细描述", type: "textarea", rows: 5, placeholder: "物品的详细描述和来历…" },
];

const CATEGORY_CONFIG: Record<string, { category: string; fields: FieldDef[] }> = {
  characters: { category: "character", fields: CHARACTER_FIELDS },
  locations: { category: "location", fields: LOCATION_FIELDS },
  world: { category: "world", fields: WORLD_FIELDS },
  items: { category: "object", fields: ITEM_FIELDS },
};

export function WritingModalPanel({ panel, onClose }: WritingModalPanelProps) {
  if (!panel) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* 弹窗主体 */}
      <div className="relative w-[1100px] h-[680px] max-w-[90vw] max-h-[85vh] bg-[var(--color-bg-base)] rounded-2xl border border-[var(--color-border)] shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">{PANEL_ICONS[panel]}</span>
            <h2 className="text-[15px] font-medium text-[var(--color-text-primary)]">{PANEL_TITLES[panel]}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {panel === "project" && <ProjectManagementContent />}
          {panel === "outline" && <OutlineContent />}
          {panel === "export" && <ExportContent />}
          {CATEGORY_CONFIG[panel] && (
            <CategoryContent
              category={CATEGORY_CONFIG[panel].category}
              fields={CATEGORY_CONFIG[panel].fields}
              label={PANEL_TITLES[panel]}
              icon={PANEL_ICONS[panel]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   设定类别内容（左右分栏）
   ══════════════════════════════════════ */

function CategoryContent({ category, fields, label, icon }: {
  category: string;
  fields: FieldDef[];
  label: string;
  icon: string;
}) {
  const { settings, activeProjectId, loadSettings, createSetting, deleteSetting, updateSetting } = useWritingStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [pendingEditName, setPendingEditName] = useState("");

  useEffect(() => {
    if (activeProjectId) loadSettings(activeProjectId);
  }, [activeProjectId]);

  const filtered = settings.filter((s) => s.category === category);
  const searched = searchQuery
    ? filtered.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : filtered;

  // 构建树结构（孤儿节点提升为根节点）
  const allIds = new Set(searched.map((s) => s.id));
  const byParent = new Map<string | null, WritingSetting[]>();
  for (const s of searched) {
    const pid = s.parent_id ?? null;
    const effectivePid = pid !== null && !allIds.has(pid) ? null : pid;
    if (!byParent.has(effectivePid)) byParent.set(effectivePid, []);
    byParent.get(effectivePid)!.push(s);
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderNode = (s: WritingSetting, depth: number, visited: Set<string>): React.ReactNode => {
    if (visited.has(s.id)) return null;
    const nextVisited = new Set(visited).add(s.id);

    const content = (s.content as Record<string, string>) ?? {};
    const badgeField = fields.find((f) => f.type === "select");
    const badge = badgeField?.options?.find((o) => o.value === content[badgeField.key])?.label;
    const isActive = selectedId === s.id;
    const children = byParent.get(s.id) ?? [];
    const expanded = expandedIds.has(s.id);
    const indent = depth * 16;

    return (
      <React.Fragment key={s.id}>
        <div
          onClick={() => setSelectedId(s.id)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] cursor-pointer group transition-colors
            ${isActive ? "bg-amber-400/10 text-amber-300" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"}`}
          style={{ paddingLeft: `${12 + indent}px` }}
        >
          {children.length > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(s.id); }}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] cursor-pointer flex-shrink-0"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}
          <span className="text-base">{icon}</span>
          {pendingEditId === s.id ? (
            <input
              autoFocus
              value={pendingEditName}
              onChange={(e) => setPendingEditName(e.target.value)}
              onKeyDown={async (e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  const name = pendingEditName.trim();
                  if (name) {
                    try { await updateSetting(s.id, { name }); } catch {}
                  }
                  setPendingEditId(null);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setPendingEditId(null);
                }
              }}
              onBlur={() => setPendingEditId(null)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-[var(--color-bg-elevated)] border border-amber-400/30 rounded px-2 py-0 text-[12px] text-[var(--color-text-primary)] outline-none min-w-0"
            />
          ) : (
            <span className="truncate flex-1">{s.name}</span>
          )}
          {badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] flex-shrink-0">
              {badge}
            </span>
          )}
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (!activeProjectId) return;
              try {
                const ns = await createSetting("新子项", category, s.id);
                toggleExpand(s.id);
                setPendingEditId(ns.id);
                setPendingEditName("新子项");
              } catch {}
            }}
            className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-amber-400 cursor-pointer"
            title="新建子项"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (!confirm(`删除「${s.name}」？`)) return;
              await deleteSetting(s.id);
              if (selectedId === s.id) setSelectedId(null);
            }}
            className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-red-400 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        {expanded && children.map((child) => renderNode(child, depth + 1, nextVisited))}
      </React.Fragment>
    );
  };

  const roots = byParent.get(null) ?? [];
  const selected = selectedId ? filtered.find((s) => s.id === selectedId) : null;

  return (
    <div className="flex h-full">
      {/* 左栏：树形列表 */}
      <div className="w-[280px] flex-shrink-0 border-r border-[var(--color-border)] flex flex-col bg-[var(--color-bg-panel)]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`搜索${label}…`}
              className="w-full pl-7 pr-2 py-1.5 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[12px] text-[var(--color-text-primary)] placeholder-[var(--color-text-dim)] outline-none focus:border-amber-400/30"
            />
          </div>
          <button
            onClick={async () => {
              if (!activeProjectId) return;
              try {
                const ns = await createSetting("新" + label, category);
                setPendingEditId(ns.id);
                setPendingEditName("新" + label);
              } catch {}
            }}
            className="p-1.5 rounded-lg bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 cursor-pointer transition-colors"
            title={`新建${label}`}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-lumen">
          {!activeProjectId && (
            <p className="text-[12px] text-[var(--color-text-muted)] italic p-4">请先选择一个作品</p>
          )}
          {roots.length === 0 && activeProjectId && (
            <p className="text-[12px] text-[var(--color-text-muted)] italic p-4">
              {searchQuery ? "未找到匹配项" : `暂无${label}，点击 + 创建`}
            </p>
          )}
          <div className="p-2 space-y-0.5">
            {roots.map((s) => renderNode(s, 0, new Set()))}
          </div>
        </div>
      </div>

      {/* 右栏：详情编辑器 */}
      <div className="flex-1 min-w-0 overflow-y-auto scrollbar-lumen bg-[var(--color-bg-base)]">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
            <div className="text-center">
              <p className="text-4xl mb-3">{icon}</p>
              <p className="text-[13px]">选择或创建一个{label}</p>
            </div>
          </div>
        ) : (
          <DetailEditor setting={selected} fields={fields} />
        )}
      </div>
    </div>
  );
}

/* ── 详情编辑器 ── */

function DetailEditor({ setting, fields }: { setting: WritingSetting; fields: FieldDef[] }) {
  const { updateSetting } = useWritingStore();
  const content = (setting.content as Record<string, string>) ?? {};

  const getFieldValue = (key: string): string => {
    const val = content[key];
    return typeof val === "string" ? val : "";
  };

  const updateField = async (key: string, value: string) => {
    await updateSetting(setting.id, {
      content: { ...content, [key]: value },
    } as any);
  };

  return (
    <div className="p-6 space-y-5">
      {/* 名称 */}
      <div>
        <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">名称</label>
        <input
          key={setting.id + "-name"}
          defaultValue={setting.name}
          onBlur={async (e) => {
            if (e.target.value.trim() && e.target.value !== setting.name) {
              await updateSetting(setting.id, { name: e.target.value });
            }
          }}
          className="w-full mt-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[15px] text-[var(--color-text-primary)] outline-none focus:border-amber-400/30"
        />
      </div>

      {/* 类别专属字段 */}
      {fields.map((field) => {
        if (field.type === "select" && field.options) {
          return (
            <div key={field.key}>
              <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">{field.label}</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {field.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateField(field.key, opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer border
                      ${content[field.key] === opt.value
                        ? `border-amber-400/30 ${opt.color ?? "bg-amber-400/10 text-amber-300"}`
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-slate-600"
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        if (field.type === "textarea") {
          return (
            <div key={field.key}>
              <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">{field.label}</label>
              <RichTextField
                key={setting.id + "-" + field.key}
                value={getFieldValue(field.key)}
                onChange={(html) => updateField(field.key, html)}
                placeholder={field.placeholder}
                minHeight={field.rows ? field.rows * 24 : 72}
              />
            </div>
          );
        }

        return (
          <div key={field.key}>
            <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">{field.label}</label>
            <input
              key={setting.id + "-" + field.key}
              defaultValue={content[field.key] ?? ""}
              onBlur={(e) => { if (e.target.value !== (content[field.key] ?? "")) updateField(field.key, e.target.value); }}
              placeholder={field.placeholder}
              className="w-full mt-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-amber-400/30"
            />
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════
   作品管理内容
   ══════════════════════════════════════ */

function ProjectManagementContent() {
  const {
    projects, activeProjectId,
    loadProjects, createProject, deleteProject, setActiveProject, updateProject,
  } = useWritingStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => { loadProjects(); }, []);

  return (
    <div className="flex h-full">
      {/* 左栏：作品列表 */}
      <div className="w-[300px] flex-shrink-0 border-r border-[var(--color-border)] flex flex-col bg-[var(--color-bg-panel)]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
          <span className="text-[12px] text-[var(--color-text-muted)] flex-1">{projects.length} 个作品</span>
          <button
            onClick={async () => {
              try {
                const project = await createProject("新作品");
                setEditingId(project.id);
                setEditName("新作品");
              } catch {}
            }}
            className="px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-300 text-[12px] hover:bg-amber-400/20 cursor-pointer transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> 新建
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-lumen p-2 space-y-0.5">
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            const isEditing = editingId === p.id;
            return (
              <div
                key={p.id}
                onClick={() => setActiveProject(p.id)}
                className={`rounded-lg px-3 py-3 cursor-pointer group transition-colors
                  ${isActive ? "bg-amber-400/10 border border-amber-400/10" : "hover:bg-[var(--color-bg-elevated)] border border-transparent"}`}
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
                    className="w-full bg-[var(--color-bg-elevated)] border border-amber-400/30 rounded px-2 py-0.5 text-[13px] text-[var(--color-text-primary)] outline-none"
                  />
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className={`text-[14px] font-medium truncate ${isActive ? "text-amber-300" : "text-[var(--color-text-primary)]"}`}>
                        {p.name}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                        创建于 {new Date(p.created_at * 1000).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(p.id); setEditName(p.name); }}
                        className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`删除「${p.name}」及其所有数据？`)) return;
                          await deleteProject(p.id);
                        }}
                        className="p-1 rounded text-[var(--color-text-muted)] hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {projects.length === 0 && (
            <p className="text-[12px] text-[var(--color-text-muted)] italic p-4">暂无作品，点击新建创建</p>
          )}
        </div>
      </div>

      {/* 右栏：当前作品信息 */}
      <div className="flex-1 min-w-0 overflow-y-auto scrollbar-lumen bg-[var(--color-bg-base)] p-6">
        {activeProjectId ? (() => {
          const proj = projects.find((p) => p.id === activeProjectId);
          if (!proj) return null;
          const chapters = useWritingStore.getState().chapters;
          const totalWords = chapters.reduce((sum, c) => sum + (c.word_count ?? 0), 0);
          return (
            <div className="space-y-5">
              <h3 className="text-[18px] font-medium text-[var(--color-text-primary)]">{proj.name}</h3>

              <div className="grid grid-cols-3 gap-3">
                <div className="px-4 py-3 rounded-xl bg-[var(--color-bg-panel)] border border-[var(--color-border)]">
                  <p className="text-[11px] text-[var(--color-text-muted)]">章节</p>
                  <p className="text-[20px] font-medium text-[var(--color-text-primary)] mt-0.5">{chapters.length}</p>
                </div>
                <div className="px-4 py-3 rounded-xl bg-[var(--color-bg-panel)] border border-[var(--color-border)]">
                  <p className="text-[11px] text-[var(--color-text-muted)]">总字数</p>
                  <p className="text-[20px] font-medium text-[var(--color-text-primary)] mt-0.5">{totalWords.toLocaleString()}</p>
                </div>
                <div className="px-4 py-3 rounded-xl bg-[var(--color-bg-panel)] border border-[var(--color-border)]">
                  <p className="text-[11px] text-[var(--color-text-muted)]">设定数</p>
                  <p className="text-[20px] font-medium text-[var(--color-text-primary)] mt-0.5">{useWritingStore.getState().settings.length}</p>
                </div>
              </div>

              {proj.description && (
                <div>
                  <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">简介</label>
                  <p className="text-[13px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">{proj.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">创建时间</label>
                  <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">{new Date(proj.created_at * 1000).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">更新时间</label>
                  <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">{new Date(proj.updated_at * 1000).toLocaleString()}</p>
                </div>
              </div>
            </div>
          );
        })() : (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
            <p className="text-[13px]">选择一个作品查看详情</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   大纲内容
   ══════════════════════════════════════ */

function OutlineContent() {
  const { chapters, setActiveChapter, settings, activeProjectId, loadSettings, createSetting, updateSetting } = useWritingStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (activeProjectId) loadSettings(activeProjectId);
  }, [activeProjectId]);

  const outlineSettings = settings.filter((s) => s.category === "outline");
  const totalWords = chapters.reduce((sum, c) => sum + (c.word_count ?? 0), 0);

  const getOutlineContent = (chapterId: string) => {
    const s = outlineSettings.find((o) => o.name === chapterId);
    return (s?.content as Record<string, string>)?.text ?? "";
  };

  const getOrCreateOutlineSetting = async (chapterId: string) => {
    let s = outlineSettings.find((o) => o.name === chapterId);
    if (!s && activeProjectId) {
      await createSetting(chapterId, "outline");
      await loadSettings(activeProjectId);
      s = useWritingStore.getState().settings.find((o) => o.name === chapterId && o.category === "outline");
    }
    return s;
  };

  const selectedChapter = selectedId ? chapters.find((c) => c.id === selectedId) : null;

  return (
    <div className="flex h-full">
      {/* 左栏：章节列表 */}
      <div className="w-[280px] flex-shrink-0 border-r border-[var(--color-border)] flex flex-col bg-[var(--color-bg-panel)]">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <div className="px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)]">
              <p className="text-[10px] text-[var(--color-text-muted)]">章节</p>
              <p className="text-[16px] text-[var(--color-text-primary)]">{chapters.length}</p>
            </div>
            <div className="px-3 py-2 rounded-lg bg-[var(--color-bg-elevated)]">
              <p className="text-[10px] text-[var(--color-text-muted)]">总字数</p>
              <p className="text-[16px] text-[var(--color-text-primary)]">{totalWords.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-lumen p-2 space-y-0.5">
          {chapters.length === 0 && (
            <p className="text-[12px] text-[var(--color-text-muted)] italic p-4">暂无章节</p>
          )}
          {chapters.map((ch, idx) => (
            <div
              key={ch.id}
              onClick={() => { setSelectedId(ch.id); setActiveChapter(ch.id); }}
              className={`rounded-lg px-3 py-2.5 cursor-pointer transition-colors
                ${selectedId === ch.id ? "bg-amber-400/10 text-amber-300" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-text-muted)]">{idx + 1}.</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">{ch.word_count ?? 0}字</span>
              </div>
              <p className="truncate text-[13px] mt-0.5">{ch.title}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 右栏：大纲备注 */}
      <div className="flex-1 min-w-0 overflow-y-auto scrollbar-lumen bg-[var(--color-bg-base)] p-6">
        {!selectedChapter ? (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
            <p className="text-[13px]">选择一个章节查看大纲</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-[16px] font-medium text-[var(--color-text-primary)]">
              {selectedChapter.title}
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
              <span>{selectedChapter.word_count ?? 0} 字</span>
              <span>·</span>
              <span>第 {chapters.indexOf(selectedChapter) + 1} 章</span>
            </div>
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">大纲备注</label>
              <textarea
                key={selectedChapter.id}
                defaultValue={getOutlineContent(selectedChapter.id)}
                onBlur={async (e) => {
                  const s = await getOrCreateOutlineSetting(selectedChapter.id);
                  if (s) await updateSetting(s.id, { content: { text: e.target.value } } as any);
                }}
                placeholder={`${selectedChapter.title} 的大纲备注、剧情要点、伏笔…`}
                rows={15}
                className="w-full mt-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--color-text-primary)] placeholder-[var(--color-text-dim)] outline-none focus:border-amber-400/30 resize-y leading-relaxed"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   导出内容
   ══════════════════════════════════════ */

function ExportContent() {
  const { activeProjectId, projects } = useWritingStore();
  const project = projects.find((p) => p.id === activeProjectId);

  if (!activeProjectId || !project) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
        <p className="text-[13px]">请先选择一个作品</p>
      </div>
    );
  }

  const chapters = useWritingStore.getState().chapters;
  const totalWords = chapters.reduce((sum, c) => sum + (c.word_count ?? 0), 0);

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h3 className="text-[18px] font-medium text-[var(--color-text-primary)] mb-2">导出「{project.name}」</h3>
      <p className="text-[12px] text-[var(--color-text-muted)] mb-6">
        {chapters.length} 章 · {totalWords.toLocaleString()} 字
      </p>

      <div className="space-y-3">
        {[
          { format: "txt" as const, label: "TXT 纯文本", desc: "去除所有格式标记，最通用的格式", icon: "📄" },
          { format: "md" as const, label: "Markdown", desc: "保留标题、加粗等格式标记", icon: "📝" },
          { format: "docx" as const, label: "DOCX Word 文档", desc: "可在 Word/WPS 中打开编辑", icon: "📘" },
        ].map((opt) => (
          <a
            key={opt.format}
            href={getExportUrl(activeProjectId, opt.format)}
            download
            className="flex items-center gap-4 w-full px-5 py-4 rounded-xl bg-[var(--color-bg-panel)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-amber-400/5 hover:border-amber-400/20 hover:text-amber-300 cursor-pointer transition-colors no-underline group"
          >
            <span className="text-2xl">{opt.icon}</span>
            <div className="flex-1">
              <p className="text-[14px] font-medium">{opt.label}</p>
              <p className="text-[11px] text-[var(--color-text-muted)] group-hover:text-[var(--color-text-muted)]">{opt.desc}</p>
            </div>
            <Download className="w-5 h-5 text-[var(--color-text-muted)] group-hover:text-amber-400" />
          </a>
        ))}
      </div>

      <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
        <p className="text-[11px] text-[var(--color-text-muted)] mb-3">更多格式开发中</p>
        <div className="space-y-2 opacity-40">
          {[
            { label: "EPUB 电子书", icon: "📚" },
            { label: "PDF 文档", icon: "📋" },
          ].map((opt) => (
            <div key={opt.label} className="flex items-center gap-4 px-5 py-3 rounded-xl bg-[var(--color-bg-panel)] border border-[var(--color-border)] text-[var(--color-text-muted)]">
              <span className="text-xl">{opt.icon}</span>
              <p className="text-[13px]">{opt.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
