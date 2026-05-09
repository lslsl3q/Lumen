/**
 * RichTextField — 轻量 TipTap 富文本表单字段
 *
 * 专用于设定编辑器的紧凑富文本字段。
 * 顶部固定迷你工具栏，onBlur 触发保存。
 * 通过 key={settingId + fieldKey} 控制内容重置，避免光标跳动。
 */
import { useCallback, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Code, Heading1, Heading2, List, ListOrdered, Quote,
  Link as LinkIcon, Highlighter, RemoveFormatting,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";

interface RichTextFieldProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const lightExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2] } }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true }),
  Highlight,
];

const MENU_ITEMS = [
  { icon: Bold, cmd: (e: any) => e.chain().focus().toggleBold().run(), active: "bold", label: "加粗" },
  { icon: Italic, cmd: (e: any) => e.chain().focus().toggleItalic().run(), active: "italic", label: "斜体" },
  { icon: UnderlineIcon, cmd: (e: any) => e.chain().focus().toggleUnderline().run(), active: "underline", label: "下划线" },
  { icon: Strikethrough, cmd: (e: any) => e.chain().focus().toggleStrike().run(), active: "strike", label: "删除线" },
  { icon: Code, cmd: (e: any) => e.chain().focus().toggleCode().run(), active: "code", label: "代码" },
  { icon: Heading1, cmd: (e: any) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: "heading", activeOpt: { level: 1 }, label: "标题1" },
  { icon: Heading2, cmd: (e: any) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: "heading", activeOpt: { level: 2 }, label: "标题2" },
  { icon: List, cmd: (e: any) => e.chain().focus().toggleBulletList().run(), active: "bulletList", label: "无序列表" },
  { icon: ListOrdered, cmd: (e: any) => e.chain().focus().toggleOrderedList().run(), active: "orderedList", label: "有序列表" },
  { icon: Quote, cmd: (e: any) => e.chain().focus().toggleBlockquote().run(), active: "blockquote", label: "引用" },
  { icon: Highlighter, cmd: (e: any) => e.chain().focus().toggleHighlight().run(), active: "highlight", label: "高亮" },
  { icon: RemoveFormatting, cmd: (e: any) => e.chain().focus().clearNodes().unsetAllMarks().run(), active: null, label: "清除格式" },
];

export function RichTextField({ value, onChange, placeholder, minHeight = 120 }: RichTextFieldProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const editor = useEditor({
    extensions: [
      ...lightExtensions,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "rich-field-editor outline-none",
      },
    },
    onBlur: ({ editor: ed }) => {
      const html = ed.isEmpty ? "" : ed.getHTML();
      if (html !== value) {
        onChange(html);
      }
    },
  });

  const handleMouseDown = useCallback((e: React.MouseEvent, cmd: (editor: any) => void) => {
    e.preventDefault();
    if (editor) cmd(editor);
  }, [editor]);

  if (!editor) return null;

  const openLinkPopover = () => {
    const href = editor.isActive("link") ? editor.getAttributes("link").href ?? "" : "";
    setLinkUrl(href);
    setLinkOpen(true);
  };

  const applyLink = () => {
    if (linkUrl) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkOpen(false);
  };

  return (
    <div className="rich-field-wrapper" style={{ minHeight }}>
      <div className="rich-field-toolbar">
        {MENU_ITEMS.map((item, i) => {
          const Icon = item.icon;
          let isActive = false;
          if (item.active) {
            isActive = item.activeOpt
              ? editor.isActive(item.active, item.activeOpt)
              : editor.isActive(item.active);
          }
          return (
            <button
              key={i}
              onMouseDown={(e) => handleMouseDown(e, item.cmd)}
              className={`rich-field-toolbar-btn ${isActive ? "is-active" : ""}`}
              title={item.label}
              aria-label={item.label}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}

        {/* 链接 Popover */}
        <Popover open={linkOpen} onOpenChange={(o) => { if (!o) setLinkOpen(false); }}>
          <PopoverTrigger>
            <button
              onMouseDown={(e) => { e.preventDefault(); openLinkPopover(); }}
              className={`rich-field-toolbar-btn ${editor.isActive("link") ? "is-active" : ""}`}
              title="链接"
              aria-label="链接"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="center" className="w-56 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-2.5 space-y-1.5">
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setLinkOpen(false); }}
              placeholder="https://..."
              className="w-full bg-[var(--color-bg-deep)] border border-[var(--color-border)] rounded px-2 py-1 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]/30"
            />
            <div className="flex justify-end gap-1">
              <button onClick={() => setLinkOpen(false)} className="px-2 py-0.5 text-[10px] rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer">取消</button>
              <button onClick={applyLink} className="px-2 py-0.5 text-[10px] rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 cursor-pointer">确认</button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
