/**
 * WritingEditor — 写作编辑区域
 *
 * TipTap 3.x 编辑器，Markdown 格式存储，500ms 自动保存。
 * 布局：工具栏（全宽）→ 中间行（纸张 + children 面板）→ 状态栏（全宽）。
 * Ctrl+J 打开内联 AI 菜单。Ctrl+F 打开查找替换。
 */
import { useRef, useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { defaultExtensions } from "../../components/editors/extensions";
import { useWritingStore } from "../../stores/useWritingStore";
import { InlineAiMenu } from "./InlineAiMenu";
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover";
import {
  Bold, Italic, Underline, Strikethrough, Code, Quote,
  List, ListOrdered, Heading1, Heading2, Heading3, Minus,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Superscript, Subscript, Link, RemoveFormatting, Search,
  Table, ImagePlus, Palette, Eye, Type,
  IndentIncrease, IndentDecrease,
} from "lucide-react";

/* ── 工具栏 ── */

function EditorToolbar({ editor, onFindReplace }: { editor: any; onFindReplace: () => void }) {
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [popoverValue, setPopoverValue] = useState("");

  const sanitizeUrl = (url: string) => {
    const trimmed = url.trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return "";
    return trimmed;
  };

  const openPopover = (id: string, initial = "") => {
    setPopoverValue(initial);
    setActivePopover(id);
  };

  const applyPopover = (action: (val: string) => void) => {
    action(popoverValue);
    setActivePopover(null);
  };

  const items = [
    { icon: Heading1, cmd: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: "heading", activeOpt: { level: 1 } },
    { icon: Heading2, cmd: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: "heading", activeOpt: { level: 2 } },
    { icon: Heading3, cmd: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: "heading", activeOpt: { level: 3 } },
    { type: "divider" as const },
    { icon: Bold, cmd: () => editor.chain().focus().toggleBold().run(), active: "bold" },
    { icon: Italic, cmd: () => editor.chain().focus().toggleItalic().run(), active: "italic" },
    { icon: Underline, cmd: () => editor.chain().focus().toggleUnderline().run(), active: "underline" },
    { icon: Strikethrough, cmd: () => editor.chain().focus().toggleStrike().run(), active: "strike" },
    { icon: Superscript, cmd: () => editor.chain().focus().toggleSuperscript().run(), active: "superscript" },
    { icon: Subscript, cmd: () => editor.chain().focus().toggleSubscript().run(), active: "subscript" },
    { icon: Code, cmd: () => editor.chain().focus().toggleCode().run(), active: "code" },
    { type: "divider" as const },
    { icon: Quote, cmd: () => editor.chain().focus().toggleBlockquote().run(), active: "blockquote" },
    { icon: List, cmd: () => editor.chain().focus().toggleBulletList().run(), active: "bulletList" },
    { icon: ListOrdered, cmd: () => editor.chain().focus().toggleOrderedList().run(), active: "orderedList" },
    { icon: Minus, cmd: () => editor.chain().focus().setHorizontalRule().run(), active: null },
    { icon: Table, cmd: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: null },
    { type: "divider" as const },
    { icon: IndentIncrease, cmd: () => editor.chain().focus().sinkListItem("listItem").run(), active: null },
    { icon: IndentDecrease, cmd: () => editor.chain().focus().liftListItem("listItem").run(), active: null },
    { type: "divider" as const },
    { icon: AlignLeft, cmd: () => editor.chain().focus().setTextAlign("left").run(), active: { textAlign: "left" } },
    { icon: AlignCenter, cmd: () => editor.chain().focus().setTextAlign("center").run(), active: { textAlign: "center" } },
    { icon: AlignRight, cmd: () => editor.chain().focus().setTextAlign("right").run(), active: { textAlign: "right" } },
    { icon: AlignJustify, cmd: () => editor.chain().focus().setTextAlign("justify").run(), active: { textAlign: "justify" } },
    { type: "divider" as const },
    { icon: RemoveFormatting, cmd: () => editor.chain().focus().clearNodes().unsetAllMarks().run(), active: null },
    { icon: Search, cmd: onFindReplace, active: null },
  ];

  return (
    <div className="writing-toolbar-wrapper">
      <div className="writing-toolbar-inner">
        {items.map((item, i) => {
          if ("type" in item && item.type === "divider") {
            return <div key={i} className="w-px h-4 bg-surface-elevated mx-0.5 flex-shrink-0" />;
          }
          const Icon = (item as any).icon;
          const activeVal = (item as any).active;
          let isActive = false;
          if (activeVal) {
            if (typeof activeVal === "object") {
              const [key, val] = Object.entries(activeVal)[0];
              isActive = editor.isActive(key, val);
            } else {
              const opt = (item as any).activeOpt;
              isActive = opt ? editor.isActive(activeVal, opt) : editor.isActive(activeVal);
            }
          }
          return (
            <button
              key={i}
              onClick={(item as any).cmd}
              className={`p-1 rounded text-[13px] transition-colors cursor-pointer flex-shrink-0
                ${isActive
                  ? "text-primary bg-primary/10"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-elevated"
                }`}
              title={(item as any).active || "action"}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}

        {/* ── Popover 按钮：图片 / 颜色 / 链接 ── */}

        <Popover open={activePopover === "image"} onOpenChange={(o) => { if (!o) { setActivePopover(null); setPopoverValue(""); } }}>
          <PopoverTrigger
            onClick={() => openPopover("image")}
            className="p-1 rounded text-[13px] transition-colors cursor-pointer flex-shrink-0 text-text-muted hover:text-text-primary hover:bg-surface-elevated"
            title="插入图片"
          >
            <ImagePlus className="w-4 h-4" />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="center" className="w-64 bg-surface-elevated border border-border-default rounded-lg p-3 space-y-2">
            <p className="text-[11px] text-text-secondary">图片地址</p>
            <input
              autoFocus
              value={popoverValue}
              onChange={(e) => setPopoverValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); applyPopover((v) => { const safe = sanitizeUrl(v); if (safe) editor.chain().focus().setImage({ src: safe }).run(); }); }
                if (e.key === "Escape") setActivePopover(null);
              }}
              placeholder="https://..."
              className="w-full bg-surface-deep border border-border-default rounded px-2 py-1 text-[12px] text-text-primary outline-none focus:border-primary/30"
            />
            <div className="flex justify-end gap-1">
              <button onClick={() => setActivePopover(null)} className="px-2 py-0.5 text-[11px] rounded text-text-muted hover:text-text-primary cursor-pointer">取消</button>
              <button onClick={() => applyPopover((v) => { const safe = sanitizeUrl(v); if (safe) editor.chain().focus().setImage({ src: safe }).run(); })} className="px-2 py-0.5 text-[11px] rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">确认</button>
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={activePopover === "color"} onOpenChange={(o) => { if (!o) { setActivePopover(null); setPopoverValue(""); } }}>
          <PopoverTrigger
            onClick={() => openPopover("color", editor.getAttributes("textStyle").color ?? "#CC7C5E")}
            className="p-1 rounded text-[13px] transition-colors cursor-pointer flex-shrink-0 text-text-muted hover:text-text-primary hover:bg-surface-elevated"
            title="文字颜色"
          >
            <Palette className="w-4 h-4" />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="center" className="w-52 bg-surface-elevated border border-border-default rounded-lg p-3 space-y-2">
            <p className="text-[11px] text-text-secondary">文字颜色</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={popoverValue || "#CC7C5E"}
                onChange={(e) => setPopoverValue(e.target.value)}
                className="w-8 h-8 rounded border border-border-default cursor-pointer bg-transparent"
              />
              <input
                value={popoverValue}
                onChange={(e) => setPopoverValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); applyPopover((v) => { if (/^#[0-9a-fA-F]{3,8}$/.test(v.trim()) || /^[a-zA-Z]+$/.test(v.trim())) editor.chain().focus().setColor(v.trim()).run(); }); }
                  if (e.key === "Escape") setActivePopover(null);
                }}
                placeholder="#CC7C5E"
                className="flex-1 bg-surface-deep border border-border-default rounded px-2 py-1 text-[12px] text-text-primary outline-none focus:border-primary/30"
              />
            </div>
            <div className="flex justify-end gap-1">
              <button onClick={() => setActivePopover(null)} className="px-2 py-0.5 text-[11px] rounded text-text-muted hover:text-text-primary cursor-pointer">取消</button>
              <button onClick={() => applyPopover((v) => { if (/^#[0-9a-fA-F]{3,8}$/.test(v.trim()) || /^[a-zA-Z]+$/.test(v.trim())) editor.chain().focus().setColor(v.trim()).run(); })} className="px-2 py-0.5 text-[11px] rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">确认</button>
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={activePopover === "link"} onOpenChange={(o) => { if (!o) { setActivePopover(null); setPopoverValue(""); } }}>
          <PopoverTrigger
            onClick={() => {
              const href = editor.isActive("link") ? editor.getAttributes("link").href ?? "" : "";
              openPopover("link", href);
            }}
            className={`p-1 rounded text-[13px] transition-colors cursor-pointer flex-shrink-0
              ${editor.isActive("link") ? "text-primary bg-primary/10" : "text-text-muted hover:text-text-primary hover:bg-surface-elevated"}`}
            title="链接"
          >
            <Link className="w-4 h-4" />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="center" className="w-64 bg-surface-elevated border border-border-default rounded-lg p-3 space-y-2">
            <p className="text-[11px] text-text-secondary">链接地址</p>
            <input
              autoFocus
              value={popoverValue}
              onChange={(e) => setPopoverValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyPopover((v) => {
                    const safe = sanitizeUrl(v);
                    if (safe) editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
                    else editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  });
                }
                if (e.key === "Escape") setActivePopover(null);
              }}
              placeholder="https://..."
              className="w-full bg-surface-deep border border-border-default rounded px-2 py-1 text-[12px] text-text-primary outline-none focus:border-primary/30"
            />
            <div className="flex justify-end gap-1">
              <button onClick={() => setActivePopover(null)} className="px-2 py-0.5 text-[11px] rounded text-text-muted hover:text-text-primary cursor-pointer">取消</button>
              <button onClick={() => applyPopover((v) => {
                const safe = sanitizeUrl(v);
                if (safe) editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
                else editor.chain().focus().extendMarkRange("link").unsetLink().run();
              })} className="px-2 py-0.5 text-[11px] rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">确认</button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

/* ── 查找替换栏 ── */

function FindReplaceBar({ editor, onClose }: { editor: any; onClose: () => void }) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [count, setCount] = useState(0);

  const doFind = () => {
    if (!find) return;
    const doc = editor.state.doc;
    let found = 0;
    let firstFrom = -1;
    let firstTo = -1;
    doc.descendants((node: any, pos: number) => {
      if (!node.isText || !node.text) return;
      let idx = node.text.indexOf(find);
      while (idx !== -1) {
        found++;
        if (firstFrom === -1) {
          firstFrom = pos + idx;
          firstTo = pos + idx + find.length;
        }
        idx = node.text.indexOf(find, idx + find.length);
      }
    });
    setCount(found);
    if (firstFrom !== -1) {
      editor.commands.setTextSelection({ from: firstFrom, to: firstTo });
    }
  };

  const doReplace = () => {
    if (!find) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to);
    if (selected === find) {
      editor.chain().focus().insertContentAt({ from, to }, replace).run();
    }
    doFind();
  };

  const doReplaceAll = () => {
    if (!find) return;
    const { state } = editor;
    const { tr } = state;
    let offset = 0;
    state.doc.descendants((node: any, pos: number) => {
      if (!node.isText || !node.text) return;
      let idx = node.text.indexOf(find);
      while (idx !== -1) {
        const from = pos + idx + offset;
        const to = from + find.length;
        tr.replaceWith(from, to, state.schema.text(replace));
        offset += replace.length - find.length;
        idx = node.text.indexOf(find, idx + find.length);
      }
    });
    editor.view.dispatch(tr);
    doFind();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") doFind();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [find]);

  return (
    <div className="writing-findreplace-wrapper">
      <div className="writing-findreplace-inner">
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="查找…"
          className="w-36 bg-surface-elevated border border-border-default rounded px-2 py-0.5 text-[12px] text-text-primary placeholder-[var(--color-text-dim)] outline-none focus:border-primary/30"
          autoFocus
        />
        <input
          value={replace}
          onChange={(e) => setReplace(e.target.value)}
          placeholder="替换…"
          className="w-36 bg-surface-elevated border border-border-default rounded px-2 py-0.5 text-[12px] text-text-primary placeholder-[var(--color-text-dim)] outline-none focus:border-primary/30"
        />
        <button onClick={doFind} className="px-2 py-0.5 text-[11px] rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
          查找
        </button>
        <button onClick={doReplace} className="px-2 py-0.5 text-[11px] rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
          替换
        </button>
        <button onClick={doReplaceAll} className="px-2 py-0.5 text-[11px] rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
          全部替换
        </button>
        {count > 0 && <span className="text-[10px] text-text-muted">{count} 处匹配</span>}
        <button onClick={onClose} className="ml-auto text-text-muted hover:text-text-secondary cursor-pointer text-[11px]">
          Esc
        </button>
      </div>
    </div>
  );
}

/* ── 状态栏 ── */

function StatusBar({ editor }: { editor: any }) {
  const chapters = useWritingStore((s) => s.chapters);
  const activeChapterId = useWritingStore((s) => s.activeChapterId);
  const focusMode = useWritingStore((s) => s.focusMode);
  const typewriterMode = useWritingStore((s) => s.typewriterMode);
  const toggleFocusMode = useWritingStore((s) => s.toggleFocusMode);
  const toggleTypewriterMode = useWritingStore((s) => s.toggleTypewriterMode);
  const ch = chapters.find((c) => c.id === activeChapterId);
  const saveStatus = useWritingStore((s) => s.saveStatus);
  const lastSavedAt = useWritingStore((s) => s.lastSavedAt);
  const chars = editor?.storage?.characterCount?.characters?.() ?? 0;
  const words = editor?.storage?.characterCount?.words?.() ?? 0;

  return (
    <div className="writing-statusbar-wrapper">
      <div className="writing-statusbar-inner">
        <span>{ch?.title ?? "未选择章节"}</span>
        {(saveStatus === "saving" || saveStatus === "error") && (
          <span className={saveStatus === "error" ? "text-red-400" : "text-text-muted"}>
            {saveStatus === "saving" ? "保存中..." : "保存失败"}
          </span>
        )}
        {saveStatus === "saved" && lastSavedAt && (
          <span className="text-text-muted">
            {Math.floor((Date.now() - lastSavedAt) / 1000) < 60 ? "已保存" : `已保存 ${new Date(lastSavedAt).toLocaleTimeString()}`}
          </span>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { toggleFocusMode(); editor?.commands?.toggleFocusMode?.(); }}
            className={`cursor-pointer transition-colors ${focusMode ? "text-primary" : "text-text-muted hover:text-text-secondary"}`}
            title="专注模式"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              toggleTypewriterMode();
              const el = editor?.view?.dom as HTMLElement;
              el?.classList.toggle("typewriter-mode", !typewriterMode);
            }}
            className={`cursor-pointer transition-colors ${typewriterMode ? "text-primary" : "text-text-muted hover:text-text-secondary"}`}
            title="打字机模式"
          >
            <Type className="w-3.5 h-3.5" />
          </button>
          <span className="text-text-muted">|</span>
          <span>{chars} 字符</span>
          <span>{words} 词</span>
        </div>
      </div>
    </div>
  );
}

/* ── 主组件 ── */

export function WritingEditor({ children }: { children?: React.ReactNode }) {
  const { chapters, activeChapterId, updateChapter } = useWritingStore();
  const ghostTextContent = useWritingStore((s) => s.ghostTextContent);
  const ghostRequestId = useWritingStore((s) => s.ghostRequestId);
  const clearGhostText = useWritingStore((s) => s.clearGhostText);
  const aiMode = useWritingStore((s) => s.aiMode);

  const activeChapter = chapters.find((c) => c.id === activeChapterId);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalUpdate = useRef(false);
  const prevChapterId = useRef<string | null>(null);

  const ghostRangeRef = useRef<{ from: number; to: number } | null>(null);
  const lastGhostRequestRef = useRef<string | null>(null);

  const [inlineMenu, setInlineMenu] = useState<{
    visible: boolean;
    position: { top: number; left: number } | null;
  }>({ visible: false, position: null });

  const [showFindReplace, setShowFindReplace] = useState(false);

  const editor = useEditor({
    extensions: defaultExtensions,
    content: "",
    editable: false,
    editorProps: {
      attributes: {
        class: "rich-text-editor-prosemirror outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (isInternalUpdate.current) return;
      useWritingStore.setState({ contentDirty: true });
      // 打字机模式：滚动光标到视口中央
      if (useWritingStore.getState().typewriterMode) {
        requestAnimationFrame(() => {
          try {
            ed.commands.scrollIntoView();
          } catch {}
        });
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const html = ed.getHTML();
        const currentChapterId = useWritingStore.getState().activeChapterId;
        if (currentChapterId) {
          updateChapter(currentChapterId, { content: html });
        }
      }, 500);
    },
  });

  // Ctrl+J: 内联 AI
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault();
        if (!editor || !activeChapterId) return;
        if (inlineMenu.visible) {
          setInlineMenu({ visible: false, position: null });
          return;
        }
        const { view } = editor;
        const { from } = view.state.selection;
        const coords = view.coordsAtPos(from);
        setInlineMenu({
          visible: true,
          position: { top: coords.bottom + 8, left: coords.left },
        });
      }
      // Ctrl+F: 查找替换
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowFindReplace((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editor, activeChapterId, inlineMenu.visible]);

  // 章节切换
  useEffect(() => {
    if (!editor) return;
    if (prevChapterId.current === activeChapterId) return;
    prevChapterId.current = activeChapterId;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    ghostRangeRef.current = null;
    lastGhostRequestRef.current = null;
    clearGhostText();
    setInlineMenu({ visible: false, position: null });
    setShowFindReplace(false);

    if (activeChapterId && activeChapter) {
      isInternalUpdate.current = true;
      editor.commands.setContent(activeChapter.content ?? "");
      editor.setEditable(true);
      requestAnimationFrame(() => { isInternalUpdate.current = false; });
    } else {
      isInternalUpdate.current = true;
      editor.commands.setContent("");
      editor.setEditable(false);
      requestAnimationFrame(() => { isInternalUpdate.current = false; });
    }
  }, [activeChapterId, activeChapter, editor]);

  // Ghost Text 流式渲染
  useEffect(() => {
    if (!editor) return;
    if (ghostRequestId && ghostRequestId !== lastGhostRequestRef.current) {
      lastGhostRequestRef.current = ghostRequestId;
      ghostRangeRef.current = null;
    }
    if (!ghostTextContent || !ghostRequestId) {
      ghostRangeRef.current = null;
      lastGhostRequestRef.current = null;
      return;
    }
    const { aiMode } = useWritingStore.getState();
    if (!["continue", "rewrite", "expand", "condense", "beat_generate"].includes(aiMode)) return;

    isInternalUpdate.current = true;

    // 将纯文本转为 HTML 段落，确保 TipTap 创建正确的 block 节点
    const htmlContent = ghostTextContent
      .split(/\n/)
      .filter(Boolean)
      .map((p) => `<p>${p}</p>`)
      .join("");

    const insertPos = ghostRangeRef.current?.from ?? editor.state.selection.from;

    if (!ghostRangeRef.current) {
      editor.chain().focus().insertContentAt(insertPos, htmlContent).run();
      const endPos = editor.state.selection.from;
      editor.chain()
        .setTextSelection({ from: insertPos, to: endPos })
        .setMark("ghostText")
        .run();
      ghostRangeRef.current = { from: insertPos, to: endPos };
    } else {
      const range = ghostRangeRef.current;
      try {
        editor.chain().focus().deleteRange(range).insertContentAt(range.from, htmlContent).run();
        const endPos = editor.state.selection.from;
        editor.chain()
          .setTextSelection({ from: range.from, to: endPos })
          .setMark("ghostText")
          .run();
        ghostRangeRef.current = { from: range.from, to: endPos };
      } catch {
        ghostRangeRef.current = null;
      }
    }
    requestAnimationFrame(() => { isInternalUpdate.current = false; });
  }, [ghostTextContent, ghostRequestId, editor]);

  // Tab/Esc 检测
  useEffect(() => {
    if (!editor) return;
    const checkGhost = () => {
      const { ghostRequestId: rid, ghostTextContent: gc } = useWritingStore.getState();
      if (!rid || !gc) return;
      let hasGhost = false;
      editor.state.doc.descendants((node: unknown) => {
        const n = node as { isText?: boolean; marks?: Array<{ type: { name: string } }> };
        if (n.isText && n.marks?.some((m) => m.type.name === "ghostText")) {
          hasGhost = true;
        }
      });
      if (!hasGhost && ghostRangeRef.current) {
        ghostRangeRef.current = null;
        lastGhostRequestRef.current = null;
        clearGhostText();
      }
    };
    const onTransaction = () => { setTimeout(checkGhost, 50); };
    editor.on("transaction", onTransaction);
    return () => { editor.off("transaction", onTransaction); };
  }, [editor, clearGhostText]);

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full bg-surface-deep">
      <EditorToolbar editor={editor} onFindReplace={() => setShowFindReplace((p) => !p)} />
      {showFindReplace && <FindReplaceBar editor={editor} onClose={() => setShowFindReplace(false)} />}

      {/* 中间行：纸张 + 侧面板 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 纸张容器 */}
        <div className="flex-1 writing-paper-container scrollbar-lumen relative">
          <div className="writing-paper">
            <EditorContent editor={editor} />
          </div>

          {!activeChapterId && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center text-text-muted">
                <p className="text-sm mb-1">选择或创建章节开始写作</p>
                <p className="text-[11px]">Ctrl+S 保存 · Ctrl+J AI · Ctrl+F 查找</p>
              </div>
            </div>
          )}

          {ghostTextContent && ghostRequestId && aiMode !== "beat_generate" && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2
              flex items-center gap-2 px-3 py-1.5 rounded-lg
              bg-primary/10 border border-primary/20 text-[11px] text-primary/80
              backdrop-blur-sm z-10"
            >
              <span className="animate-pulse">AI 生成中…</span>
              <span className="text-text-muted">Tab 接受 · Esc 拒绝</span>
              <button
                onClick={() => {
                  clearGhostText();
                  ghostRangeRef.current = null;
                  // 重新打开 Ctrl+J 面板让用户选择模式
                  const { view } = editor;
                  const { from } = view.state.selection;
                  const coords = view.coordsAtPos(from);
                  setInlineMenu({
                    visible: true,
                    position: { top: coords.bottom + 8, left: coords.left },
                  });
                }}
                className="px-2 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 cursor-pointer text-[11px]"
              >
                重新生成
              </button>
            </div>
          )}
        </div>

        {/* 侧面板（章节、AI 聊天、图标条）由 WritingMode 传入 */}
        {children}
      </div>

      <StatusBar editor={editor} />

      {inlineMenu.visible && (
        <InlineAiMenu
          editor={editor}
          position={inlineMenu.position}
          onClose={() => setInlineMenu({ visible: false, position: null })}
        />
      )}
    </div>
  );
}
