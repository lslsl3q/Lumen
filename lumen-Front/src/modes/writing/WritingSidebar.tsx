import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";
import { useModeStore } from "../../stores/useModeStore";
import { useWritingStore } from "../../stores/useWritingStore";
import {
  BookOpen,
  StickyNote,
  MessagesSquare,
  Settings,
  ArrowLeft,
  PanelLeftClose,
  Plus,
  ChevronDown,
  ChevronRight,
  User,
  MapPin,
  ScrollText,
  Lightbulb,
  Package,
  BookMarked,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../../components/ui/collapsible";
import { SnippetsPanel } from "./SnippetsPanel";
import { SidebarToolbar } from "./SidebarToolbar";

type SidebarTab = "codex" | "snippets" | "chat";

const tabs: { id: SidebarTab; label: string; icon: React.ElementType }[] = [
  { id: "codex", label: "Codex", icon: BookOpen },
  { id: "snippets", label: "Snippets", icon: StickyNote },
  { id: "chat", label: "Chats", icon: MessagesSquare },
];

const CODEX_CATEGORIES = [
  { id: "character", label: "Characters", icon: User },
  { id: "location", label: "Locations", icon: MapPin },
  { id: "lore", label: "Lore", icon: ScrollText },
  { id: "object", label: "Objects", icon: Package },
  { id: "subplot", label: "Subplots", icon: Lightbulb },
  { id: "other", label: "Other", icon: BookMarked },
];

const NEW_ENTRY_TYPES = [
  { id: "character", label: "Character", icon: User },
  { id: "location", label: "Location", icon: MapPin },
  { id: "object", label: "Object/Item", icon: Package },
  { id: "lore", label: "Lore", icon: ScrollText },
  { id: "subplot", label: "Subplot", icon: Lightbulb },
  { id: "other", label: "Other", icon: BookMarked },
];

export const WritingSidebar = forwardRef<HTMLElement>((_props, ref) => {
  const {
    writingSidebarExpanded: expanded,
    writingSidebarTab: activeTab,
    toggleWritingSidebar,
    setWritingSidebarTab,
  } = useModeStore();

  return (
    <aside
      ref={ref}
      className={cn(
        "flex-none flex flex-col border-r border-[var(--color-border)] overflow-hidden",
        "bg-[var(--color-surface-deep)]"
      )}
      style={{ width: expanded ? 450 : 128, "--sidebar-width": `${expanded ? 450 : 128}px`, transition: "width 0.2s ease" } as React.CSSProperties}
      aria-label="Sidebar"
    >
      {/* Novel title bar */}
      {expanded ? <SidebarHeader onCollapse={toggleWritingSidebar} /> : (
        <div className="flex-none h-14 flex items-center justify-center border-b border-[var(--color-border)]">
          <BookOpen className="w-4 h-4 text-[var(--color-text-dim)]" />
        </div>
      )}

      {/* Tabs — expanded: horizontal, collapsed: vertical, same button style */}
      <div className={cn(
        "flex-none border-b border-[var(--color-border)]",
        expanded
          ? "h-11 flex items-center gap-1 px-2"
          : "flex flex-col items-center gap-1 py-2 px-2"
      )}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setWritingSidebarTab(tab.id);
                useWritingStore.getState().setActiveSnippet(null);
              }}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={cn(
                "flex items-center gap-1.5 py-1.5 px-3 rounded text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                expanded && "flex-1 justify-center",
                activeTab === tab.id
                  ? "text-[var(--color-text-primary)] bg-white/5"
                  : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/5"
              )}
              type="button"
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {expanded && (
        <div className="grow overflow-hidden flex flex-col">
          <SidebarContent tab={activeTab} />
        </div>
      )}

      {/* Footer */}
      {expanded && <SidebarFooter />}
    </aside>
  );
});

/* ── SidebarHeader — novel title + actions ── */

function SidebarHeader({ onCollapse }: { onCollapse: () => void }) {
  const project = useWritingStore((s) => s.getActiveProject());

  return (
    <div className="flex-none h-14 flex items-center gap-2 px-3 border-b border-[var(--color-border)]">
      <SidebarIconButton icon={ArrowLeft} label="返回" />
      <SidebarIconButton icon={Settings} label="设置" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--color-text-secondary)] truncate">
          {project?.name || "未选择作品"}
        </p>
      </div>
      <button
        onClick={onCollapse}
        className="flex items-center justify-center w-7 h-7 rounded hover:bg-white/5 transition-colors"
        aria-label="Collapse Sidebar"
        type="button"
      >
        <PanelLeftClose className="w-4 h-4 text-[var(--color-text-dim)]" />
      </button>
    </div>
  );
}

/* ── SidebarIconButton ── */

function SidebarIconButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded transition-colors",
        "hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[var(--color-border)]",
        active && "bg-white/5 text-[var(--color-text-muted)]",
        !active && "text-[var(--color-text-dim)]"
      )}
      aria-label={label}
      title={label}
      type="button"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

/* ── SidebarContent ── */

function SidebarContent({ tab }: { tab: SidebarTab }) {
  switch (tab) {
    case "codex":
      return <CodexPanel />;
    case "snippets":
      return <SnippetsPanel />;
    case "chat":
      return (
        <div className="p-3 text-sm text-[var(--color-text-dim)]">Chat 面板（待实现）</div>
      );
  }
}

/* ── CodexPanel ── */

function CodexPanel() {
  const settings = useWritingStore((s) => s.settings);
  const createSetting = useWritingStore((s) => s.createSetting);
  const activeProjectId = useWritingStore((s) => s.activeProjectId);
  const [search, setSearch] = useState("");

  const filtered = search
    ? settings.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase())
      )
    : settings;

  const grouped = CODEX_CATEGORIES.map((cat) => ({
    ...cat,
    items: filtered.filter((s) => s.category === cat.id),
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — search | filter | New Entry | display */}
      <SidebarToolbar search={search} onSearchChange={setSearch} placeholder="搜索所有条目…">
        <button
          className="size-7 flex items-center justify-center rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/5 transition-colors"
          type="button"
          title="筛选"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 9h10M10 14h4M12 19" />
          </svg>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--color-border)] text-[11px] font-medium text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            新建条目
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {NEW_ENTRY_TYPES.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onClick={async () => {
                  if (!activeProjectId) return;
                  await createSetting(`新${t.label}`, t.id, null);
                }}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          className="size-7 flex items-center justify-center rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/5 transition-colors"
          type="button"
          title="Display settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </SidebarToolbar>

      {/* Category list — only show categories with items */}
      <div className="flex-1 overflow-y-auto">
        {grouped.filter((cat) => cat.items.length > 0).map((cat) => (
          <CodexCategory
            key={cat.id}
            label={cat.label}
            icon={cat.icon}
            items={cat.items}
            onAdd={async () => {
              if (!activeProjectId) return;
              await createSetting(`新${cat.label}`, cat.id, null);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── CodexCategory ── */

function CodexCategory({
  label,
  icon: Icon,
  items,
  onAdd,
}: {
  label: string;
  icon: React.ElementType;
  items: { id: string; name: string }[];
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-[var(--color-border)]/50">
      <div className="flex items-center gap-2 px-3 py-2">
        <CollapsibleTrigger className="flex items-center gap-2 flex-1 min-w-0 hover:bg-white/5 rounded transition-colors text-left">
          <Icon className="w-3.5 h-3.5 text-[var(--color-text-dim)] flex-none" />
          <span className="text-[12px] font-semibold text-[var(--color-text-secondary)] truncate">
            {label}
          </span>
          <span className="text-[10px] text-[var(--color-text-dim)] flex-none">
            {items.length} {items.length === 1 ? "entry" : "entries"}
          </span>
          {open ? (
            <ChevronDown className="w-3 h-3 text-[var(--color-text-dim)] flex-none" />
          ) : (
            <ChevronRight className="w-3 h-3 text-[var(--color-text-dim)] flex-none" />
          )}
        </CollapsibleTrigger>
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/5 rounded transition-colors flex-none"
          type="button"
        >
          <Plus className="w-3 h-3" />
          Add entry
        </button>
      </div>

      <CollapsibleContent>
        <div className="pb-1">
          {items.map((item) => (
            <button
              key={item.id}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 cursor-pointer transition-colors text-left"
              type="button"
            >
              <div className="w-7 h-7 rounded bg-white/5 flex items-center justify-center flex-none">
                <Icon className="w-3 h-3 text-[var(--color-text-dim)]" />
              </div>
              <span className="text-[12px] text-[var(--color-text-muted)] truncate">
                {item.name}
              </span>
            </button>
          ))}
          {items.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-[var(--color-text-dim)] text-center">
              暂无条目
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ── SidebarFooter ── */

function SidebarFooter() {
  const saveStatus = useWritingStore((s) => s.saveStatus);
  const savedLabel = saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved";

  return (
    <div className="flex-none h-14 flex items-center gap-2 px-3 border-t border-[var(--color-border)] bg-[var(--color-surface-deep)]">
      <button
        className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/5 rounded transition-colors"
        type="button"
        aria-label="导出"
      >
        <BookMarked className="w-3.5 h-3.5" />
        <span>Export</span>
      </button>
      <div className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--color-text-dim)]">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full flex-none",
            saveStatus === "saved" && "bg-green-500",
            saveStatus === "saving" && "bg-yellow-500 animate-pulse",
            saveStatus === "error" && "bg-red-500"
          )}
        />
        {savedLabel}
      </div>
    </div>
  );
}
