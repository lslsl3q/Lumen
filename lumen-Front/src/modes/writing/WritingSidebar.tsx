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
  HelpCircle,
  BookMarked,
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

/* ── Codex 条目分类 ── */

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

/* ── Sidebar ── */

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
        "flex-none flex flex-col border-r border-gray-800 overflow-hidden",
        "bg-gray-950"
      )}
      style={{ width: expanded ? 400 : 48 }}
      aria-label="Sidebar"
    >
      {/* Header h-14 */}
      <div className="flex-none h-14 flex items-center gap-1 px-2 border-b border-gray-800">
        <SidebarIconButton icon={ArrowLeft} label="返回" />
        <SidebarIconButton icon={Settings} label="设置" />
        {expanded && (
          <button
            onClick={toggleWritingSidebar}
            className="ml-auto"
            aria-label="Collapse Sidebar"
          >
            <PanelLeftClose className="w-4 h-4 text-stone-400" />
          </button>
        )}
      </div>

      {/* Tab bar (展开态) */}
      {expanded && (
        <div className="flex-none h-12 flex items-center gap-2 px-2 border-b border-gray-800 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setWritingSidebarTab(tab.id)}
              className={cn(
                "px-3 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-stone-300/20 text-stone-300"
                  : "text-stone-400 hover:text-stone-300"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content (展开态) */}
      {expanded && (
        <div className="grow overflow-hidden flex flex-col">
          <SidebarContent tab={activeTab} />
        </div>
      )}

      {/* 折叠态：图标列表 */}
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

      {/* 底栏 (展开态) — 匹配 NC */}
      {expanded && <SidebarFooter />}

      {/* 折叠态：展开按钮 */}
      {!expanded && (
        <div className="flex-none p-2 flex flex-col items-center gap-1 border-t border-gray-800">
          <SidebarIconButton icon={HelpCircle} label="帮助" />
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
        "w-10 h-10 flex items-center justify-center rounded transition-colors",
        "hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-600",
        active && "bg-gray-800 text-stone-300",
        !active && "text-stone-400"
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
        <div className="p-3 text-sm text-stone-400">便签/片段面板（待实现）</div>
      );
    case "chat":
      return (
        <div className="p-3 text-sm text-stone-400">Chat 面板（待实现）</div>
      );
  }
}

/* ── CodexPanel — 分类折叠列表 ── */

function CodexPanel() {
  const settings = useWritingStore((s) => s.settings);
  const createSetting = useWritingStore((s) => s.createSetting);
  const activeProjectId = useWritingStore((s) => s.activeProjectId);

  // 按分类分组
  const grouped = CODEX_CATEGORIES.map((cat) => ({
    ...cat,
    items: settings.filter((s) => s.category === cat.id),
  }));

  // 统计总数
  const totalSettings = settings.length;

  return (
    <div className="flex flex-col h-full">
      {/* 工具行：排序 + 新建 */}
      <div className="flex-none flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-[11px] text-stone-500">{totalSettings} 条目</span>

        {/* New Entry 按钮 + 下拉 */}
        <Popover>
          <PopoverTrigger
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[12px] font-medium text-stone-300 hover:bg-gray-800 transition-colors cursor-pointer"
            type="button"
          >
            <Plus className="w-3.5 h-3.5" />
            新建
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-48 p-1 bg-gray-900 border-gray-800 rounded-lg shadow-xl"
          >
            {NEW_ENTRY_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={async () => {
                  if (!activeProjectId) return;
                  await createSetting(`新${t.label}`, t.id, null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-300 hover:bg-gray-800 rounded transition-colors"
                type="button"
              >
                <t.icon className="w-4 h-4 text-stone-500" />
                {t.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* 分类折叠列表 */}
      <div className="flex-1 overflow-y-auto">
        {grouped.map((cat) => (
          <CodexCategory
            key={cat.id}
            label={cat.label}
            icon={cat.icon}
            items={cat.items}
          />
        ))}
      </div>
    </div>
  );
}

/* ── CodexCategory — 可折叠分类 ── */

function CodexCategory({
  label,
  icon: Icon,
  items,
}: {
  label: string;
  icon: React.ElementType;
  items: { id: string; name: string; content: Record<string, unknown> }[];
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border-b border-gray-800/60">
      {/* 分类头 */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-900 transition-colors"
        type="button"
      >
        <Icon className="w-3.5 h-3.5 text-stone-500 flex-none" />
        <span className="text-[13px] font-semibold text-stone-200 truncate">
          {label}
        </span>
        <span className="ml-auto text-[10px] text-stone-500 flex-none">
          {items.length} 条
        </span>
        {open ? (
          <ChevronDown className="w-3 h-3 text-stone-500 flex-none" />
        ) : (
          <ChevronRight className="w-3 h-3 text-stone-500 flex-none" />
        )}
      </button>

      {/* 条目列表 */}
      {open && items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-900 cursor-pointer transition-colors"
            >
              <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center flex-none">
                <Icon className="w-3.5 h-3.5 text-stone-500" />
              </div>
              <span className="text-[13px] text-stone-300 truncate">
                {item.name}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && items.length === 0 && (
        <div className="px-3 py-3 text-[11px] text-stone-600 text-center">
          暂无条目
        </div>
      )}
    </div>
  );
}

/* ── SidebarFooter — 底栏 ── */

function SidebarFooter() {
  const saveStatus = useWritingStore((s) => s.saveStatus);

  const savedLabel = saveStatus === "saved" ? "已保存" : saveStatus === "saving" ? "保存中…" : "未保存";

  return (
    <div className="flex-none h-14 flex items-center gap-2 px-3 border-t border-gray-800 bg-gray-950">
      <button
        className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-stone-400 hover:text-stone-300 hover:bg-gray-800 rounded transition-colors"
        type="button"
        aria-label="帮助"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        <span>帮助</span>
      </button>
      <button
        className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-stone-400 hover:text-stone-300 hover:bg-gray-800 rounded transition-colors"
        type="button"
        aria-label="导出"
      >
        <BookMarked className="w-3.5 h-3.5" />
        <span>导出</span>
      </button>
      <div className="ml-auto flex items-center gap-1.5 text-[11px] text-stone-500">
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
