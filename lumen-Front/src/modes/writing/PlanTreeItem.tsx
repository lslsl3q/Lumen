import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface PlanTreeItemProps {
  id: string;
  type: "act" | "chapter" | "scene";
  title: string;
  children?: React.ReactNode;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onDelete?: () => void;
}

export function PlanTreeItem({
  id,
  type,
  title,
  children,
  isExpanded,
  onToggleExpand,
  onDelete,
}: PlanTreeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const indentClass =
    type === "chapter" ? "ml-6" : type === "scene" ? "ml-12" : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${indentClass} border-b border-border-default/50`}
    >
      <div className="flex items-center gap-2 py-2 px-2 hover:bg-surface-elevated/50 rounded group">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-text-muted hover:text-text-secondary"
          title="Drag to reorder"
          type="button"
        >
          <GripVertical size={14} />
        </button>
        {onToggleExpand && (
          <button
            onClick={onToggleExpand}
            className="text-text-muted text-xs w-4 cursor-pointer"
            type="button"
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        )}
        {!onToggleExpand && <span className="w-4" />}
        <span className="flex-1 text-sm text-text-primary truncate">
          {title || `Untitled ${type}`}
        </span>
        <span className="text-[10px] text-text-muted uppercase">{type}</span>
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer text-[11px]"
            type="button"
          >
            Delete
          </button>
        )}
      </div>
      {children && <div>{children}</div>}
    </div>
  );
}
