/**
 * SelectionToolbar — 选中文字时弹出的浮动工具栏
 *
 * 使用 Floating UI 定位（virtual element 锚定选区起点），
 * autoUpdate 自动追踪 scroll/resize，GPU 加速。
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { useFloating, offset, shift } from "@floating-ui/react";
import { Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Highlighter, Code, Ban, ChevronDown, Quote, List, ListOrdered, IndentIncrease, IndentDecrease, UnfoldVertical, RefreshCw, FoldVertical } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";

const HIGHLIGHT_COLORS = [
  { label: "Red", color: "rgba(220, 80, 70, 0.32)" },
  { label: "Yellow", color: "rgba(220, 170, 50, 0.32)" },
  { label: "Green", color: "rgba(50, 170, 120, 0.32)" },
  { label: "Blue", color: "rgba(70, 130, 210, 0.32)" },
  { label: "Purple", color: "rgba(140, 80, 200, 0.32)" },
];

function ToolBtn({ onClick, active, children }: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`selection-toolbar-btn ${active ? "active" : ""}`}
    >
      {children}
    </button>
  );
}

type AiActionMode = "expand" | "rewrite" | "condense";

export function SelectionToolbar({ editor, onAiAction, hidden }: { editor: Editor; onAiAction?: (mode: AiActionMode) => void; hidden?: boolean }) {
  const [charCount, setCharCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [aiPopoverOpen, setAiPopoverOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // 存储选区的 ProseMirror 位置（文档偏移），不是视口坐标
  const selectionFromRef = useRef<number | null>(null);

  // Floating UI：virtual element 定位，手动触发 scroll 更新
  const { refs, floatingStyles, update } = useFloating({
    open,
    placement: "top-start",
    middleware: [offset(8), shift({ padding: 8 })],
  });

  // Virtual element：getBoundingClientRect 从编辑器实时计算视口坐标
  useEffect(() => {
    refs.setReference({
      getBoundingClientRect: () => {
        const from = selectionFromRef.current;
        if (from == null) return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
        try {
          const coords = editor.view.coordsAtPos(from);
          return { x: coords.left, y: coords.top, width: 0, height: 0, top: coords.top, left: coords.left, right: coords.left, bottom: coords.top };
        } catch {
          return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
        }
      },
    });
  }, [refs, editor]);

  // 手动监听滚动触发 Floating UI update（virtual element 无法被 autoUpdate 自动追踪）
  useEffect(() => {
    if (!open) return;
    const scrollEl = (editor.view.dom as HTMLElement).closest("[data-slot='scroll-area-viewport']");
    scrollEl?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      scrollEl?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open, editor, update]);

  useEffect(() => {
    const update = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty || editor.state.selection instanceof NodeSelection) {
        setCharCount(0);
        selectionFromRef.current = null;
        setOpen(false);
        return;
      }
      try {
        setCharCount(editor.state.doc.textBetween(from, to, "").length);
      } catch {
        setCharCount(0);
      }
      selectionFromRef.current = from;
      setOpen(true);
    };

    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

  if (hidden || !open) return null;

  return createPortal(
    <div
      ref={(node) => {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        refs.setFloating(node);
      }}
      className="selection-toolbar"
      style={{ ...floatingStyles, zIndex: 50 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* 第一排：字数 | 撤销 | 重做 */}
      <div className="selection-toolbar-bar">
        <span className="selection-toolbar-info">{charCount} 字</span>
        <span className="selection-toolbar-divider" />
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} >
          <Undo2 size={15} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} >
          <Redo2 size={15} />
        </ToolBtn>
      </div>

      {/* 第二排：格式化 */}
      <div className="selection-toolbar-bar">
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
          <Bold size={15} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
          <Italic size={15} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
          <Underline size={15} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
          <Strikethrough size={15} />
        </ToolBtn>

        <Popover>
          <PopoverTrigger
            className={`selection-toolbar-btn highlight-trigger ${editor.isActive("highlight") ? "active" : ""}`}
            title="高亮"
          >
            <Highlighter size={15} />
            <ChevronDown size={9} fill="currentColor" className="highlight-trigger-arrow" />
          </PopoverTrigger>
          <PopoverContent sideOffset={4} className="highlight-color-popover !border-0">
            <button
              className="highlight-color-item"
              onClick={() => editor.chain().focus().unsetHighlight().run()}
            >
              <Ban size={16} className="highlight-none-icon" />
              <span className="highlight-color-label">None</span>
            </button>
            <span className="highlight-color-divider" />
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.label}
                className="highlight-color-item"
                onClick={() => editor.chain().focus().toggleHighlight({ color: c.color }).run()}
              >
                <span className="highlight-color-swatch" style={{ background: c.color }} />
                <span className="highlight-color-label">{c.label}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")}>
          <Code size={15} />
        </ToolBtn>

        <span className="selection-toolbar-divider" />

        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
          <Quote size={15} />
        </ToolBtn>

        <Popover>
          <PopoverTrigger
            className={`selection-toolbar-btn highlight-trigger ${editor.isActive("heading") ? "active" : ""}`}
          >
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>H</span>
            <ChevronDown size={9} fill="currentColor" className="highlight-trigger-arrow" />
          </PopoverTrigger>
          <PopoverContent sideOffset={4} className="highlight-color-popover !border-0">
            <button
              className="highlight-color-item"
              onClick={() => editor.chain().focus().setParagraph().run()}
            >
              <Ban size={16} className="highlight-none-icon" />
              <span className="highlight-color-label">None</span>
            </button>
            <span className="highlight-color-divider" />
            {([1, 2, 3] as const).map((level) => (
              <button
                key={level}
                className={`highlight-color-item ${editor.isActive("heading", { level }) ? "selected" : ""}`}
                onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
              >
                <span style={{ fontSize: 13, fontWeight: 700, width: 16, textAlign: "center" }}>H{level}</span>
                <span className="highlight-color-label">Heading {level}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger
            className={`selection-toolbar-btn highlight-trigger ${editor.isActive("bulletList") || editor.isActive("orderedList") ? "active" : ""}`}
          >
            <ListOrdered size={15} />
            <ChevronDown size={9} fill="currentColor" className="highlight-trigger-arrow" />
          </PopoverTrigger>
          <PopoverContent sideOffset={4} className="highlight-color-popover !border-0">
            <button
              className={`highlight-color-item ${editor.isActive("bulletList") ? "selected" : ""}`}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List size={16} />
              <span className="highlight-color-label">Bullet List</span>
            </button>
            <button
              className={`highlight-color-item ${editor.isActive("orderedList") ? "selected" : ""}`}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={16} />
              <span className="highlight-color-label">Ordered List</span>
            </button>
            <span className="highlight-color-divider" />
            <button
              className="highlight-color-item"
              onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
            >
              <IndentIncrease size={16} />
              <span className="highlight-color-label">Increase Level</span>
            </button>
            <button
              className="highlight-color-item"
              onClick={() => editor.chain().focus().liftListItem("listItem").run()}
            >
              <IndentDecrease size={16} />
              <span className="highlight-color-label">Decrease Level</span>
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* 第三排：AI 操作 */}
      {charCount > 3 && (
      <div className="selection-toolbar-row-separated">
        <Popover open={aiPopoverOpen === "expand"} onOpenChange={(o) => setAiPopoverOpen(o ? "expand" : null)}>
          <PopoverTrigger className="selection-toolbar-btn-ai" title="扩写">
            <UnfoldVertical size={14} />
            <span className="selection-toolbar-btn-ai-label">扩写</span>
          </PopoverTrigger>
          <PopoverContent sideOffset={4} align="start" className="highlight-color-popover !border-0">
            <span className="ai-action-title">扩写</span>
            <span className="highlight-color-divider" />
            <button className="highlight-color-item" onClick={() => { setAiPopoverOpen(null); onAiAction?.("expand"); }}>
              <span className="highlight-color-label">Generate</span>
            </button>
          </PopoverContent>
        </Popover>

        <Popover open={aiPopoverOpen === "rewrite"} onOpenChange={(o) => setAiPopoverOpen(o ? "rewrite" : null)}>
          <PopoverTrigger className="selection-toolbar-btn-ai" title="改写">
            <RefreshCw size={14} />
            <span className="selection-toolbar-btn-ai-label">改写</span>
          </PopoverTrigger>
          <PopoverContent sideOffset={4} align="start" className="highlight-color-popover !border-0">
            <span className="ai-action-title">改写</span>
            <span className="highlight-color-divider" />
            <button className="highlight-color-item" onClick={() => { setAiPopoverOpen(null); onAiAction?.("rewrite"); }}>
              <span className="highlight-color-label">Generate</span>
            </button>
          </PopoverContent>
        </Popover>

        <Popover open={aiPopoverOpen === "condense"} onOpenChange={(o) => setAiPopoverOpen(o ? "condense" : null)}>
          <PopoverTrigger className="selection-toolbar-btn-ai" title="精简">
            <FoldVertical size={14} />
            <span className="selection-toolbar-btn-ai-label">精简</span>
          </PopoverTrigger>
          <PopoverContent sideOffset={4} align="start" className="highlight-color-popover !border-0">
            <span className="ai-action-title">精简</span>
            <span className="highlight-color-divider" />
            <button className="highlight-color-item" onClick={() => { setAiPopoverOpen(null); onAiAction?.("condense"); }}>
              <span className="highlight-color-label">Generate</span>
            </button>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger className="selection-toolbar-btn-ai" title="预设">
            <span className="selection-toolbar-btn-ai-label">预设</span>
          </PopoverTrigger>
          <PopoverContent sideOffset={4} align="start" className="highlight-color-popover !border-0">
            <span className="ai-action-title">预设</span>
            <span className="highlight-color-divider" />
            <button className="highlight-color-item" onClick={() => {/* TODO: create preset */}}>
              <span className="highlight-color-label">Create New</span>
            </button>
          </PopoverContent>
        </Popover>
      </div>
      )}
    </div>,
    document.body,
  );
}
