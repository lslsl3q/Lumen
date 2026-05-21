import { useState, useCallback, useEffect } from "react";
import { cn } from "../../lib/utils";
import { useWritingStore } from "../../stores/useWritingStore";
import { useModeStore } from "../../stores/useModeStore";
import type { CodexEntry } from "../../api/writing";
import {
  X,
  ChevronDown,
  User,
  MapPin,
  ScrollText,
  Package,
  Lightbulb,
  BookMarked,
  Tag,
  Link2,
  MessageSquare,
  BarChart3,
  Trash2,
  Plus,
  ExternalLink,
  ArrowUpDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";

// ── ProseMirror JSON → 纯文本 ──

function extractPlainText(content: unknown): string {
  if (!content) return "";
  let doc: any;
  if (typeof content === "string") {
    try { doc = JSON.parse(content); } catch { return content; }
  } else {
    doc = content;
  }
  const texts: string[] = [];
  function walk(node: any) {
    if (node.type === "text" && node.text) texts.push(node.text);
    for (const child of node.content || []) walk(child);
  }
  walk(doc);
  return texts.join("");
}

// ── 类型配置 ──

const CODEX_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  character: { label: "角色", icon: User, color: "text-blue-400" },
  location: { label: "地点", icon: MapPin, color: "text-green-400" },
  lore: { label: "设定", icon: ScrollText, color: "text-purple-400" },
  object: { label: "物品", icon: Package, color: "text-amber-400" },
  subplot: { label: "支线", icon: Lightbulb, color: "text-cyan-400" },
  other: { label: "其他", icon: BookMarked, color: "text-zinc-400" },
};

const ALL_TYPES = Object.entries(CODEX_TYPE_CONFIG).map(([id, cfg]) => ({ id, ...cfg }));

// ── AI 上下文追踪选项 ──

const AI_CONTEXT_OPTIONS = [
  { value: "always", label: "始终包含", desc: "始终作为上下文发送给 AI" },
  { value: "detected", label: "自动检测", desc: "AI 自动检测相关性" },
  { value: "anti_spoiler", label: "防剧透", desc: "仅在故事中揭示后使用" },
  { value: "manual", label: "手动控制", desc: "每次对话手动切换" },
];

// ── 标签页配置 ──

type DetailTab = "details" | "research" | "relations" | "mentions" | "tracking";

const DETAIL_TABS: { id: DetailTab; label: string; icon: React.ElementType }[] = [
  { id: "details", label: "详情", icon: ScrollText },
  { id: "research", label: "研究", icon: BookMarked },
  { id: "relations", label: "关联", icon: Link2 },
  { id: "mentions", label: "提及", icon: MessageSquare },
  { id: "tracking", label: "追踪", icon: BarChart3 },
];

// ── 主组件 ──

export function CodexDetailPanel() {
  const activeId = useWritingStore((s) => s.activeCodexEntryId);
  const entries = useWritingStore((s) => s.codexEntries);
  const setActiveCodexEntry = useWritingStore((s) => s.setActiveCodexEntry);
  const updateCodexEntry = useWritingStore((s) => s.updateCodexEntry);
  const deleteCodexEntry = useWritingStore((s) => s.deleteCodexEntry);

  const raw = entries.find((e) => e.id === activeId);
  const entry = raw
    ? {
        ...raw,
        description: raw.description || {},
        aliases: raw.aliases || [],
        tags: raw.tags || [],
        relations: raw.relations || [],
      }
    : null;
  const [activeTab, setActiveTab] = useState<DetailTab>("details");

  useEffect(() => {
    setActiveTab("details");
  }, [activeId]);

  const handleClose = useCallback(() => {
    setActiveCodexEntry(null);
  }, [setActiveCodexEntry]);

  const handleDelete = useCallback(async () => {
    if (!entry) return;
    await deleteCodexEntry(entry.id);
    setActiveCodexEntry(null);
  }, [entry, deleteCodexEntry, setActiveCodexEntry]);

  const handleTypeChange = useCallback(
    async (newType: string) => {
      if (!entry) return;
      await updateCodexEntry(entry.id, { type: newType });
    },
    [entry, updateCodexEntry],
  );

  if (!entry) return null;

  const typeCfg = CODEX_TYPE_CONFIG[entry.type] || CODEX_TYPE_CONFIG.other;
  const TypeIcon = typeCfg.icon;

  return (
    <>
      {/* 遮罩层 */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={handleClose} />

      {/* 浮动面板 — 顶部对齐侧边栏搜索工具栏下方分割线 */}
      <div
        className="fixed z-50 flex flex-col overflow-hidden shadow-2xl rounded-xl ring-1 ring-black/10 bg-zinc-900"
        style={{
          width: "clamp(320px, 34rem, 90vw)",
          maxHeight: "calc(100vh - 8.5rem)",
          top: "8.75rem",
          left: "calc(var(--sidebar-width, 450px) + 0.5rem)",
        }}
      >
        {/* 头部 */}
        <div className="flex-none border-b border-[var(--color-border)]">
          {/* 顶栏：关闭 + 类型选择 + 操作 */}
          <div className="flex items-center gap-2 px-3 h-11">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wider hover:bg-white/5 transition-colors cursor-pointer">
                <TypeIcon className={cn("w-3.5 h-3.5", typeCfg.color)} />
                <span className={typeCfg.color}>{typeCfg.label}</span>
                <ChevronDown className="w-3 h-3 text-[var(--color-text-dim)]" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                {ALL_TYPES.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => handleTypeChange(t.id)}>
                    <t.icon className={cn("w-3.5 h-3.5", t.color)} />
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex-1" />

            <button
              onClick={handleDelete}
              className="p-1.5 rounded text-[var(--color-text-dim)] hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="删除条目"
              type="button"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 rounded text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/5 transition-colors"
              title="关闭"
              type="button"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 名称输入 */}
          <div className="px-3 pb-2">
            <NameInput entry={entry} onSave={(name) => updateCodexEntry(entry.id, { name })} />
          </div>

          {/* 标签行 — 在标签页上方 */}
          <div className="px-3 pb-2">
            <TagList
              tags={entry.tags}
              onAdd={async (tag) => {
                await updateCodexEntry(entry.id, { tags: [...entry.tags, tag] });
              }}
              onRemove={async (tag) => {
                await updateCodexEntry(entry.id, { tags: entry.tags.filter((t) => t !== tag) });
              }}
              placeholder="+ 添加标签"
            />
          </div>

          {/* 提及心跳图 */}
          <MentionSparkline entry={entry} />

          {/* 标签页 */}
          <div className="flex items-center gap-0 px-1 border-t border-[var(--color-border)]/50">
            {DETAIL_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors relative",
                    activeTab === tab.id
                      ? "text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]",
                  )}
                  type="button"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-2 right-2 h-px bg-[var(--color-text-primary)]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 标签页内容 */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "details" && <DetailsTab entry={entry} />}
          {activeTab === "research" && <ResearchTab entry={entry} />}
          {activeTab === "relations" && <RelationsTab entry={entry} />}
          {activeTab === "mentions" && <MentionsTab entry={entry} />}
          {activeTab === "tracking" && <TrackingTab entry={entry} />}
        </div>
      </div>
    </>
  );
}

