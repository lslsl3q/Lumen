// @ts-nocheck — AI 功能旧组件，NC 研究后重写
/**
 * SceneBeatView — 场景节拍块的 React NodeView
 *
 * NC-aligned visual: uniform border, translucent bg, SVG drag handle,
 * grouped context menu, dashed collapse, no divider lines.
 */
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useFloating, autoUpdate, offset } from "@floating-ui/react";
import { useWritingStore } from "../../stores/useWritingStore";
import { useWebSocket } from "../../hooks/useWebSocket";
import type { StreamEvent } from "../../api/chat";
import { GenerationBar } from "./GenerationBar";
import { GenerateTextDialog, type GenerateOptions } from "./GenerateTextDialog";
import { BeatContextMenu, ContextSelectionTags, type ContextSelection } from "./BeatContextMenu";

const WORD_LIMITS = [200, 400, 600] as const;

const TYPE_LABELS: Record<string, string> = {
  beat: "SCENE BEAT",
  continue: "CONTINUE WRITING",
};

function GripDotsIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
      <circle cx="2" cy="3" r="1.5" />
      <circle cx="7" cy="3" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
      <circle cx="7" cy="8" r="1.5" />
      <circle cx="2" cy="13" r="1.5" />
      <circle cx="7" cy="13" r="1.5" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
      className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path d="M4.5 2.5L8 6L4.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SceneBeatView({ node, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const beatType = (node.attrs.beatType as string) ?? "beat";
  const maxWords = (node.attrs.maxWords as number) ?? 400;
  const status = (node.attrs.status as string) ?? "idle";
  const modelId = (node.attrs.modelId as string) ?? "";
  const collapsed = Boolean(node.attrs.collapsed);

  const activeProjectId = useWritingStore((s) => s.activeProjectId);
  const activeProject = useWritingStore((s) => s.projects.find((p) => p.id === s.activeProjectId));

  // 从 beat 所在的场景推导章节信息（不依赖全局 activeChapterId）
  // sceneId 在组件生命周期内不变，缓存它避免重复 DOM 查询
  const sceneId = useMemo(() => {
    const editorEl = editor.view.dom as HTMLElement;
    return editorEl.closest("[data-scene-id]")?.getAttribute("data-scene-id") ?? null;
  }, [editor]);

  const chapterId = useWritingStore((s) => {
    if (sceneId) {
      for (const act of s.acts) {
        for (const ch of (act.chapters || []) as any[]) {
          if ((ch.scenes || []).some((sc: any) => sc.id === sceneId)) return ch.id;
        }
      }
    }
    return s.activeChapterId ?? "";
  });

  const chapterTitle = useWritingStore((s) => {
    if (sceneId) {
      for (const act of s.acts) {
        for (const ch of (act.chapters || []) as any[]) {
          if ((ch.scenes || []).some((sc: any) => sc.id === sceneId)) return ch.title || "";
        }
      }
    }
    return "";
  });

  const chapterContent = useWritingStore((s) => {
    if (sceneId) {
      for (const act of s.acts) {
        for (const ch of (act.chapters || []) as any[]) {
          if ((ch.scenes || []).some((sc: any) => sc.id === sceneId)) return ch.content || "";
        }
      }
    }
    return "";
  });
  const setGhostText = useWritingStore((s) => s.setGhostText);
  const clearGhostText = useWritingStore((s) => s.clearGhostText);

  const requestIdRef = useRef<string | null>(null);
  const generatedTextRef = useRef("");
  const ghostParaPosRef = useRef<number | null>(null);

  const [genStatus, setGenStatus] = useState<"idle" | "generating" | "done">(
    status === "generating" ? "generating" : status === "done" ? "done" : "idle"
  );
  const [genWordCount, setGenWordCount] = useState(0);
  const [customWords, setCustomWords] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // New structured context selection (NC-aligned)
  const contextSelection: ContextSelection = (node.attrs.contextSelection as ContextSelection) ?? {};
  const legacyContextIds = (node.attrs.contextIds as string[]) ?? [];
  // Migrate: if contextSelection is empty but legacy has IDs, use legacy
  const effectiveSelection: ContextSelection = useMemo(() => {
    if (Object.keys(contextSelection).length > 0) return contextSelection;
    if (legacyContextIds.length > 0) return { codexEntries: legacyContextIds };
    return {};
  }, [contextSelection, legacyContextIds]);

  const updateContextSelection = useCallback(
    (sel: ContextSelection) => {
      updateAttributes({ contextSelection: sel });
    },
    [updateAttributes],
  );

  const removeContextTag = useCallback(
    (key: keyof ContextSelection, id?: string) => {
      const sel = { ...effectiveSelection };
      if (key === "fullNovelText" || key === "fullOutline") {
        delete sel[key];
      } else if (id !== undefined) {
        const arr = (sel[key] as string[]) || [];
        const next = arr.filter(x => x !== id);
        if (next.length > 0) (sel as any)[key] = next;
        else delete sel[key];
      }
      updateAttributes({ contextSelection: sel });
    },
    [effectiveSelection, updateAttributes],
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showGenBar, setShowGenBar] = useState(false);

  // Floating UI 定位：自动追踪 scroll/resize，GPU 加速
  const { refs: genBarRefs, floatingStyles } = useFloating({
    open: showGenBar,
    placement: "bottom-start",
    middleware: [offset(4)],
    whileElementsMounted: autoUpdate,
  });

  // ── Custom drag: pure mouse events ──
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const pos = getPos();
    if (pos == null) return;

    const blockEl = wrapperRef.current?.querySelector<HTMLElement>(".scene-beat-block");
    const ghost = blockEl
      ? blockEl.cloneNode(true) as HTMLElement
      : document.createElement("div");
    const blockRect = blockEl?.getBoundingClientRect();
    const offsetX = e.clientX - (blockRect?.left ?? e.clientX);
    const offsetY = e.clientY - (blockRect?.top ?? e.clientY);
    ghost.style.cssText = `
      position:fixed; pointer-events:none; z-index:51; opacity:0.5;
      width:${blockRect?.width ?? 200}px;
      left:${blockRect?.left ?? e.clientX}px;
      top:${blockRect?.top ?? e.clientY}px;
    `;
    document.body.appendChild(ghost);

    const editorEl = editor.view.dom as HTMLElement;
    const editorRect = editorEl.getBoundingClientRect();
    const dropLine = document.createElement("div");
    dropLine.style.cssText = `
      position:fixed;height:0;z-index:50;pointer-events:none;
      left:${editorRect.left}px;width:${editorRect.width}px;
      border-top:1px solid var(--color-text-secondary,#888);
    `;
    dropLine.style.display = "none";
    document.body.appendChild(dropLine);

    const fromPos = pos;
    let targetPos: number | null = null;

    const onMouseMove = (me: MouseEvent) => {
      ghost.style.left = `${me.clientX - offsetX}px`;
      ghost.style.top = `${me.clientY - offsetY}px`;

      const dropResult = editor.view.posAtCoords({ left: me.clientX, top: me.clientY });
      if (!dropResult) { dropLine.style.display = "none"; targetPos = null; return; }

      const $pos = editor.state.doc.resolve(dropResult.pos);
      const blockPos = $pos.before($pos.depth);
      targetPos = blockPos;

      try {
        const coords = editor.view.coordsAtPos(blockPos);
        dropLine.style.top = `${coords.top - 1}px`;
        dropLine.style.display = "block";
      } catch {
        dropLine.style.display = "none";
      }
    };

    const onMouseUp = () => {
      ghost.remove();
      dropLine.remove();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      if (targetPos == null || targetPos === fromPos) return;

      const node = editor.state.doc.nodeAt(fromPos);
      if (!node) return;

      let adjustedTo = targetPos > fromPos ? targetPos - node.nodeSize : targetPos;
      if (adjustedTo < 0) adjustedTo = 0;
      if (adjustedTo === fromPos) return;

      const tr = editor.state.tr;
      tr.delete(fromPos, fromPos + node.nodeSize);
      tr.insert(adjustedTo, node.copy(node.content));
      editor.view.dispatch(tr);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [editor, getPos]);

  // 控制 GenerationBar 显示/隐藏
  useEffect(() => {
    setShowGenBar(genStatus !== "idle");
  }, [genStatus]);

  /** 更新编辑器中的 ghost 段落内容 */
  const updateGhostParagraph = useCallback((text: string) => {
    const ghostPos = ghostParaPosRef.current;
    if (ghostPos == null) return;

    try {
      const ghostNode = editor.state.doc.nodeAt(ghostPos);
      if (!ghostNode) return;

      const ghostMark = editor.schema.marks.ghostText;
      if (!ghostMark) return;

      const textNode = text ? editor.schema.text(text, [ghostMark.create()]) : null;
      const newPara = editor.schema.nodes.paragraph.create(null, textNode ? [textNode] : []);

      const tr = editor.state.tr;
      tr.replaceWith(ghostPos, ghostPos + ghostNode.nodeSize, newPara);
      tr.setMeta("ghostText", true);
      editor.view.dispatch(tr);
    } catch (e) {
      console.warn("[Beat] updateGhostParagraph failed:", e);
    }
  }, [editor]);

  const { sendMessage: wsSend } = useWebSocket(
    useCallback((event: StreamEvent) => {
      if (!requestIdRef.current || event.request_id !== requestIdRef.current) return;

      if (event.type === "text" && event.content) {
        generatedTextRef.current += event.content;
        updateGhostParagraph(generatedTextRef.current);
        setGenWordCount(generatedTextRef.current.trim().length);
        return;
      }

      if (event.type === "text_set") {
        generatedTextRef.current = event.content ?? "";
        updateGhostParagraph(generatedTextRef.current);
        setGenWordCount(generatedTextRef.current.trim().length);
        return;
      }

      if (event.type === "text_clear") {
        generatedTextRef.current = "";
        updateGhostParagraph("");
        setGenWordCount(0);
        return;
      }

      if (event.type === "done") {
        updateAttributes({ status: "done" });
        setGenStatus("done");
        requestIdRef.current = null;
        return;
      }

      if (event.type === "error") {
        updateAttributes({ status: "idle" });
        setGenStatus("idle");
        requestIdRef.current = null;
      }
    }, [updateAttributes, updateGhostParagraph])
  );

  const updateMaxWords = useCallback(
    (value: number) => {
      updateAttributes({ maxWords: value });
      setShowCustomInput(false);
    },
    [updateAttributes]
  );

  const handleGenerate = useCallback((opts?: GenerateOptions) => {
    if (!activeProjectId || !chapterId || !activeProject) return;

    const beatText = node.textContent.trim();
    if (!beatText) return;

    const finalMaxWords = opts?.maxWords ?? maxWords;
    const finalModelId = opts?.modelId ?? modelId;
    const finalInstructions = opts?.instructions ?? "";

    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    generatedTextRef.current = "";
    ghostParaPosRef.current = null;
    useWritingStore.setState({ aiMode: "beat_generate" });
    clearGhostText();
    updateAttributes({ status: "generating", maxWords: finalMaxWords });
    setGenStatus("generating");
    setGenWordCount(0);
    setDialogOpen(false);

    // 在 beat 后面插入空段落（ghost text 容器），立即推下后面的组件
    const pos = getPos();
    if (pos != null) {
      try {
        const afterBeat = pos + node.nodeSize;
        const emptyPara = editor.schema.nodes.paragraph.create(null);
        const tr = editor.state.tr.insert(afterBeat, emptyPara);
        tr.setMeta("ghostText", true);
        editor.view.dispatch(tr);
        ghostParaPosRef.current = afterBeat;
      } catch (e) {
        console.warn("[Beat] 插入 ghost 段落失败:", e);
      }
    }

    const trimmedContent = chapterContent.length > 8000 ? chapterContent.slice(-8000) : chapterContent;
    const payload = {
      type: "writing" as const,
      ai_mode: "beat_generate" as const,
      book_id: activeProjectId,
      chapter_id: chapterId,
      chapter_title: chapterTitle,
      chapter_content: trimmedContent,
      book_name: activeProject.name,
      selected_text: "",
      content: beatText,
      beat_text: beatText,
      max_words: finalMaxWords,
      model_id: finalModelId,
      instructions: finalInstructions,
      request_id: requestId,
      context_selection: effectiveSelection,
    };
    wsSend(payload);
  }, [
    activeProject,
    activeProjectId,
    chapterContent,
    chapterId,
    chapterTitle,
    clearGhostText,
    editor,
    effectiveSelection,
    getPos,
    maxWords,
    modelId,
    node,
    updateAttributes,
    wsSend,
  ]);

  const handleApply = useCallback(() => {
    try { editor.commands.acceptGhost(); } catch {}
    updateAttributes({ status: "idle" });
    setGenStatus("idle");
    requestIdRef.current = null;
    generatedTextRef.current = "";
    ghostParaPosRef.current = null;
    clearGhostText();
  }, [clearGhostText, editor, updateAttributes]);

  const handleApplySection = useCallback(() => {
    const text = generatedTextRef.current;
    if (!text.trim()) {
      // 没有文字，删除空 ghost 段落
      editor.chain().focus().rejectGhost().run();
      updateAttributes({ status: "idle" });
      setGenStatus("idle");
      requestIdRef.current = null;
      generatedTextRef.current = "";
      ghostParaPosRef.current = null;
      clearGhostText();
      return;
    }

    // 先 reject ghost（删除 ghost 段落），再插入 SectionBlock
    try { editor.commands.rejectGhost(); } catch {}

    const pos = getPos();
    if (pos != null) {
      const afterBeat = pos + node.nodeSize;
      const paragraphs = text
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => ({
          type: "paragraph" as const,
          content: [{ type: "text" as const, text: line }],
        }));

      editor.chain().focus().insertContentAt(afterBeat, {
        type: "sectionBlock",
        attrs: { title: modelId || "AI" },
        content: paragraphs,
      }).run();
    }

    updateAttributes({ status: "idle" });
    setGenStatus("idle");
    requestIdRef.current = null;
    generatedTextRef.current = "";
    ghostParaPosRef.current = null;
    clearGhostText();
  }, [clearGhostText, editor, getPos, modelId, node, updateAttributes]);

  const handleRetry = useCallback(() => {
    // 先清理幽灵文字
    try { editor.commands.rejectGhost(); } catch {}

    // 删除残留的空段落节点（rejectGhost 可能只移除 mark 不删节点）
    const ghostPos = ghostParaPosRef.current;
    if (ghostPos != null) {
      try {
        const ghostNode = editor.state.doc.nodeAt(ghostPos);
        if (ghostNode) {
          const tr = editor.state.tr.delete(ghostPos, ghostPos + ghostNode.nodeSize);
          tr.setMeta("ghostText", true);
          editor.view.dispatch(tr);
        }
      } catch {}
    }

    ghostParaPosRef.current = null;
    generatedTextRef.current = "";
    handleGenerate();
  }, [editor, handleGenerate]);

  const handleDiscard = useCallback(() => {
    try { editor.commands.rejectGhost(); } catch {}
    updateAttributes({ status: "idle" });
    setGenStatus("idle");
    requestIdRef.current = null;
    generatedTextRef.current = "";
    ghostParaPosRef.current = null;
    clearGhostText();
  }, [clearGhostText, editor, updateAttributes]);

  const handleStop = useCallback(() => {
    if (requestIdRef.current) {
      wsSend({ type: "cancel", session_id: `writing_${activeProjectId}_${chapterId}` });
    }
    // Stop ≠ Discard：保留已输出的部分，切到 done 让用户选择 Apply/Retry/Discard
    updateAttributes({ status: "done" });
    setGenStatus("done");
    requestIdRef.current = null;
  }, [activeProjectId, chapterId, updateAttributes, wsSend]);

  const handleClearBeat = useCallback(() => {
    editor.chain().focus().clearBeatContent().run();
  }, [editor]);

  const handleToggleCollapsed = useCallback(() => {
    updateAttributes({ collapsed: !collapsed });
  }, [collapsed, updateAttributes]);

  return (
    <NodeViewWrapper
      ref={(node) => {
        wrapperRef.current = node;
        genBarRefs.setReference(node);
      }}
      className={`scene-beat-wrapper ${collapsed ? "scene-beat-collapsed" : ""}`}
    >
      <div className="scene-beat-block">
        {/* Header bar */}
        <div className="scene-beat-header" contentEditable={false}>
          <span
            className="scene-beat-drag"
            title="拖拽排序"
            onMouseDown={handleDragStart}
          >
            <GripDotsIcon />
          </span>
          <button
            onClick={handleToggleCollapsed}
            className="scene-beat-collapse"
            title={collapsed ? "展开" : "折叠"}
          >
            <ChevronIcon open={!collapsed} />
          </button>
          <span className="scene-beat-type-label">{TYPE_LABELS[beatType] ?? "SCENE BEAT"}</span>
          <button
            onClick={deleteNode}
            className="scene-beat-delete"
            title="删除此节拍"
          >
            ✕
          </button>
        </div>

        {!collapsed && (
          <>
            <NodeViewContent className="scene-beat-content" />

            {/* Settings: word chips + context + tags */}
            <div className="scene-beat-settings" contentEditable={false}>
              <div className="scene-beat-toolbar">
                <div className="scene-beat-word-chips">
                  {WORD_LIMITS.map((w) => (
                    <button
                      key={w}
                      onClick={() => updateMaxWords(w)}
                      className={`scene-beat-chip ${maxWords === w ? "scene-beat-chip-active" : ""}`}
                    >
                      {w}
                    </button>
                  ))}
                  {!WORD_LIMITS.includes(maxWords as any) && (
                    <button className="scene-beat-chip scene-beat-chip-active">
                      {maxWords}
                    </button>
                  )}
                  <button
                    onClick={() => setShowCustomInput(!showCustomInput)}
                    className="scene-beat-ghost-btn"
                    title="自定义字数"
                  >
                    …
                  </button>
                  {showCustomInput && (
                    <input
                      autoFocus
                      type="number"
                      value={customWords}
                      onChange={(e) => setCustomWords(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const v = parseInt(customWords, 10);
                          if (v > 0) updateMaxWords(v);
                        }
                      }}
                      placeholder="字数..."
                      className="scene-beat-custom-input"
                    />
                  )}
                </div>

                {/* Context button — shadcn DropdownMenu */}
                <BeatContextMenu
                  selection={effectiveSelection}
                  onChange={updateContextSelection}
                >
                  <button
                    className="scene-beat-ghost-btn"
                    title="添加上下文"
                    type="button"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M6 1.5v9M1.5 6h9" strokeLinecap="round" />
                    </svg>
                    Context
                  </button>
                </BeatContextMenu>
              </div>

              {/* Selected context tags */}
              <ContextSelectionTags
                selection={effectiveSelection}
                onRemove={removeContextTag}
              />
            </div>

            {/* Footer: generate button group + clear beat */}
            <div className="scene-beat-footer" contentEditable={false}>
              <div className="scene-beat-generate-group">
                <button
                  onClick={() => handleGenerate()}
                  className="scene-beat-generate-btn"
                >
                  <span className="scene-beat-generate-icon">▶</span>
                  <span className="scene-beat-generate-model">
                    {modelId || "默认模型"}
                  </span>
                </button>
                <div className="scene-beat-generate-divider" />
                <button
                  className="scene-beat-generate-dropdown"
                  title="切换模型"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2.5 3.75L5 6.25L7.5 3.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <button
                onClick={handleClearBeat}
                className="scene-beat-clear-btn"
                title="清除到下一个节拍之间的文字"
              >
                Clear Beat ↓
              </button>
            </div>
          </>
        )}
      </div>

      {/* GenerationBar — floating overlay via Floating UI */}
      {showGenBar && createPortal(
        <div
          ref={genBarRefs.setFloating}
          style={{ ...floatingStyles, zIndex: 50 }}
        >
          <GenerationBar
            status={genStatus as "generating" | "done"}
            model={modelId || "默认模型"}
            wordCount={genWordCount}
            onApply={handleApply}
            onSection={handleApplySection}
            onRetry={handleRetry}
            onDiscard={handleDiscard}
            onStop={handleStop}
          />
        </div>,
        document.body,
      )}

      {/* Generate Text Dialog */}
      <GenerateTextDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onGenerate={handleGenerate}
        defaultMaxWords={maxWords}
        defaultModelId={modelId}
        contextIds={(effectiveSelection.codexEntries as string[]) ?? []}
        chapterContent={chapterContent}
        chapterTitle={chapterTitle}
        beatText={node.textContent.trim()}
      />
    </NodeViewWrapper>
  );
}
