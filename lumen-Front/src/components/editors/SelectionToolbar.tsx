/**
 * SelectionToolbar — 选中文字时弹出的浮动工具栏
 *
 * NovelCrafter 风格：两排独立浮块，位置锚定选区起点，不超出编辑器文字区域。
 * 不使用 BubbleMenu（其定位逻辑无法满足需求），改为手动定位 + Portal 渲染。
 */
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Highlighter, Code, Ban, ChevronDown } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";

// 半透明基色 — 自动适配深浅模式（normal blend 叠加背景）
const HIGHLIGHT_COLORS = [
  { label: "Red", color: "rgba(220, 80, 70, 0.32)" },
  { label: "Yellow", color: "rgba(220, 170, 50, 0.32)" },
  { label: "Green", color: "rgba(50, 170, 120, 0.32)" },
  { label: "Blue", color: "rgba(70, 130, 210, 0.32)" },
  { label: "Purple", color: "rgba(140, 80, 200, 0.32)" },
];

// 带 Tooltip 的工具按钮
function ToolBtn({ onClick, active, title, children }: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        onClick={onClick}
        className={`selection-toolbar-btn ${active ? "active" : ""}`}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {title}
      </TooltipContent>
    </Tooltip>
  );
}

export function SelectionToolbar({ editor }: { editor: Editor }) {
  const [charCount, setCharCount] = useState(0);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const [tick, setTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  void tick;

  useEffect(() => {
    const scrollEl = (editor.view.dom as HTMLElement).closest(".writing-paper-container");

    const update = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        setCharCount(0);
        setAnchor(null);
        return;
      }
      setTick((t) => t + 1);
      try {
        setCharCount(editor.state.doc.textBetween(from, to, "").length);
      } catch {
        setCharCount(0);
      }
      try {
        const coords = editor.view.coordsAtPos(from);
        setAnchor({ left: coords.left, top: coords.top });
      } catch {
        setAnchor(null);
      }
    };

    editor.on("transaction", update);
    scrollEl?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      editor.off("transaction", update);
      scrollEl?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [editor]);

  const el = ref.current;
  const h = el?.offsetHeight ?? 68;
  const w = el?.offsetWidth ?? 200;

  let pos: { left: number; top: number } | null = null;
  if (anchor) {
    const scrollEl = (editor.view.dom as HTMLElement).closest(".writing-paper-container");
    const bounds = (scrollEl ?? (editor.view.dom as HTMLElement)).getBoundingClientRect();
    let left = anchor.left;
    if (left + w > bounds.right) left = bounds.right - w;
    if (left < bounds.left) left = bounds.left;
    pos = { left, top: anchor.top - h - 8 };
  }

  return createPortal(
    <div
      ref={ref}
      className="selection-toolbar"
      style={{
        position: "fixed",
        left: pos ? pos.left : -9999,
        top: pos ? pos.top : -9999,
        zIndex: 99999,
        visibility: pos ? "visible" : "hidden",
        pointerEvents: pos ? "auto" : "none",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* 第一排：字数 | 撤销 | 重做 */}
      <div className="selection-toolbar-bar">
        <span className="selection-toolbar-info">{charCount} 字</span>
        <span className="selection-toolbar-divider" />
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="撤销" >
          <Undo2 size={15} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="重做" >
          <Redo2 size={15} />
        </ToolBtn>
      </div>

      {/* 第二排：格式化 */}
      <div className="selection-toolbar-bar">
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="加粗">
          <Bold size={15} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="斜体">
          <Italic size={15} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="下划线">
          <Underline size={15} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="删除线">
          <Strikethrough size={15} />
        </ToolBtn>

        {/* 高亮颜色选择器 — 用原生 title，Tooltip 和 Popover 嵌套冲突 */}
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

        <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="行内代码">
          <Code size={15} />
        </ToolBtn>
      </div>
    </div>,
    document.body,
  );
}