// ── 名称输入 ──

function NameInput({ entry, onSave }: { entry: CodexEntry; onSave: (name: string) => void }) {
  const [value, setValue] = useState(entry.name);

  useEffect(() => {
    setValue(entry.name);
  }, [entry.id, entry.name]);

  const handleBlur = () => {
    if (value !== entry.name && value.trim()) {
      onSave(value.trim());
    }
  };

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="w-full bg-transparent text-[15px] font-semibold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-dim)]"
      placeholder="条目名称…"
    />
  );
}

// ── 详情标签页 — 仅 别名 + 描述 ──

function DetailsTab({ entry }: { entry: CodexEntry }) {
  const updateCodexEntry = useWritingStore((s) => s.updateCodexEntry);
  const desc = (entry.description.text as string) || "";

  return (
    <div className="p-3 flex flex-col gap-5">
      {/* 别名 / 昵称 */}
      <fieldset className="space-y-1.5">
        <legend className="text-[12px] font-semibold text-[var(--color-text-secondary)] mb-0.5">
          别名 / 昵称
        </legend>
        <p className="text-[11px] text-[var(--color-text-dim)]">
          所有名称会在正文中被自动检测。
        </p>
        <div className="w-full min-h-[36px] bg-white/[0.03] border border-[var(--color-border)]/40 rounded-lg px-2.5 py-2 flex flex-wrap gap-1.5 items-center focus-within:border-zinc-500 transition-colors">
          {entry.aliases.map((alias) => (
            <span
              key={alias}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-[11px] text-[var(--color-text-secondary)] border border-[var(--color-border)]/30"
            >
              {alias}
              <button
                onClick={async () => {
                  await updateCodexEntry(entry.id, { aliases: entry.aliases.filter((a) => a !== alias) });
                }}
                className="ml-0.5 text-[var(--color-text-dim)] hover:text-red-400 transition-colors cursor-pointer"
                type="button"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <AliasInput
            onAdd={async (alias) => {
              await updateCodexEntry(entry.id, { aliases: [...entry.aliases, alias] });
            }}
            existing={entry.aliases}
          />
        </div>
      </fieldset>

      {/* 描述 */}
      <fieldset className="space-y-1.5">
        <legend className="text-[12px] font-semibold text-[var(--color-text-secondary)] mb-0.5">
          描述
        </legend>
        <p className="text-[11px] text-[var(--color-text-dim)]">
          描述与故事相关的所有方面。
        </p>
        <textarea
          value={desc}
          onChange={(e) =>
            updateCodexEntry(entry.id, { description: { ...entry.description, text: e.target.value } })
          }
          className="w-full min-h-[160px] bg-white/[0.03] border border-[var(--color-border)]/40 rounded-lg p-3 text-[13px] leading-relaxed text-[var(--color-text-primary)] outline-none resize-y placeholder:text-[var(--color-text-dim)] focus:border-zinc-500 transition-colors"
          placeholder="描述此条目…"
        />
      </fieldset>

      {/* 添加详情按钮 */}
      <button
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--color-border)]/50 text-[12px] text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:border-[var(--color-text-dim)] hover:bg-white/[0.02] transition-colors cursor-pointer"
        type="button"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>添加详情</span>
        <span className="text-[var(--color-text-dim)]">— 填写自定义信息</span>
      </button>
    </div>
  );
}

// ── 别名行内输入 ──

function AliasInput({ onAdd, existing }: { onAdd: (v: string) => void; existing: string[] }) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const trimmed = input.trim();
    if (trimmed && !existing.includes(trimmed)) {
      onAdd(trimmed);
      setInput("");
    }
  };

  return (
    <input
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
      }}
      onBlur={handleAdd}
      className="flex-1 min-w-[80px] bg-transparent text-[12px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-dim)]"
      placeholder="添加别名…"
    />
  );
}

