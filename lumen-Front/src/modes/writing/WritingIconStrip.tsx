/**
 * WritingIconStrip — 写作模式右侧图标条（flex 子元素）
 *
 * 始终在布局最右侧，宽度 48px，纯图标 + tooltip。
 * 面板在图标条左侧展开，不是全局 active bar（那是跨模式导航）。
 */
import {
  FileText, BookOpen, User, MapPin, Globe, Package,
  ListTree, FileOutput, MessageSquare, History,
} from "lucide-react";

export type WritingPanelType =
  | "chapters" | "project" | "characters" | "locations"
  | "world" | "items" | "outline" | "export" | "snapshots" | "chat" | null;

interface WritingIconStripProps {
  activePanel: WritingPanelType;
  onToggle: (panel: WritingPanelType) => void;
}

/** 顶部区域：内容导航 */
const TOP_ICONS: {
  id: WritingPanelType;
  icon: typeof FileText;
  label: string;
}[] = [
  { id: "chapters", icon: FileText, label: "章节列表" },
  { id: "project", icon: BookOpen, label: "作品管理" },
];

/** 中间区域：世界观设定 */
const MIDDLE_ICONS: {
  id: WritingPanelType;
  icon: typeof FileText;
  label: string;
}[] = [
  { id: "characters", icon: User, label: "人物设定" },
  { id: "locations", icon: MapPin, label: "地点设定" },
  { id: "world", icon: Globe, label: "世界设定" },
  { id: "items", icon: Package, label: "物品设定" },
  { id: "outline", icon: ListTree, label: "大纲" },
];

/** 底部区域：工具 */
const BOTTOM_ICONS: {
  id: WritingPanelType;
  icon: typeof FileText;
  label: string;
}[] = [
  { id: "export", icon: FileOutput, label: "导出" },
  { id: "snapshots", icon: History, label: "快照管理" },
  { id: "chat", icon: MessageSquare, label: "AI 聊天" },
];

function IconBtn({ id, icon: Icon, label, isActive, onToggle }: {
  id: WritingPanelType;
  icon: typeof FileText;
  label: string;
  isActive: boolean;
  onToggle: (panel: WritingPanelType) => void;
}) {
  return (
    <button
      onClick={() => onToggle(isActive ? null : id)}
      title={label}
      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors cursor-pointer
        ${isActive
          ? "bg-primary/15 text-primary"
          : "text-slate-600 hover:text-slate-300 hover:bg-surface-elevated"
        }`}
    >
      <Icon className="w-[18px] h-[18px]" />
    </button>
  );
}

export function WritingIconStrip({ activePanel, onToggle }: WritingIconStripProps) {
  return (
    <div className="w-12 flex flex-col items-center py-3 bg-surface-deep/95 backdrop-blur-sm border-l border-border-default select-none">
      {/* 顶部：章节 + 作品管理 */}
      <div className="flex flex-col gap-0.5">
        {TOP_ICONS.map((item) => (
          <IconBtn key={item.id} {...item} isActive={activePanel === item.id} onToggle={onToggle} />
        ))}
      </div>

      {/* 分割线 */}
      <div className="w-5 h-px bg-border-default my-2" />

      {/* 中间：世界观设定 */}
      <div className="flex flex-col gap-0.5">
        {MIDDLE_ICONS.map((item) => (
          <IconBtn key={item.id} {...item} isActive={activePanel === item.id} onToggle={onToggle} />
        ))}
      </div>

      {/* 弹性空白推到底部 */}
      <div className="flex-1" />

      {/* 底部：导出 */}
      <div className="flex flex-col gap-0.5">
        {BOTTOM_ICONS.map((item) => (
          <IconBtn key={item.id} {...item} isActive={activePanel === item.id} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}
