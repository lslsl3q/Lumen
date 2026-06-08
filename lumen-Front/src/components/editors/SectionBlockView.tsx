/**
 * SectionBlockView — Section 块的 React NodeView
 *
 * NC-aligned: 可折叠、可命名、可拖拽的纯内容容器。
 * 不涉及 AI 生成逻辑。
 */
import { useCallback, useRef } from "react";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { GripDotsIcon, useBlockDrag } from "./BlockDragHandle";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { SECTION_COLORS, type SectionColor } from "./SectionBlockNode";

/* ── Color display map ── */
const COLOR_MAP: Record<SectionColor, string> = {
  "": "var(--color-text-dim)",
  black: "#18181b",
  gray: "#71717a",
  brown: "#92400e",
  orange: "#ea580c",
  yellow: "#ca8a04",
  green: "#16a34a",
  blue: "#2563eb",
  purple: "#9333ea",
  pink: "#db2777",
  red: "#dc2626",
};

const COLOR_LABELS: Record<SectionColor, string> = {
  "": "Default",
  black: "Black",
  gray: "Gray",
  brown: "Brown",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
  red: "Red",
};

/* ── Icons ── */

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path d="M4.5 2.5L8 6L4.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DotsVerticalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  );
}

/* ── NC-aligned menu styling (same as BeatContextMenu) ── */
const menuContentCls =
  "!bg-surface-deep !text-text-primary !border-border-default !rounded-md !p-0 shadow-[0_0_0_1px_#3f3f46,0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)]";
const separatorCls = "!bg-surface-elevated";
const itemCls = "!px-4 !py-1.5 !text-[14px] !gap-3";

/* ── Main Component ── */