// ── 研究标签页 — 子标签：笔记 + 外部链接 ──

type ResearchSubTab = "notes" | "external";

function ResearchTab({ entry }: { entry: CodexEntry }) {
  const [subTab, setSubTab] = useState<ResearchSubTab>("notes");

  return (
    <div className="flex flex-col">
      {/* 子标签切换 */}
      <div className="flex-none flex items-center gap-0 px-2 pt-2 border-b border-[var(--color-border)]/30">
        <button
          onClick={() => setSubTab("notes")}
          className={cn(
            "px-3 py-1.5 text-[11px] font-medium transition-colors relative",
            subTab === "notes"
              ? "text-[var(--color-text-primary)]"
              : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]",
          )}
          type="button"
        >
          笔记
          {subTab === "notes" && (
            <div className="absolute bottom-0 left-1 right-1 h-px bg-[var(--color-text-primary)]" />
          )}
        </button>
        <button
          onClick={() => setSubTab("external")}
          className={cn(
            "px-3 py-1.5 text-[11px] font-medium transition-colors relative",
            subTab === "external"
              ? "text-[var(--color-text-primary)]"
              : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]",
          )}
          type="button"
        >
          外部链接
          {subTab === "external" && (
            <div className="absolute bottom-0 left-1 right-1 h-px bg-[var(--color-text-primary)]" />
          )}
        </button>
      </div>

      {/* 子标签内容 */}
      <div className="flex-1">
        {subTab === "notes" && <ResearchNotesSubTab entry={entry} />}
        {subTab === "external" && <ResearchExternalSubTab entry={entry} />}
      </div>
    </div>
  );
}

function ResearchNotesSubTab({ entry }: { entry: CodexEntry }) {
  const updateCodexEntry = useWritingStore((s) => s.updateCodexEntry);
  const notes = (entry.description._research as string) || "";

  return (
    <div className="p-3 space-y-2">
      <SectionHeader label="笔记" />
      <p className="text-[11px] text-[var(--color-text-dim)]">
        这些笔记仅你自己可见，不会用于 AI 生成正文。
      </p>
      <textarea
        value={notes}
        onChange={(e) =>
          updateCodexEntry(entry.id, { description: { ...entry.description, _research: e.target.value } })
        }
        className="w-full min-h-[200px] bg-white/[0.03] border border-[var(--color-border)]/40 rounded-lg p-3 text-[13px] leading-relaxed text-[var(--color-text-primary)] outline-none resize-y placeholder:text-[var(--color-text-dim)] focus:border-zinc-500 transition-colors"
        placeholder="研究笔记、参考资料、灵感…"
      />
    </div>
  );
}

