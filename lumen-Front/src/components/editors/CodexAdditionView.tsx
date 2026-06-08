import { useCallback, useMemo, useRef } from "react";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useWritingStore } from "../../stores/useWritingStore";
import type { CodexEntry } from "../../api/writing";
import { FileText } from "lucide-react";
import { TYPE_ICONS } from "../../modes/writing/codex-shared";
import { GripDotsIcon, useBlockDrag } from "./BlockDragHandle";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";

const menuContentCls = "!bg-surface-deep !text-text-primary !border-border-default !rounded-md !p-0 shadow-[0_0_0_1px_#3f3f46,0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)]";
const itemCls = "!px-4 !py-1.5 !text-[14px] !gap-3";

const FIELD_LABELS: Record<string, string> = {
  description: "Description",
};

function entryFields(entry: CodexEntry): { key: string; label: string }[] {
  const fields: { key: string; label: string }[] = [
    { key: "description", label: "Description" },
  ];
  if (entry.custom_fields && typeof entry.custom_fields === "object") {
    for (const key of Object.keys(entry.custom_fields)) {
      if (!fields.find(f => f.key === key)) {
        fields.push({ key, label: key });
      }
    }
  }
  return fields;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
      className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}>
      <path d="M4.5 2.5L8 6L4.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CodexAdditionView({
  node,
  updateAttributes,
  deleteNode,
  editor,
  getPos,
}: NodeViewProps) {
  const entryId = (node.attrs.entryId as string) ?? "";
  const field = (node.attrs.field as string) ?? "description";
  const mode = (node.attrs.mode as "add" | "replace") ?? "add";
  const collapsed = Boolean(node.attrs.collapsed);

  const wrapperRef = useRef<HTMLDivElement>(null);

  const codexEntries = useWritingStore((s) => s.codexEntries ?? []);

  const entry = useMemo(
    () => codexEntries.find((e: CodexEntry) => e.id === entryId),
    [codexEntries, entryId]
  );

  const fields = useMemo(
    () => (entry ? entryFields(entry) : []),
    [entry]
  );

  const fieldLabel = FIELD_LABELS[field] ?? field;
  const hasEntry = !!entry;

  const handleSelectEntry = useCallback(
    (id: string) => updateAttributes({ entryId: id }),
    [updateAttributes]
  );

  const handleSetField = useCallback(
    (key: string) => updateAttributes({ field: key }),
    [updateAttributes]
  );

  const handleToggleMode = useCallback(
    () => updateAttributes({ mode: mode === "add" ? "replace" : "add" }),
    [mode, updateAttributes]
  );

  const handleToggleCollapsed = useCallback(
    () => updateAttributes({ collapsed: !collapsed }),
    [collapsed, updateAttributes]
  );

  const handleDelete = useCallback(() => deleteNode(), [deleteNode]);

  const handleDragStart = useBlockDrag(editor, getPos, wrapperRef, ".codex-addition");

  return (
    <NodeViewWrapper ref={wrapperRef}>
      <div className={`codex-addition ${collapsed ? "codex-addition-collapsed" : ""}`}>
        <div className="codex-addition-header" contentEditable={false}>
          <span
            className="block-drag-handle"
            onMouseDown={handleDragStart}
          >
            <GripDotsIcon />
          </span>
          <button onClick={handleToggleCollapsed} className="codex-addition-collapse" title={collapsed ? "展开" : "折叠"}>
            <ChevronIcon open={!collapsed} />
          </button>
          <svg className="codex-addition-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.5.5 0 00-.25.433v15a.5.5 0 00.5.5.5.5 0 00.25-.066A8.735 8.735 0 016 18.695a7.5 7.5 0 015.25 1.906V4.533zM12.75 20.601a7.5 7.5 0 015.25-1.906c.872 0 1.725.118 2.5.345V3.988a.5.5 0 00-.25-.433A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v15.068z" clipRule="evenodd" />
          </svg>
          <span className="codex-addition-label">
            {mode === "add" ? "Add to:" : "Replace:"} {hasEntry ? fieldLabel : "Codex Addition"}
          </span>

          {/* Entry name — clickable, opens CodexPreviewCard */}
          {hasEntry && (
            <span
              className="codex-addition-entry-name"
              data-codex-entry-id={entryId}
              role="button"
              tabIndex={0}
              style={{ marginLeft: "auto" }}
            >
              {TYPE_ICONS[entry.type] || <FileText className="w-3.5 h-3.5 opacity-70" />}
              {entry.name}
            </span>
          )}

          {/* Select dropdown — always visible */}
          <DropdownMenu>
            <DropdownMenuTrigger className={`codex-addition-entry-select ${!hasEntry ? "ml-auto" : ""}`}>
              Select
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className={`min-w-[200px] max-h-[300px] overflow-y-auto p-0 ${menuContentCls}`}>
              {codexEntries.map((e: CodexEntry) => (
                <DropdownMenuItem
                  key={e.id}
                  onClick={() => handleSelectEntry(e.id)}
                  className={itemCls}
                >
                  {e.name}
                  <span className="ml-auto text-xs text-text-dim">{e.type}</span>
                </DropdownMenuItem>
              ))}
              {codexEntries.length === 0 && (
                <div className="px-4 py-2 text-xs text-text-dim">No codex entries</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Menu — 选中条目后才显示 */}
          {hasEntry && (
            <DropdownMenu>
              <DropdownMenuTrigger className="codex-addition-menu-trigger">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="8" cy="13" r="1.5" />
                </svg>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className={`min-w-[200px] p-0 ${menuContentCls}`}>
                {fields.map((f) => (
                  <DropdownMenuCheckboxItem
                    key={f.key}
                    checked={field === f.key}
                    onCheckedChange={() => handleSetField(f.key)}
                    className={itemCls}
                  >
                    {f.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator className="!bg-surface-elevated" />
                <DropdownMenuItem onClick={handleToggleMode} className={itemCls}>
                  {mode === "add" ? "Replace, not add" : "Add, not replace"}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="!bg-surface-elevated" />
                <DropdownMenuItem onClick={handleDelete} className={`${itemCls} text-red-400`}>
                  Delete this addition
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {hasEntry && (
          <NodeViewContent className={`codex-addition-content ${collapsed ? "codex-addition-content-hidden" : ""}`} />
        )}
      </div>
    </NodeViewWrapper>
  );
}
