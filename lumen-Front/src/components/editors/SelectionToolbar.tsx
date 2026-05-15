/**
 * SelectionToolbar — 选中文字时弹出的浮动工具栏
 *
 * NovelCrafter 风格：两排独立浮块，位置锚定选区起点，不超出编辑器文字区域。
 * 不使用 BubbleMenu（其定位逻辑无法满足需求），改为手动定位 + Portal 渲染。
 */
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Highlighter, Code, Ban, ChevronDown, Quote, List, ListOrdered, IndentIncrease, IndentDecrease, UnfoldVertical, RefreshCw, FoldVertical } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";

// 半透明基色 — 自动适配深浅模式（normal blend 叠加背景）
const HIGHLIGHT_COLORS = [
  { label: "Red", color: "rgba(220, 80, 70, 0.32)" },
  { label: "Yellow", color: "rgba(220, 170, 50, 0.32)" },
  { label: "Green", color: "rgba(50, 170, 120, 0.32)" },
  { label: "Blue", color: "rgba(70, 130, 210, 0.32)" },
  { label: "Purple", color: "rgba(140, 80, 200, 0.32)" },
];

// 简单工具按钮（Bubble Menu 不需要 Tooltip）
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
  const w = el?.offsetWidth ?? 0;

  let pos: { left: number; bottom: number } | null = null;
  if (anchor) {
    const editorBounds = (editor.view.dom as HTMLElement).getBoundingClientRect();
    let left = anchor.left;
    if (left + w > editorBounds.right) left = editorBounds.right - w;
    if (left < editorBounds.left) left = editorBounds.left;
    pos = { left, bottom: window.innerHeight - anchor.top + 8 };
  }

  return createPortal(
    <div
      ref={ref}
      className="selection-toolbar"
      style={{
        position: "fixed",
        left: pos ? pos.left : -9999,
        bottom: pos ? pos.bottom : -9999,
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

        <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")}>
          <Code size={15} />
        </ToolBtn>

        {/* 段落格式 — 分割线隔开 */}
        <span className="selection-toolbar-divider" />

        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
          <Quote size={15} />
        </ToolBtn>

        {/* Heading 选择器 */}
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

        {/* List 选择器 */}
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

      {/* 第三排：AI 操作 — 选中超 3 字才显示 */}
      {charCount > 3 && (
      <div className="selection-toolbar-row-separated">
        <Popover>
          <PopoverTrigger className="selection-toolbar-btn-ai" title="扩写">
            <UnfoldVertical size={14} />
            <span className="selection-toolbar-btn-ai-label">扩写</span>
          </PopoverTrigger>
          <PopoverContent sideOffset={4} align="start" className="highlight-color-popover !border-0">
            <span className="ai-action-title">扩写</span>
            <span className="highlight-color-divider" />
            <button className="highlight-color-item" onClick={() => {/* TODO: trigger expand */}}>
              <span className="highlight-color-label">Generate</span>
            </button>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger className="selection-toolbar-btn-ai" title="改写">
            <RefreshCw size={14} />
            <span className="selection-toolbar-btn-ai-label">改写</span>
          </PopoverTrigger>
          <PopoverContent sideOffset={4} align="start" className="highlight-color-popover !border-0">
            <span className="ai-action-title">改写</span>
            <span className="highlight-color-divider" />
            <button className="highlight-color-item" onClick={() => {/* TODO: trigger rewrite */}}>
              <span className="highlight-color-label">Generate</span>
            </button>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger className="selection-toolbar-btn-ai" title="精简">
            <FoldVertical size={14} />
            <span className="selection-toolbar-btn-ai-label">精简</span>
          </PopoverTrigger>
          <PopoverContent sideOffset={4} align="start" className="highlight-color-popover !border-0">
            <span className="ai-action-title">精简</span>
            <span className="highlight-color-divider" />
            <button className="highlight-color-item" onClick={() => {/* TODO: trigger condense */}}>
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