function ResearchExternalSubTab({ entry }: { entry: CodexEntry }) {
  const updateCodexEntry = useWritingStore((s) => s.updateCodexEntry);
  const links: string[] = (entry.description._external_links as string[]) || [];
  const [urlInput, setUrlInput] = useState("");

  const handleAdd = () => {
    const url = urlInput.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      return;
    }
    updateCodexEntry(entry.id, {
      description: { ...entry.description, _external_links: [...links, url] },
    });
    setUrlInput("");
  };

  const handleRemove = (url: string) => {
    updateCodexEntry(entry.id, {
      description: { ...entry.description, _external_links: links.filter((l) => l !== url) },
    });
  };

  return (
    <div className="p-3 space-y-3">
      <SectionHeader label="外部链接" />
      <p className="text-[11px] text-[var(--color-text-dim)]">
        添加外部链接，如 Google Docs、Notion 等资料页面，方便快速跳转查看。
      </p>

      {/* URL 输入 */}
      <div className="flex items-center gap-2">
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          className="flex-1 bg-white/[0.03] border border-[var(--color-border)]/40 rounded-lg px-3 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-dim)] focus:border-zinc-500 transition-colors"
          placeholder="输入 URL…"
        />
        <button
          onClick={handleAdd}
          disabled={!urlInput.trim()}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-[var(--color-border)]/40 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-white/10 hover:text-[var(--color-text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          type="button"
        >
          添加
        </button>
      </div>

      {/* 链接列表 */}
      {links.length > 0 && (
        <div className="space-y-1">
          {links.map((url) => (
            <div
              key={url}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 group transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[var(--color-text-dim)] flex-none" />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] truncate transition-colors"
              >
                {url}
              </a>
              <button
                onClick={() => handleRemove(url)}
                className="p-0.5 rounded text-[var(--color-text-dim)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                title="移除链接"
                type="button"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 关联标签页 — 父子层级模式 ──

function RelationsTab({ entry }: { entry: CodexEntry }) {
  const entries = useWritingStore((s) => s.codexEntries);
  const updateCodexEntry = useWritingStore((s) => s.updateCodexEntry);
  const setActiveCodexEntry = useWritingStore((s) => s.setActiveCodexEntry);

  // 子条目 = parent_id 指向当前条目的条目
  const children = entries.filter((e) => e.parent_id === entry.id);
  // 父条目 = 当前条目的 parent_id 指向的条目
  const parent = entry.parent_id ? entries.find((e) => e.id === entry.parent_id) : null;

  // 可关联的条目（排除自身和已关联的）
  const linkable = entries.filter(
    (e) => e.id !== entry.id && e.parent_id !== entry.id && entry.parent_id !== e.id,
  );

  // 乐观更新 parent_id：先改本地 store，再后台发 API
  const setParentId = useCallback(
    (targetId: string, newParentId: string | null) => {
      // 乐观更新
      useWritingStore.setState((s) => ({
        codexEntries: s.codexEntries.map((e) =>
          e.id === targetId ? { ...e, parent_id: newParentId } : e,
        ),
      }));
      // 后台持久化
      updateCodexEntry(targetId, { parent_id: newParentId });
    },
    [updateCodexEntry],
  );

  // 添加子条目
  const handleAddChild = useCallback(
    (targetId: string) => setParentId(targetId, entry.id),
    [entry, setParentId],
  );

  // 添加父条目
  const handleAddParent = useCallback(
    (targetId: string) => setParentId(entry.id, targetId),
    [entry, setParentId],
  );

  // 移除子条目
  const handleRemoveChild = useCallback(
    (childId: string) => setParentId(childId, null),
    [setParentId],
  );

  // 移除父条目
  const handleRemoveParent = useCallback(
    () => setParentId(entry.id, null),
    [entry, setParentId],
  );

  // 翻转：一次性做两个乐观更新，再并行发两个 API
  const handleInvert = useCallback(
    (targetId: string, direction: "child" | "parent") => {
      if (direction === "child") {
        // 子→父：清除子条目的 parent_id，设置自己 parent_id 为该子条目
        useWritingStore.setState((s) => ({
          codexEntries: s.codexEntries.map((e) => {
            if (e.id === targetId) return { ...e, parent_id: null };
            if (e.id === entry.id) return { ...e, parent_id: targetId };
            return e;
          }),
        }));
        updateCodexEntry(targetId, { parent_id: null });
        updateCodexEntry(entry.id, { parent_id: targetId });
      } else {
        // 父→子：清除自己的 parent_id，设置原父条目的 parent_id 为自己
        useWritingStore.setState((s) => ({
          codexEntries: s.codexEntries.map((e) => {
            if (e.id === entry.id) return { ...e, parent_id: null };
            if (e.id === targetId) return { ...e, parent_id: entry.id };
            return e;
          }),
        }));
        updateCodexEntry(entry.id, { parent_id: null });
        updateCodexEntry(targetId, { parent_id: entry.id });
      }
    },
    [entry, updateCodexEntry],
  );

  return (
    <div className="p-3 space-y-4">
      <SectionHeader label="关联 / 层级" />
      <p className="text-[11px] text-[var(--color-text-dim)]">
        添加条目间的层级关系，构建信息网络。
      </p>

      {/* 子条目列表 */}
      {children.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] text-[var(--color-text-dim)]">
            {children.length} 个子条目
          </div>
          {children.map((child) => {
            const cCfg = CODEX_TYPE_CONFIG[child.type] || CODEX_TYPE_CONFIG.other;
            const CIcon = cCfg.icon;
            return (
              <div
                key={child.id}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-white/5 group transition-colors"
              >
                <button
                  onClick={() => setActiveCodexEntry(child.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                  type="button"
                >
                  <CIcon className={cn("w-3.5 h-3.5 flex-none", cCfg.color)} />
                  <span className="text-[13px] text-[var(--color-text-secondary)] truncate">{child.name}</span>
                </button>
                <button
                  onClick={() => handleInvert(child.id, "child")}
                  className="p-1 rounded text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="翻转关系（变为父条目）"
                  type="button"
                >
                  <ArrowUpDown className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleRemoveChild(child.id)}
                  className="p-1 rounded text-[var(--color-text-dim)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="移除关联"
                  type="button"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 父条目 */}
      {parent && (
        <div className="space-y-1">
          <div className="text-[11px] text-[var(--color-text-dim)]">父条目</div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-white/5 group transition-colors">
            {(() => {
              const pCfg = CODEX_TYPE_CONFIG[parent.type] || CODEX_TYPE_CONFIG.other;
              const PIcon = pCfg.icon;
              return (
                <>
                  <button
                    onClick={() => setActiveCodexEntry(parent.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                    type="button"
                  >
                    <PIcon className={cn("w-3.5 h-3.5 flex-none", pCfg.color)} />
                    <span className="text-[13px] text-[var(--color-text-secondary)] truncate">{parent.name}</span>
                  </button>
                  <button
                    onClick={() => handleInvert(parent.id, "parent")}
                    className="p-1 rounded text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="翻转关系（变为子条目）"
                    type="button"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={handleRemoveParent}
                    className="p-1 rounded text-[var(--color-text-dim)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="移除关联"
                    type="button"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* 添加操作 */}
      {linkable.length > 0 && (
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[var(--color-border)]/50 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-[var(--color-text-muted)] transition-colors cursor-pointer">
              <Plus className="w-3 h-3" />
              添加子条目
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
              {linkable.map((e) => {
                const eCfg = CODEX_TYPE_CONFIG[e.type] || CODEX_TYPE_CONFIG.other;
                const EIcon = eCfg.icon;
                return (
                  <DropdownMenuItem key={e.id} onClick={() => handleAddChild(e.id)}>
                    <EIcon className={cn("w-3.5 h-3.5", eCfg.color)} />
                    {e.name}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {!parent && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[var(--color-border)]/50 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-[var(--color-text-muted)] transition-colors cursor-pointer">
                <Plus className="w-3 h-3" />
                设为父条目
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
                {linkable.map((e) => {
                  const eCfg = CODEX_TYPE_CONFIG[e.type] || CODEX_TYPE_CONFIG.other;
                  const EIcon = eCfg.icon;
                  return (
                    <DropdownMenuItem key={e.id} onClick={() => handleAddParent(e.id)}>
                      <EIcon className={cn("w-3.5 h-3.5", eCfg.color)} />
                      {e.name}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}

// ── 提及标签页 — 子标签：手稿/摘要/Codex/Snippets/聊天 ──

type MentionSubTab = "manuscript" | "summaries" | "codex" | "snippets" | "chats";

function MentionsTab({ entry }: { entry: CodexEntry }) {
  const [subTab, setSubTab] = useState<MentionSubTab>("manuscript");
  const allNames = [entry.name, ...entry.aliases].map((n) => n.toLowerCase()).filter(Boolean);

  // 预计算各子标签的提及数量
  const acts = useWritingStore((s) => s.acts);
  const codexEntries = useWritingStore((s) => s.codexEntries);
  const snippets = useWritingStore((s) => s.snippets);

  const manuscriptCount = countMentionsInManuscript(acts, allNames, "content");
  const summariesCount = countMentionsInManuscript(acts, allNames, "summary");
  const codexCount = countMentionsInCodex(codexEntries, allNames, entry.id);
  const snippetsCount = countMentionsInSnippets(snippets, allNames);

  const SUB_TABS: { id: MentionSubTab; label: string; count: number }[] = [
    { id: "manuscript", label: "手稿", count: manuscriptCount },
    { id: "summaries", label: "摘要", count: summariesCount },
    { id: "codex", label: "Codex", count: codexCount },
    { id: "snippets", label: "Snippets", count: snippetsCount },
    { id: "chats", label: "聊天", count: 0 },
  ];

  return (
    <div className="flex flex-col">
      {/* 子标签切换 */}
      <div className="flex-none flex items-center gap-0 px-2 pt-2 border-b border-[var(--color-border)]/30 overflow-x-auto">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={cn(
              "px-3 py-1.5 text-[11px] font-medium transition-colors relative whitespace-nowrap",
              subTab === tab.id
                ? "text-[var(--color-text-primary)]"
                : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]",
            )}
            type="button"
          >
            {tab.label} {tab.count > 0 ? tab.count : ""}
            {subTab === tab.id && (
              <div className="absolute bottom-0 left-1 right-1 h-px bg-[var(--color-text-primary)]" />
            )}
          </button>
        ))}
      </div>

      {/* 子标签内容 */}
      <div className="flex-1 overflow-y-auto">
        {subTab === "manuscript" && <ManuscriptMentions entry={entry} allNames={allNames} field="content" />}
        {subTab === "summaries" && <ManuscriptMentions entry={entry} allNames={allNames} field="summary" />}
        {subTab === "codex" && <CodexMentions entry={entry} allNames={allNames} />}
        {subTab === "snippets" && <SnippetsMentions entry={entry} allNames={allNames} />}
        {subTab === "chats" && (
          <div className="p-3 text-[12px] text-[var(--color-text-dim)] italic">
            聊天记录提及功能待实现。
          </div>
        )}
      </div>
    </div>
  );
}

// 提及计数工具函数
function countMentionsInManuscript(acts: any[], allNames: string[], field: "content" | "summary"): number {
  let count = 0;
  for (const act of acts) {
    for (const ch of (act as any).chapters || []) {
      for (const sc of ch.scenes || []) {
        const text = field === "content"
          ? extractPlainText(sc.content)
          : (sc.summary || "");
        const lower = text.toLowerCase();
        if (allNames.some((n) => lower.includes(n))) count++;
      }
    }
  }
  return count;
}

function countMentionsInCodex(entries: CodexEntry[], allNames: string[], selfId: string): number {
  let count = 0;
  for (const e of entries) {
    if (e.id === selfId) continue;
    const desc = (e.description as any)?.text || "";
    const research = (e.description as any)?._research || "";
    const lower = `${desc} ${research}`.toLowerCase();
    if (allNames.some((n) => lower.includes(n))) count++;
  }
  return count;
}

function countMentionsInSnippets(snippets: any[], allNames: string[]): number {
  let count = 0;
  for (const sn of snippets) {
    const content = extractPlainText(sn.content);
    const lower = content.toLowerCase();
    if (allNames.some((n) => lower.includes(n))) count++;
  }
  return count;
}

// 手稿/摘要提及子标签（复用组件）
function ManuscriptMentions({ allNames, field }: { entry: CodexEntry; allNames: string[]; field: "content" | "summary" }) {
  const acts = useWritingStore((s) => s.acts);
  const setActiveScene = useWritingStore((s) => s.setActiveScene);
  const setWritingViewTab = useWritingStore((s) => s.setWritingViewTab);

  const mentions: { actTitle: string; chapterTitle: string; sceneId: string; sceneIndex: number; excerpt: string }[] = [];

  for (const act of acts) {
    for (const ch of (act as any).chapters || []) {
      for (let si = 0; si < (ch.scenes || []).length; si++) {
        const sc = ch.scenes[si];
        const text = field === "content"
          ? extractPlainText(sc.content)
          : (sc.summary || "");        const lower = text.toLowerCase();
        const matched = allNames.find((n) => lower.includes(n));
        if (matched) {
          // 提取上下文摘要
          const idx = lower.indexOf(matched);
          const start = Math.max(0, idx - 30);
          const end = Math.min(text.length, idx + matched.length + 60);
          const excerpt = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
          mentions.push({
            actTitle: act.title || `卷 ${(act.sort_order ?? 0) + 1}`,
            chapterTitle: ch.title || `章 ${(ch.sort_order ?? 0) + 1}`,
            sceneId: sc.id,
            sceneIndex: si + 1,
            excerpt,
          });
        }
      }
    }
  }

  const handleOpen = (sceneId: string) => {
    setActiveScene(sceneId);
    setWritingViewTab("write");
  };

  return (
    <div className="p-3 space-y-2">
      {mentions.length > 0 ? mentions.map((m, i) => (
        <div
          key={i}
          className="px-2 py-1.5 rounded hover:bg-white/5 group transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-3 h-3 text-[var(--color-text-dim)] flex-none" />
            <span className="text-[11px] text-[var(--color-text-secondary)]">
              {m.actTitle} / {m.chapterTitle} / 场景 {m.sceneIndex}
            </span>
            <button
              onClick={() => handleOpen(m.sceneId)}
              className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--color-text-dim)] opacity-0 group-hover:opacity-100 hover:text-[var(--color-text-muted)] hover:bg-white/5 transition-all cursor-pointer"
              type="button"
            >
              打开
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-text-dim)] leading-relaxed line-clamp-2 pl-5">
            {m.excerpt}
          </p>
        </div>
      )) : (
        <p className="text-[12px] text-[var(--color-text-dim)] italic">
          {field === "summary" ? "摘要中未找到提及" : "正文中未找到提及"}
        </p>
      )}
    </div>
  );
}

// Codex 提及子标签
function CodexMentions({ entry, allNames }: { entry: CodexEntry; allNames: string[] }) {
  const codexEntries = useWritingStore((s) => s.codexEntries);
  const setActiveCodexEntry = useWritingStore((s) => s.setActiveCodexEntry);

  const matches = codexEntries.filter((e) => {
    if (e.id === entry.id) return false;
    const desc = (e.description as any)?.text || "";
    const research = (e.description as any)?._research || "";
    const lower = `${desc} ${research}`.toLowerCase();
    return allNames.some((n) => lower.includes(n));
  });

  return (
    <div className="p-3 space-y-1">
      {matches.length > 0 ? matches.map((m) => {
        const cfg = CODEX_TYPE_CONFIG[m.type] || CODEX_TYPE_CONFIG.other;
        const Icon = cfg.icon;
        return (
          <button
            key={m.id}
            onClick={() => setActiveCodexEntry(m.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
            type="button"
          >
            <Icon className={cn("w-3.5 h-3.5 flex-none", cfg.color)} />
            <span className="text-[13px] text-[var(--color-text-secondary)] truncate">{m.name}</span>
          </button>
        );
      }) : (
        <p className="text-[12px] text-[var(--color-text-dim)] italic">Codex 条目中未找到提及</p>
      )}
    </div>
  );
}

// Snippets 提及子标签
function SnippetsMentions({ allNames }: { entry: CodexEntry; allNames: string[] }) {
  const snippets = useWritingStore((s) => s.snippets);
  const setActiveSnippet = useWritingStore((s) => s.setActiveSnippet);
  const setWritingSidebarTab = useModeStore((s) => s.setWritingSidebarTab);
  const toggleWritingSidebar = useModeStore((s) => s.toggleWritingSidebar);

  const matches = snippets.filter((sn) => {
    const content = extractPlainText((sn as any).content);
    const lower = content.toLowerCase();
    return allNames.some((n) => lower.includes(n));
  });

  const handleOpen = (id: string) => {
    setActiveSnippet(id);
    setWritingSidebarTab("snippets");
    const { writingSidebarExpanded } = useModeStore.getState();
    if (!writingSidebarExpanded) toggleWritingSidebar();
  };

  return (
    <div className="p-3 space-y-1">
      {matches.length > 0 ? matches.map((m) => (
        <button
          key={m.id}
          onClick={() => handleOpen(m.id)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
          type="button"
        >
          <MessageSquare className="w-3.5 h-3.5 text-[var(--color-text-dim)] flex-none" />
          <span className="text-[13px] text-[var(--color-text-secondary)] truncate">
            {(m as any).name || "未命名片段"}
          </span>
        </button>
      )) : (
        <p className="text-[12px] text-[var(--color-text-dim)] italic">Snippets 中未找到提及</p>
      )}
    </div>
  );
}

// ── 追踪标签页 — Tracking/Matching + AI Context ──

function TrackingTab({ entry }: { entry: CodexEntry }) {
  const updateCodexEntry = useWritingStore((s) => s.updateCodexEntry);
  const enabled = entry.enabled === 1;
  const trackingConfig = (entry.description._tracking_config as {
    track?: boolean;
    caseSensitive?: boolean;
    exclusions?: string[];
  }) || {};
  const track = trackingConfig.track !== false; // 默认 true
  const caseSensitive = trackingConfig.caseSensitive || false;
  const exclusions: string[] = trackingConfig.exclusions || [];

  const updateTrackingConfig = (patch: Partial<typeof trackingConfig>) => {
    updateCodexEntry(entry.id, {
      description: {
        ...entry.description,
        _tracking_config: { ...trackingConfig, ...patch },
      },
    });
  };

  return (
    <div className="p-3 space-y-5">
      {/* ── 追踪/匹配 ── */}
      <div>
        <SectionHeader label="追踪 / 匹配" />
        <div className="mt-2 space-y-3">
          {/* 按名称追踪 */}
          <div className="flex items-center gap-3">
            <SwitchToggle
              checked={track}
              onChange={(v) => updateTrackingConfig({ track: v })}
            />
            <div>
              <span className="text-[13px] text-[var(--color-text-secondary)]">追踪</span>
              <span className="text-[12px] text-[var(--color-text-dim)]"> 此条目的名称和别名。</span>
            </div>
          </div>

          {/* 大小写敏感 */}
          <div className="flex items-center gap-3">
            <SwitchToggle
              checked={caseSensitive}
              onChange={(v) => updateTrackingConfig({ caseSensitive: v })}
            />
            <span className="text-[12px] text-[var(--color-text-dim)]">
              匹配时区分大小写。
            </span>
          </div>

          {/* 排除词 */}
          <div>
            <p className="text-[11px] text-[var(--color-text-dim)] mb-1.5">
              排除词列表 — 当条目名称或别名是常见词时，这些短语不会触发匹配。
            </p>
            <ExclusionList
              exclusions={exclusions}
              onAdd={(word) => updateTrackingConfig({ exclusions: [...exclusions, word] })}
              onRemove={(word) => updateTrackingConfig({ exclusions: exclusions.filter((w) => w !== word) })}
            />
          </div>
        </div>
      </div>

      {/* ── AI 上下文 ── */}
      <div>
        <SectionHeader label="AI 上下文" />
        <div className="mt-2">
          <AiContextSelector
            value={(entry.description._tracking as string) || "detected"}
            onChange={(val) => updateCodexEntry(entry.id, { description: { ...entry.description, _tracking: val } })}
          />
        </div>
      </div>

      {/* ── 启用状态 ── */}
      <div>
        <SectionHeader label="启用状态" />
        <div className="mt-2 flex items-center gap-3">
          <SwitchToggle
            checked={enabled}
            onChange={(v) => updateCodexEntry(entry.id, { enabled: v ? 1 : 0 })}
          />
          <span className="text-[13px] text-[var(--color-text-secondary)]">
            {enabled ? "已启用" : "已禁用"}
          </span>
        </div>
      </div>

      {/* ── 图谱实体 ── */}
      <div>
        <SectionHeader label="图谱实体" />
        <div className="mt-1 text-[12px] text-[var(--color-text-dim)]">
          {entry.graph_entity_id ? (
            <span className="font-mono">{entry.graph_entity_id}</span>
          ) : (
            <span className="italic">未关联知识图谱</span>
          )}
        </div>
      </div>

      {/* ── 元数据 ── */}
      <div>
        <SectionHeader label="元数据" />
        <div className="mt-1 space-y-1 text-[12px] text-[var(--color-text-dim)]">
          <div>创建时间：{new Date(entry.created_at * 1000).toLocaleString()}</div>
          <div>更新时间：{new Date(entry.updated_at * 1000).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

// ── 开关组件 ──

function SwitchToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-none",
        checked ? "bg-[var(--color-primary)]" : "bg-zinc-700",
      )}
      type="button"
      role="switch"
      aria-checked={checked}
    >
      <div
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

// ── 排除词列表 ──

function ExclusionList({
  exclusions,
  onAdd,
  onRemove,
}: {
  exclusions: string[];
  onAdd: (word: string) => void;
  onRemove: (word: string) => void;
}) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const trimmed = input.trim();
    if (trimmed && !exclusions.includes(trimmed)) {
      onAdd(trimmed);
      setInput("");
    }
  };

  return (
    <div className="space-y-1.5">
      {exclusions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {exclusions.map((word) => (
            <span
              key={word}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-[11px] text-[var(--color-text-secondary)] border border-[var(--color-border)]/30"
            >
              {word}
              <button
                onClick={() => onRemove(word)}
                className="ml-0.5 text-[var(--color-text-dim)] hover:text-red-400 transition-colors cursor-pointer"
                type="button"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          className="flex-1 bg-white/[0.03] border border-[var(--color-border)]/40 rounded-lg px-3 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-dim)] focus:border-zinc-500 transition-colors"
          placeholder="添加排除词…"
        />
        <button
          onClick={handleAdd}
          disabled={!input.trim()}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-[var(--color-border)]/40 text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          type="button"
        >
          添加
        </button>
      </div>
    </div>
  );
}

// ── 提及心跳图 ──

function MentionSparkline({ entry }: { entry: CodexEntry }) {
  const acts = useWritingStore((s) => s.acts);
  const snippets = useWritingStore((s) => s.snippets);
  const allNames = [entry.name, ...entry.aliases].map((n) => n.toLowerCase());
  if (allNames.length === 0 || !allNames[0]) return null;

  // 扫描所有场景，记录提及位置（按字符偏移量）
  let totalChars = 0;
  const mentionOffsets: number[] = [];

  for (const act of acts) {
    for (const ch of (act as any).chapters || []) {
      for (const sc of ch.scenes || []) {
        const content = extractPlainText(sc.content);
        const lower = content.toLowerCase();
        for (const name of allNames) {
          let pos = 0;
          while ((pos = lower.indexOf(name, pos)) !== -1) {
            mentionOffsets.push(totalChars + pos);
            pos += name.length;
          }
        }
        totalChars += content.length;
      }
    }
  }

  // 同时扫描 snippets
  for (const sn of snippets) {
    const content = extractPlainText((sn as any).content);
    const lower = content.toLowerCase();
    for (const name of allNames) {
      let pos = 0;
      while ((pos = lower.indexOf(name, pos)) !== -1) {
        mentionOffsets.push(totalChars + pos);
        pos += name.length;
      }
    }
    totalChars += content.length;
  }

  const mentionCount = mentionOffsets.length;
  if (mentionCount === 0 && totalChars === 0) return null;

  // 生成 polyline points：x 映射到 0~420，y 在 20（基线）和 0（尖峰）之间
  const WIDTH = 420;
  const HEIGHT = 20;
  const points: string[] = [`0,${HEIGHT}`];

  if (mentionCount > 0) {
    // 排序提及位置
    const sorted = [...mentionOffsets].sort((a, b) => a - b);
    // 去重（相近位置的合并为一个尖峰）
    const spikes: number[] = [];
    for (const offset of sorted) {
      const x = Math.round((offset / totalChars) * WIDTH);
      if (spikes.length === 0 || Math.abs(x - spikes[spikes.length - 1]) > 3) {
        spikes.push(x);
      }
    }

    for (const spikeX of spikes) {
      points.push(`${spikeX},${HEIGHT}`);
      points.push(`${spikeX + 0.6},0`);
      points.push(`${spikeX + 1.2},0`);
      points.push(`${spikeX + 1.8},${HEIGHT}`);
    }
  }

  points.push(`${WIDTH},${HEIGHT}`);

  return (
    <div className="px-3 pb-1 -mt-1">
      <div className="flex items-center gap-3 w-full">
        <svg
          className="grow w-full"
          height={HEIGHT}
          viewBox={`-2 -2 ${WIDTH + 4} ${HEIGHT + 4}`}
          preserveAspectRatio="none"
        >
          <polyline
            fill="url(#codex-grad)"
            className="stroke-zinc-600"
            strokeWidth="1"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.join(" ")}
          />
          <defs>
            <linearGradient id="codex-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="rgb(63,63,70)" />
              <stop offset="1" stopColor="rgb(24,24,27)" />
            </linearGradient>
          </defs>
        </svg>
        <span className="flex-none text-[11px] text-[var(--color-text-dim)] tabular-nums whitespace-nowrap">
          {mentionCount} 次提及
        </span>
      </div>
    </div>
  );
}

// ── 通用子组件 ──

function SectionHeader({ label }: { label: string }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">{label}</h3>
  );
}

function TagList({ tags, onAdd, onRemove, placeholder }: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed);
      setInput("");
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-[11px] text-[var(--color-text-secondary)] border border-[var(--color-border)]/30"
        >
          <Tag className="w-2.5 h-2.5 text-[var(--color-text-dim)]" />
          {tag}
          <button
            onClick={() => onRemove(tag)}
            className="ml-0.5 text-[var(--color-text-dim)] hover:text-red-400 transition-colors cursor-pointer"
            type="button"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
        onBlur={handleAdd}
        className="flex-1 min-w-[80px] bg-transparent text-[12px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-dim)]"
        placeholder={placeholder || "添加…"}
      />
    </div>
  );
}

function AiContextSelector({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  return (
    <div className="space-y-1">
      {AI_CONTEXT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "w-full flex items-start gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors cursor-pointer",
            value === opt.value
              ? "bg-white/5 border border-[var(--color-border)]/50"
              : "hover:bg-white/3 border border-transparent",
          )}
          type="button"
        >
          <div
            className={cn(
              "mt-0.5 w-3 h-3 rounded-full border-2 flex-none flex items-center justify-center",
              value === opt.value ? "border-[var(--color-primary)]" : "border-zinc-600",
            )}
          >
            {value === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />}
          </div>
          <div>
            <div className="text-[12px] font-medium text-[var(--color-text-secondary)]">{opt.label}</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">{opt.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
