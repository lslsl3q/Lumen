/**
 * RichTextEditor — 可复用的 Notion 风格富文本编辑器
 *
 * 基于 TipTap，支持 Markdown 双向转换。
 * 外部接口全是 markdown 字符串，内部用 TipTap JSON。
 */
import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { defaultExtensions } from "./extensions";

/* ── 气泡工具栏 ── */

function BubbleBar({ editor }: { editor: any }) {
  const items = [
    { label: "B", cmd: () => editor.chain().focus().toggleBold().run(), active: "bold" },
    { label: "I", cmd: () => editor.chain().focus().toggleItalic().run(), active: "italic" },
    { label: "U", cmd: () => editor.chain().focus().toggleUnderline().run(), active: "underline" },
    { label: "S", cmd: () => editor.chain().focus().toggleStrike().run(), active: "strike" },
    { label: "</>", cmd: () => editor.chain().focus().toggleCode().run(), active: "code" },
    { label: "H", cmd: () => editor.chain().focus().toggleHighlight().run(), active: "highlight" },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-[#2a2926]
      bg-[#1f1f1c] px-1 py-0.5 shadow-lg">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.cmd}
          className={`px-1.5 py-0.5 rounded text-[11px] transition-colors duration-100 cursor-pointer
            ${editor.isActive(item.active)
              ? "text-amber-400 bg-amber-400/10"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
            }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ── 组件 ── */

export interface RichTextEditorProps {
  value: string;
  onChange: (md: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  onSave?: () => void;
}

export interface RichTextEditorRef {
  focus: () => void;
}

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  function RichTextEditor(
    { value, onChange, editable = true, className, onSave },
    ref,
  ) {
    const internalRef = useRef(value);
    const isInternalUpdate = useRef(false);

    const editor = useEditor({
      extensions: defaultExtensions,
      content: value,
      editable,
      editorProps: {
        attributes: {
          class: "rich-text-editor-prosemirror outline-none",
        },
        handleKeyDown: (_view: any, event: any) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "s") {
            event.preventDefault();
            onSave?.();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        const md = (ed as any).storage?.markdown?.getMarkdown?.() ?? "";
        internalRef.current = md;
        isInternalUpdate.current = true;
        onChange(md);
        requestAnimationFrame(() => { isInternalUpdate.current = false; });
      },
      immediatelyRender: false,
    });

    // 外部 value 变化时同步（排除自身触发的更新）
    useEffect(() => {
      if (!editor || isInternalUpdate.current) return;
      if (value !== internalRef.current) {
        internalRef.current = value;
        editor.commands.setContent(value);
      }
    }, [value, editor]);

    // 同步 editable
    useEffect(() => {
      if (editor) {
        editor.setOptions({ editable });
      }
    }, [editable, editor]);

    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus(),
    }));

    // 气泡菜单状态
    const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
      if (!editor) return;

      const handleSelection = ({ editor: ed }: any) => {
        const { from, to, empty } = ed.state.selection;
        if (empty || from === to) {
          setBubblePos(null);
          return;
        }
        // 获取选中区域的坐标
        const { view } = ed;
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        const x = (start.left + end.left) / 2;
        const y = start.top - 10;
        setBubblePos({ x, y });
      };

      editor.on("selectionUpdate", handleSelection);
      editor.on("blur", () => setBubblePos(null));

      return () => {
        editor.off("selectionUpdate", handleSelection);
      };
    }, [editor]);

    if (!editor) return null;

    return (
      <div className={`relative flex flex-col min-h-0 ${className ?? ""}`}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-lumen">
          <EditorContent editor={editor} />
        </div>

        {/* 气泡工具栏 */}
        {bubblePos && (
          <div
            className="fixed z-50 pointer-events-auto animate-in fade-in duration-150"
            style={{
              left: bubblePos.x,
              top: bubblePos.y,
              transform: "translate(-50%, -100%)",
            }}
          >
            <BubbleBar editor={editor} />
          </div>
        )}
      </div>
    );
  },
);

export default RichTextEditor;