export function SectionBlockView({
  node,
  updateAttributes,
  deleteNode: _deleteNode,
  editor,
  getPos,
}: NodeViewProps) {
  const title = (node.attrs.title as string) ?? "";
  const collapsed = Boolean(node.attrs.collapsed);
  const hideFromAI = Boolean(node.attrs.hideFromAI);
  const hideFromCount = Boolean(node.attrs.hideFromCount);
  const color = (node.attrs.color as SectionColor) ?? "";
  const variant = (node.attrs.variant as "section" | "note") ?? "section";

  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useBlockDrag(editor, getPos, wrapperRef, ".section-block");

  const handleToggleCollapsed = useCallback(() => {
    updateAttributes({ collapsed: !collapsed });
  }, [collapsed, updateAttributes]);

  /** Toggle AI inclusion. When excluding from AI, also exclude from word count. */
  const handleToggleAI = useCallback(() => {
    const nextHideFromAI = !hideFromAI;
    const updates: Record<string, unknown> = { hideFromAI: nextHideFromAI };
    if (nextHideFromAI) {
      updates.hideFromCount = true;
    }
    updateAttributes(updates);
  }, [hideFromAI, updateAttributes]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateAttributes({ title: e.target.value });
    },
    [updateAttributes]
  );

  /** Toggle hideFromCount (word count exclusion) */
  const handleToggleCount = useCallback(() => {
    updateAttributes({ hideFromCount: !hideFromCount });
  }, [hideFromCount, updateAttributes]);

  /** Set color label */
  const handleSetColor = useCallback(
    (c: SectionColor) => {
      updateAttributes({ color: c });
    },
    [updateAttributes]
  );

  /** Copy section content (plain text) to clipboard */
  const handleCopyContent = useCallback(() => {
    const text = node.textContent ?? "";
    navigator.clipboard.writeText(text).catch(() => {
      // fallback: select + copy
      const pos = typeof getPos === "function" ? getPos() : getPos;
      if (pos == null) return;
      const from = pos + 1;
      const to = pos + node.nodeSize - 1;
      if (from < to) {
        const slice = editor.state.doc.textBetween(from, to, "\n");
        navigator.clipboard.writeText(slice);
      }
    });
  }, [editor, getPos, node]);

  /** Dissolve: delete section container, keep inner paragraphs as top-level blocks */
  const handleDissolve = useCallback(() => {
    setTimeout(() => {
      const pos = typeof getPos === "function" ? getPos() : getPos;
      if (pos == null) return;

      const sectionNode = editor.state.doc.nodeAt(pos);
      if (!sectionNode) return;

      const tr = editor.state.tr;
      tr.delete(pos, pos + sectionNode.nodeSize);
      if (sectionNode.content.size > 0) {
        tr.insert(pos, sectionNode.content);
      }
      editor.view.dispatch(tr);
    }, 0);
  }, [editor, getPos]);

  /** Delete entire section including content */
  const handleDeleteSection = useCallback(() => {
    setTimeout(() => {
      const pos = getPos();
      if (pos == null) return;
      editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
    }, 0);
  }, [editor, getPos, node]);

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={`section-block-wrapper ${variant === "note" ? "section-block-variant-note" : ""} ${collapsed ? "section-block-collapsed" : ""} ${color ? `section-block-color-${color}` : ""}`}
    >
      <div className="section-block">
        {/* Color indicator strip */}
        {color && (
          <div
            className="section-block-color-strip"
            style={{ backgroundColor: COLOR_MAP[color] }}
          />
        )}

        {/* Control bar */}
        <div className="section-block-header" contentEditable={false}>
          <span
            className="block-drag-handle"
            title="拖拽排序"
            onMouseDown={handleDragStart}
          >
            <GripDotsIcon />
          </span>
          <button
            onClick={handleToggleCollapsed}
            className="section-block-collapse"
            title={collapsed ? "展开" : "折叠"}
          >
            <ChevronIcon open={!collapsed} />
          </button>
          <input
            type="text"
            className="section-block-title-input"
            value={title}
            onChange={handleTitleChange}
            placeholder={variant === "note" ? "Note" : "Untitled Section"}
          />
          <button
            onClick={handleToggleAI}
            className={`section-block-ai-toggle ${hideFromAI ? "section-block-ai-excluded" : ""}`}
            title={hideFromAI ? "Excluded from AI" : "Included in AI"}
          >
            {hideFromAI ? "Excluded from AI" : "Included in AI"}
          </button>

          {/* ── Dropdown menu ── */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="section-block-menu-trigger"
              title="Section options"
            >
              <DotsVerticalIcon />
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              sideOffset={4}
              className={`min-w-[200px] p-0 ${menuContentCls}`}
            >
              {/* Word count toggle */}
              <DropdownMenuCheckboxItem
                checked={!hideFromCount}
                onCheckedChange={handleToggleCount}
                closeOnClick={false}
                className={itemCls}
              >
                Include in word count
              </DropdownMenuCheckboxItem>

              <DropdownMenuSeparator className={separatorCls} />

              {/* Color labels */}
              <div className="section-block-color-grid" style={{ padding: "4px 12px 4px 12px" }}>
                {SECTION_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`section-block-color-dot ${color === c ? "section-block-color-dot-active" : ""}`}
                    title={COLOR_LABELS[c]}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetColor(c);
                    }}
                    style={{
                      backgroundColor: c ? COLOR_MAP[c] : "transparent",
                      border: c ? "none" : "1.5px dashed var(--color-text-dim)",
                    }}
                  />
                ))}
              </div>

              <DropdownMenuSeparator className={separatorCls} />

              {/* Copy content */}
              <DropdownMenuItem
                onClick={handleCopyContent}
                className={itemCls}
              >
                Copy content
              </DropdownMenuItem>

              {/* Dissolve section */}
              <DropdownMenuItem
                onClick={handleDissolve}
                className={itemCls}
              >
                Dissolve section
              </DropdownMenuItem>

              {/* Delete section */}
              <DropdownMenuItem
                variant="destructive"
                onClick={handleDeleteSection}
                className={itemCls}
              >
                Delete section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Editable content area — always rendered, CSS controls visibility */}
        <NodeViewContent
          className={`section-block-content ${collapsed ? "section-block-content-hidden" : ""}`}
        />
      </div>
    </NodeViewWrapper>
  );
}
