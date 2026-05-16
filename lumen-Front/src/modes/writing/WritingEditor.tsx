/**
 * WritingEditor — 写作编辑区域
 *
 * TipTap 3.x 编辑器，HTML 格式存储，500ms 自动保存。
 * 布局：紧凑工具栏（48px）→ 编辑区 → 浮动组件。
 * Ctrl+F 打开查找替换。
 */
import { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { Fragment as PMFragment } from "@tiptap/pm/model";
import { Selection as PMSelection } from "@tiptap/pm/state";
import { defaultExtensions } from "../../components/editors/extensions";
import { useWritingStore } from "../../stores/useWritingStore";
import { SelectionToolbar } from "../../components/editors/SelectionToolbar";
import { GenerationBar } from "../../components/editors/GenerationBar";
import { useWebSocket } from "../../hooks/useWebSocket";
import type { StreamEvent } from "../../api/chat";
import { ViewTabs, type WritingView } from "./ViewTabs";
import { FormatPanel } from "./FormatPanel";
import { ChapterSelector } from "./ChapterSelector";
import { SceneMetaColumn, type SceneMeta } from "./SceneMetaColumn";
import { cn } from "../../lib/utils";
import { Eye, Type } from "lucide-react";

/* ── 保存状态指示点 ── */

function SaveStatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        status === "saved" ? "bg-green-500" :
        status === "saving" ? "bg-yellow-500 animate-pulse" :
        "bg-gray-500"
      )}
      title={status}
    />
  );
}

/* ── 紧凑工具栏（48px 单行） ── */

interface EditorToolbarProps {
  editor: any;
  activeView: WritingView;
  onViewChange: (view: WritingView) => void;
  onToggleFindReplace: () => void;
  wordCount: number;
  saveStatus: string;
  focusMode: boolean;
  typewriterMode: boolean;
  onToggleFocus: () => void;
  onToggleTypewriter: () => void;
}

