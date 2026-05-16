import { cn } from "../../lib/utils";
import { useModeStore } from "../../stores/useModeStore";
import {
  ArrowLeftToLine,
  BookOpen,
  StickyNote,
  MessagesSquare,
  Settings,
  ArrowLeft,
  PanelLeftClose,
} from "lucide-react";

type SidebarTab = "codex" | "snippets" | "chat";

const tabs: { id: SidebarTab; label: string; icon: React.ElementType }[] = [
  { id: "codex", label: "Codex", icon: BookOpen },
  { id: "snippets", label: "Snippets", icon: StickyNote },
  { id: "chat", label: "Chats", icon: MessagesSquare },
];

export function WritingSidebar() {
  const {
    writingSidebarExpanded: expanded,
    writingSidebarTab: activeTab,
    toggleWritingSidebar,
    setWritingSidebarTab,
  } = useModeStore();

  const COLLPASED_W = 48;
  const EXPANDED_W = 400;

  return (
    <aside
      className={cn(
        "flex-none flex flex-col border-r border-gray-800 overflow-hidden transition-all duration-200",
        "bg-gray-950"
      )}
      style={{ width: expanded ? EXPANDED_W : COLLPASED_W }}
      aria-label="Sidebar"
    >
      {/* Header */}
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

      {/* 折叠态：展开按钮 */}
      {!expanded && (
        <div className="flex-none p-2 flex justify-center">
          <SidebarIconButton
            icon={ArrowLeftToLine}
            label="展开侧边栏"
            onClick={toggleWritingSidebar}
          />
        </div>
      )}
    </aside>
  );
}

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

function SidebarContent({ tab }: { tab: SidebarTab }) {
  switch (tab) {
    case "codex":
      return <div className="p-3 text-sm text-stone-400">角色/世界观面板（待实现）</div>;
    case "snippets":
      return <div className="p-3 text-sm text-stone-400">便签/片段面板（待实现）</div>;
    case "chat":
      return <div className="p-3 text-sm text-stone-400">Chat 面板（待实现）</div>;
  }
}
