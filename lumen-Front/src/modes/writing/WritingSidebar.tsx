import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";
import { useModeStore } from "../../stores/useModeStore";
import { useWritingStore } from "../../stores/useWritingStore";
import {
  ArrowLeftToLine,
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
  Search,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../../components/ui/popover";

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
      style={{ width: expanded ? 450 : 48, transition: "width 0.2s ease" }}
      aria-label="Sidebar"
    >
      {/* Novel title bar */}
      {expanded ? <SidebarHeader onCollapse={toggleWritingSidebar} /> : (
        <div className="flex-none h-14 flex items-center justify-center border-b border-[var(--color-border)]">
          <BookOpen className="w-4 h-4 text-[var(--color-text-dim)]" />
        </div>
      )}

      {/* Tabs */}
      {expanded && (
        <div className="flex-none h-11 flex items-center gap-0 px-2 border-b border-[var(--color-border)]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setWritingSidebarTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={cn(
                "flex-1 py-1.5 text-[13px] font-medium text-center transition-colors rounded",
                activeTab === tab.id
                  ? "text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]"
              )}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {expanded && (
        <div className="grow overflow-hidden flex flex-col">
          <SidebarContent tab={activeTab} />
        </div>
      )}

      {/* Collapsed: icon list */}
      {!expanded && (
        <div className="grow flex flex-col items-center gap-1 py-2">
          {tabs.map((tab) => (
            <SidebarIconButton
              key={tab.id}
              icon={tab.icon}
              label={tab.label}
              onClick={() => setWritingSidebarTab(tab.id)}
              active={activeTab === tab.id}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      {expanded && <SidebarFooter />}
      {!expanded && (
        <div className="flex-none p-2 flex flex-col items-center gap-1 border-t border-[var(--color-border)]">
          <SidebarIconButton
            icon={ArrowLeftToLine}
            label="展开侧边栏"
            onClick={toggleWritingSidebar}
          />
        </div>
      )}
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
      return (
        <div className="p-3 text-sm text-[var(--color-text-dim)]">便签/片段面板（待实现）</div>
      );
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
      {/* Search + New */}
      <div className="flex-none flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)]">
        <div className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-[var(--color-border)]">
          <Search className="w-3.5 h-3.5 text-[var(--color-text-dim)] flex-none" />
          <input
            className="flex-1 bg-transparent text-[12px] text-[var(--color-text-secondary)] outline-none placeholder:text-[var(--color-text-dim)]"
            placeholder="Search all entries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Popover>
          <PopoverTrigger
            className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium text-[var(--color-text-muted)] hover:bg-white/5 transition-colors cursor-pointer"
            type="button"
          >
            <Plus className="w-3.5 h-3.5" />
            New Entry
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-48 p-1 bg-[var(--color-surface-deep)] border-[var(--color-border)] rounded-lg shadow-xl"
          >
            {NEW_ENTRY_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={async () => {
                  if (!activeProjectId) return;
                  await createSetting(`新${t.label}`, t.id, null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--color-text-secondary)] hover:bg-white/5 rounded transition-colors"
                type="button"
              >
                <t.icon className="w-3.5 h-3.5 text-[var(--color-text-dim)]" />
                {t.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* Category list */}
      <div className="flex-1 overflow-y-auto">
        {grouped.map((cat) => (
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
    <div className="border-b border-[var(--color-border)]/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
        type="button"
      >
        <Icon className="w-3.5 h-3.5 text-[var(--color-text-dim)] flex-none" />
        <span className="text-[12px] font-semibold text-[var(--color-text-secondary)] truncate">
          {label}
        </span>
        <span className="ml-auto text-[10px] text-[var(--color-text-dim)] flex-none">
          {items.length} {items.length === 1 ? "entry" : "entries"}
        </span>
        {open ? (
          <ChevronDown className="w-3 h-3 text-[var(--color-text-dim)] flex-none" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[var(--color-text-dim)] flex-none" />
        )}
      </button>

      {open && (
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
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 cursor-pointer transition-colors text-left"
            type="button"
          >
            <Plus className="w-3 h-3" />
            Add entry
          </button>
        </div>
      )}
    </div>
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