function EditorToolbar({
  editor,
  activeView,
  onViewChange,
  onToggleFindReplace,
  wordCount,
  saveStatus,
  focusMode,
  typewriterMode,
  onToggleFocus,
  onToggleTypewriter,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center justify-between h-12 px-3 bg-surface-deep border-b border-border-default flex-shrink-0">
      {/* 左侧：视图标签 */}
      <ViewTabs activeView={activeView} onViewChange={onViewChange} />

      {/* 右侧：章节 + 统计 + 操作 */}
      <div className="flex items-center gap-2">
        <ChapterSelector />
        <span className="text-[11px] text-text-muted tabular-nums">{wordCount} 词</span>
        <SaveStatusDot status={saveStatus} />
        <FormatPanel editor={editor} onToggleFindReplace={onToggleFindReplace} />
        <div className="w-px h-4 bg-border-default mx-0.5" />
        <button
          onClick={onToggleFocus}
          className={cn(
            "p-1 rounded transition-colors cursor-pointer",
            focusMode ? "text-primary" : "text-text-muted hover:text-text-secondary"
          )}
          title="专注模式"
          type="button"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleTypewriter}
          className={cn(
            "p-1 rounded transition-colors cursor-pointer",
            typewriterMode ? "text-primary" : "text-text-muted hover:text-text-secondary"
          )}
          title="打字机模式"
          type="button"
        >
          <Type className="w-4 h-4" />
        </button>
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

/* ── 主组件 ── */

type TextActionMode = "expand" | "rewrite" | "condense";

export function WritingEditor({ children }: { children?: React.ReactNode }) {
  const { chapters, activeChapterId, updateChapter } = useWritingStore();
  const ghostTextContent = useWritingStore((s) => s.ghostTextContent);
  const ghostRequestId = useWritingStore((s) => s.ghostRequestId);
  const clearGhostText = useWritingStore((s) => s.clearGhostText);
  const aiMode = useWritingStore((s) => s.aiMode);

  // ── 工具栏所需 store 状态 ──
  const saveStatus = useWritingStore((s) => s.saveStatus);
  const focusMode = useWritingStore((s) => s.focusMode);
  const typewriterMode = useWritingStore((s) => s.typewriterMode);
  const toggleFocusMode = useWritingStore((s) => s.toggleFocusMode);
  const toggleTypewriterMode = useWritingStore((s) => s.toggleTypewriterMode);

  // ── 视图标签状态 ──
  const [activeView, setActiveView] = useState<WritingView>("write");

  const activeChapter = chapters.find((c) => c.id === activeChapterId);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalUpdate = useRef(false);
  const prevChapterId = useRef<string | null>(null);

  const ghostRangeRef = useRef<{ from: number; to: number } | null>(null);
  const lastGhostRequestRef = useRef<string | null>(null);

  // 替换模式：保存被替换的原始选区信息
  const ghostReplaceRef = useRef<{ from: number; to: number; originalText: string } | null>(null);

  // 当前 WS 请求 ID（用于匹配 expand/rewrite/condense 响应）
  const requestIdRef = useRef<string | null>(null);

  // ── GenerationBar 状态 ──
  const [genBarStatus, setGenBarStatus] = useState<"generating" | "done" | null>(null);
  const [genBarAnchor, setGenBarAnchor] = useState<{ left: number; top: number } | null>(null);
  const genWordCountRef = useRef(0);
  const retryParamsRef = useRef<{
    mode: TextActionMode;
    selectedText: string;
    textBefore: string;
    textAfter: string;
    bookId: string;
    chapterId: string;
    chapterTitle: string;
    chapterContent: string;
    bookName: string;
  } | null>(null);

  const [showFindReplace, setShowFindReplace] = useState(false);

  // ── SceneMeta 光标追踪状态 ──
  const [activeSceneMeta, setActiveSceneMeta] = useState<SceneMeta | null>(null);

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

  // ── WebSocket 消息处理（必须在 editor 之后）──

  const { sendMessage: wsSend } = useWebSocket(
    useCallback((event: StreamEvent) => {
      const mode = useWritingStore.getState().aiMode;
      if (!["expand", "rewrite", "condense"].includes(mode)) return;
      if (!requestIdRef.current || event.request_id !== requestIdRef.current) return;

      if (event.type === "text" && event.content) {
        const current = useWritingStore.getState().ghostTextContent;
        useWritingStore.getState().setGhostText(current + event.content, requestIdRef.current);
        genWordCountRef.current = (current + event.content).length;
      } else if (event.type === "done") {
        requestIdRef.current = null;
        setGenBarStatus("done");
      } else if (event.type === "error") {
        if (editor) editor.commands.rejectGhost();
        ghostReplaceRef.current = null;
        requestIdRef.current = null;
        setGenBarStatus(null);
        clearGhostText();
      }
    }, [editor, clearGhostText]),
  );

  // ── SceneMeta 光标追踪 ──
  useEffect(() => {
    if (!editor) return;
    const updateActiveScene = () => {
      const pos = editor.state.selection.$head;
      // Walk up the node tree to find the nearest sceneBeat node
      for (let d = pos.depth; d > 0; d--) {
        const node = pos.node(d);
        if (node.type.name === "sceneBeat") {
          setActiveSceneMeta({
            id: crypto.randomUUID(),
            beatType: node.attrs.beatType || "beat",
            title: node.attrs.beatType === "beat" ? "SCENE BEAT" : "CONTINUE WRITING",
            wordCount: node.textContent.length,
            maxWords: node.attrs.maxWords || 400,
            status: node.attrs.status || "idle",
            modelId: node.attrs.modelId || "",
            contextIds: node.attrs.contextIds || [],
            collapsed: node.attrs.collapsed || false,
          });
          return;
        }
      }
      // Cursor is not inside any sceneBeat — clear the metadata
      setActiveSceneMeta(null);
    };
    editor.on("selectionUpdate", updateActiveScene);
    return () => {
      editor.off("selectionUpdate", updateActiveScene);
    };
  }, [editor]);

  // ── 触发 AI 文本操作 ──

  const triggerWritingAction = useCallback((mode: TextActionMode) => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty || to - from < 3) return;

    const activeProjectId = useWritingStore.getState().activeProjectId;
    const activeChapterId = useWritingStore.getState().activeChapterId;
    const activeProject = useWritingStore.getState().getActiveProject();
    const activeChapter = useWritingStore.getState().getActiveChapter();
    if (!activeProjectId || !activeChapterId || !activeProject || !activeChapter) return;

    const selectedText = editor.state.doc.textBetween(from, to, "\n");

    // 提取选区前后上下文（各 500 字）
    const textBefore = editor.state.doc.textBetween(Math.max(0, from - 500), from, "\n");
    const textAfter = editor.state.doc.textBetween(to, Math.min(editor.state.doc.content.size, to + 500), "\n");

    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;

    // 保存替换数据，供 ghost text useEffect 和 Esc 恢复使用
    ghostReplaceRef.current = { from, to, originalText: selectedText };
    const gs = (editor.storage as any).ghostText;
    if (gs) gs.replaceData = { from, originalText: selectedText };

    useWritingStore.setState({ aiMode: mode });
    clearGhostText();
    setGenBarStatus("generating");
    genWordCountRef.current = 0;

    // 立即定位 GenerationBar（不等到 ghost text 到达）
    try {
      const coords = editor.view.coordsAtPos(from);
      setGenBarAnchor({ left: coords.left, top: coords.top });
    } catch { /* position invalid */ }

    const chapterContent = activeChapter.content ?? "";
    const trimmedContent = chapterContent.length > 8000 ? chapterContent.slice(-8000) : chapterContent;

    retryParamsRef.current = {
      mode, selectedText, textBefore, textAfter,
      bookId: activeProjectId, chapterId: activeChapterId,
      chapterTitle: activeChapter.title,
      chapterContent: trimmedContent,
      bookName: activeProject.name,
    };

    wsSend({
      type: "writing",
      ai_mode: mode,
      book_id: activeProjectId,
      chapter_id: activeChapterId,
      chapter_title: activeChapter.title,
      chapter_content: trimmedContent,
      book_name: activeProject.name,
      selected_text: selectedText,
      text_before_selection: textBefore,
      text_after_selection: textAfter,
      content: "",
      request_id: requestId,
    });
  }, [editor, clearGhostText, wsSend]);

  // ── GenerationBar 定位追踪 ──

  useEffect(() => {
    if (!genBarStatus || !editor) return;

    const updatePos = () => {
      const range = ghostRangeRef.current;
      if (!range) return;
      try {
        const coords = editor.view.coordsAtPos(range.from);
        setGenBarAnchor({ left: coords.left, top: coords.top });
      } catch { /* position invalid */ }
    };

    updatePos();

    const scrollEl = (editor.view.dom as HTMLElement).closest(".writing-editor-scroll");
    scrollEl?.addEventListener("scroll", updatePos, { passive: true });
    window.addEventListener("resize", updatePos, { passive: true });
    return () => {
      scrollEl?.removeEventListener("scroll", updatePos);
      window.removeEventListener("resize", updatePos);
    };
  }, [genBarStatus, editor]);

  // ── GenerationBar 回调 ──

  const handleGenApply = useCallback(() => {
    if (requestIdRef.current) {
      wsSend({ type: "cancel", session_id: `writing_direct_${requestIdRef.current}` });
    }
    requestIdRef.current = null;
    if (editor) editor.commands.acceptGhost();
    ghostReplaceRef.current = null;
    setGenBarStatus(null);
    setGenBarAnchor(null);
    clearGhostText();
  }, [editor, clearGhostText, wsSend]);

  const handleGenDiscard = useCallback(() => {
    if (requestIdRef.current) {
      wsSend({ type: "cancel", session_id: `writing_direct_${requestIdRef.current}` });
    }
    requestIdRef.current = null;
    if (editor) editor.commands.rejectGhost();
    ghostReplaceRef.current = null;
    setGenBarStatus(null);
    setGenBarAnchor(null);
    clearGhostText();
  }, [editor, clearGhostText, wsSend]);

  const handleGenStop = useCallback(() => {
    if (requestIdRef.current) {
      wsSend({ type: "cancel", session_id: `writing_direct_${requestIdRef.current}` });
    }
    if (editor) editor.commands.rejectGhost();
    ghostReplaceRef.current = null;
    requestIdRef.current = null;
    setGenBarStatus(null);
    setGenBarAnchor(null);
    clearGhostText();
  }, [editor, clearGhostText, wsSend]);

  const handleGenRetry = useCallback(() => {
    if (!editor || !retryParamsRef.current) return;
    const p = retryParamsRef.current;

    // 删掉当前 ghost text（不恢复原文，直接替换）
    const range = ghostRangeRef.current;
    if (range) {
      isInternalUpdate.current = true;
      editor.chain().focus().deleteRange(range).run();
      requestAnimationFrame(() => { isInternalUpdate.current = false; });
    }
    ghostRangeRef.current = null;
    clearGhostText();

    // 重新发送请求
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    genWordCountRef.current = 0;
    setGenBarStatus("generating");

    wsSend({
      type: "writing",
      ai_mode: p.mode,
      book_id: p.bookId,
      chapter_id: p.chapterId,
      chapter_title: p.chapterTitle,
      chapter_content: p.chapterContent,
      book_name: p.bookName,
      selected_text: p.selectedText,
      text_before_selection: p.textBefore,
      text_after_selection: p.textAfter,
      content: "",
      request_id: requestId,
    });
  }, [editor, clearGhostText, wsSend]);

  // Ctrl+F: 查找替换
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowFindReplace((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

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
    ghostReplaceRef.current = null;
    clearGhostText();
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

  // Ghost Text 流式渲染 — 使用原始 ProseMirror transaction，避免 insertContentAt 的 HTML 解析问题
  const buildGhostNodes = useCallback((text: string, schema: any) => {
    const ghostMark = schema.marks.ghostText.create();
    const lines = text.split("\n");
    const nodes: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) {
        nodes.push(schema.text(lines[i], [ghostMark]));
      }
      if (i < lines.length - 1) {
        const hardBreak = schema.nodes.hardBreak;
        if (hardBreak) nodes.push(hardBreak.create());
      }
    }
    return nodes;
  }, []);

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
    const { aiMode: mode } = useWritingStore.getState();
    if (!["continue", "rewrite", "expand", "condense", "beat_generate"].includes(mode)) return;

    isInternalUpdate.current = true;

    const { state, view } = editor;
    const { schema } = state;

    // 构建 ghost 内容节点（带 ghost mark 的 text + HardBreak）
    const nodes = buildGhostNodes(ghostTextContent, schema);
    if (nodes.length === 0) {
      requestAnimationFrame(() => { isInternalUpdate.current = false; });
      return;
    }

    const fragment = PMFragment.from(nodes);

    if (!ghostRangeRef.current) {
      // ── 首次插入 ──
      let insertPos: number;
      const { tr } = state;

      if (ghostReplaceRef.current) {
        const { from, to } = ghostReplaceRef.current;
        tr.delete(from, to);
        insertPos = from;
      } else {
        insertPos = state.selection.from;
      }

      tr.insert(insertPos, fragment);
      const endPos = insertPos + fragment.size;
      tr.setSelection(PMSelection.near(tr.doc.resolve(endPos)));
      view.dispatch(tr);

      ghostRangeRef.current = { from: insertPos, to: endPos };
    } else {
      // ── 更新（删除旧 ghost，插入新内容）──
      const range = ghostRangeRef.current;
      const { tr } = state;
      tr.delete(range.from, range.to);
      tr.insert(range.from, fragment);
      const endPos = range.from + fragment.size;
      tr.setSelection(PMSelection.near(tr.doc.resolve(endPos)));
      view.dispatch(tr);

      ghostRangeRef.current = { from: range.from, to: endPos };
    }

    const gs = (editor.storage as any).ghostText;
    if (gs) gs.ghostRange = ghostRangeRef.current;

    requestAnimationFrame(() => { isInternalUpdate.current = false; });
  }, [ghostTextContent, ghostRequestId, editor, buildGhostNodes]);

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
        ghostReplaceRef.current = null;
        clearGhostText();
      }
    };
    const onTransaction = () => { setTimeout(checkGhost, 50); };
    editor.on("transaction", onTransaction);
    return () => { editor.off("transaction", onTransaction); };
  }, [editor, clearGhostText]);

  if (!editor) return null;

  // ── 工具栏数据 ──
  const wordCount = editor?.storage?.characterCount?.words?.() ?? 0;

  const handleToggleFocus = () => {
    toggleFocusMode();
    editor?.commands?.toggleFocusMode?.();
  };

  const handleToggleTypewriter = () => {
    toggleTypewriterMode();
    const el = editor?.view?.dom as HTMLElement;
    el?.classList.toggle("typewriter-mode", !typewriterMode);
  };

  return (
    <div className="flex flex-col h-full bg-surface-deep">
      {/* 紧凑工具栏 */}
      <EditorToolbar
        editor={editor}
        activeView={activeView}
        onViewChange={setActiveView}
        onToggleFindReplace={() => setShowFindReplace((p) => !p)}
        wordCount={wordCount}
        saveStatus={saveStatus}
        focusMode={focusMode}
        typewriterMode={typewriterMode}
        onToggleFocus={handleToggleFocus}
        onToggleTypewriter={handleToggleTypewriter}
      />

      {/* 查找替换 */}
      {showFindReplace && <FindReplaceBar editor={editor} onClose={() => setShowFindReplace(false)} />}

      {/* 编辑区 + 侧面板 */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 writing-editor-scroll scrollbar-lumen relative">
          <div className="writing-editor-content">
            <EditorContent editor={editor} />
            <SelectionToolbar editor={editor} onAiAction={triggerWritingAction} hidden={!!genBarStatus} />
          </div>

          {!activeChapterId && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center text-text-muted">
                <p className="text-sm mb-1">选择或创建章节开始写作</p>
                <p className="text-[11px]">Ctrl+S 保存 · Ctrl+F 查找</p>
              </div>
            </div>
          )}

          {/* 续写模式底部提示条（continue 模式专用） */}
          {ghostTextContent && ghostRequestId && aiMode === "continue" && (
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
                }}
                className="px-2 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 cursor-pointer text-[11px]"
              >
                重新生成
              </button>
            </div>
          )}
        </div>

        {/* SceneMetaColumn — 场景节拍元数据列 */}
        <SceneMetaColumn scene={activeSceneMeta} />

        {/* 侧面板（章节、AI 聊天、图标条）由 WritingMode 传入 */}
        {children}
      </div>

      {/* GenerationBar — 用 Zustand ghostTextContent 作为主可见性守卫（同步更新，无 batch 延迟） */}
      {(() => {
        const barVisible = !!(genBarStatus && genBarAnchor && (genBarStatus === "generating" || ghostTextContent));
        return createPortal(
          <div
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: "fixed",
              left: barVisible ? genBarAnchor!.left : -9999,
              bottom: barVisible ? window.innerHeight - genBarAnchor!.top + 8 : -9999,
              zIndex: 99999,
              visibility: barVisible ? "visible" : "hidden",
              pointerEvents: barVisible ? "auto" : "none",
            }}
            contentEditable={false}
          >
            <GenerationBar
              status={genBarStatus ?? "done"}
              model="AI"
              wordCount={genWordCountRef.current}
              onApply={handleGenApply}
              onRetry={handleGenRetry}
              onDiscard={handleGenDiscard}
              onStop={handleGenStop}
            />
          </div>,
          document.body,
        );
      })()}
    </div>
  );
}
