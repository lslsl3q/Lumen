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
  const activeChapterId = useWritingStore((s) => s.activeChapterId);
  const activeProject = useWritingStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const activeChapter = useWritingStore((s) => {
    for (const act of s.acts) {
      const ch = (act.chapters || []).find((c: any) => c.id === s.activeChapterId);
      if (ch) return ch;
    }
    return undefined;
  });
  const setGhostText = useWritingStore((s) => s.setGhostText);
  const clearGhostText = useWritingStore((s) => s.clearGhostText);

  const requestIdRef = useRef<string | null>(null);
  const generatedTextRef = useRef("");

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
  const [genBarRect, setGenBarRect] = useState<{ left: number; top: number } | null>(null);

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
      position:fixed; pointer-events:none; z-index:99999; opacity:0.5;
      width:${blockRect?.width ?? 200}px;
      left:${blockRect?.left ?? e.clientX}px;
      top:${blockRect?.top ?? e.clientY}px;
    `;
    document.body.appendChild(ghost);

    const editorEl = editor.view.dom as HTMLElement;
    const editorRect = editorEl.getBoundingClientRect();
    const dropLine = document.createElement("div");
    dropLine.style.cssText = `
      position:fixed;height:0;z-index:99998;pointer-events:none;
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

  // Track GenerationBar floating position
  useEffect(() => {
    if (genStatus === "idle" || !wrapperRef.current) {
      setGenBarRect(null);
      return;
    }
    const update = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) setGenBarRect({ left: rect.left, top: rect.bottom + 4 });
    };
    update();
    const editorEl = document.querySelector(".writing-paper");
    editorEl?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      editorEl?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [genStatus]);

  const { sendMessage: wsSend } = useWebSocket(
    useCallback((event: StreamEvent) => {
      if (!requestIdRef.current || event.request_id !== requestIdRef.current) return;

      if (event.type === "text" && event.content) {
        generatedTextRef.current += event.content;
        setGhostText(generatedTextRef.current, requestIdRef.current);
        setGenWordCount(generatedTextRef.current.trim().length);
        return;
      }

      if (event.type === "text_set") {
        generatedTextRef.current = event.content ?? "";
        setGhostText(generatedTextRef.current, requestIdRef.current);
        setGenWordCount(generatedTextRef.current.trim().length);
        return;
      }

      if (event.type === "text_clear") {
        generatedTextRef.current = "";
        clearGhostText();
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
    }, [clearGhostText, setGhostText, updateAttributes])
  );

  const updateMaxWords = useCallback(
    (value: number) => {
      updateAttributes({ maxWords: value });
      setShowCustomInput(false);
    },
    [updateAttributes]
  );

  const handleGenerate = useCallback((opts?: GenerateOptions) => {
    if (!activeProjectId || !activeChapterId || !activeProject || !activeChapter) return;

    const beatText = node.textContent.trim();
    if (!beatText) return;

    const finalMaxWords = opts?.maxWords ?? maxWords;
    const finalModelId = opts?.modelId ?? modelId;
    const finalInstructions = opts?.instructions ?? "";

    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    generatedTextRef.current = "";
    useWritingStore.setState({ aiMode: "beat_generate" });
    clearGhostText();
    updateAttributes({ status: "generating", maxWords: finalMaxWords });
    setGenStatus("generating");
    setGenWordCount(0);
    setDialogOpen(false);

    const pos = getPos();
    if (pos != null) {
      const afterBeat = pos + node.nodeSize;
      editor.chain().focus().setTextSelection(afterBeat).run();
    }

    const chapterContent = activeChapter.content ?? "";
    wsSend({
      type: "writing",
      ai_mode: "beat_generate",
      book_id: activeProjectId,
      chapter_id: activeChapterId,
      chapter_title: activeChapter.title,
      chapter_content: chapterContent.length > 8000 ? chapterContent.slice(-8000) : chapterContent,
      book_name: activeProject.name,
      selected_text: "",
      content: beatText,
      beat_text: beatText,
      max_words: finalMaxWords,
      model_id: finalModelId,
      instructions: finalInstructions,
      request_id: requestId,
      context_selection: effectiveSelection,
    });
  }, [
    activeChapter,
    activeChapterId,
    activeProject,
    activeProjectId,
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
    updateAttributes({ status: "idle" });
    setGenStatus("idle");
    requestIdRef.current = null;
    generatedTextRef.current = "";
    editor.chain().focus().acceptGhost().run();
    clearGhostText();
  }, [clearGhostText, editor, updateAttributes]);

  const handleRetry = useCallback(() => {
    handleGenerate();
  }, [handleGenerate]);

  const handleDiscard = useCallback(() => {
    updateAttributes({ status: "idle" });
    setGenStatus("idle");
    requestIdRef.current = null;
    generatedTextRef.current = "";
    editor.chain().focus().rejectGhost().run();
    clearGhostText();
  }, [clearGhostText, editor, updateAttributes]);

  const handleStop = useCallback(() => {
    if (requestIdRef.current) {
      wsSend({ type: "cancel", session_id: `writing_${activeProjectId}_${activeChapterId}` });
    }
    updateAttributes({ status: "idle" });
    setGenStatus("idle");
    requestIdRef.current = null;
  }, [activeChapterId, activeProjectId, updateAttributes, wsSend]);

  const handleClearBeat = useCallback(() => {
    editor.chain().focus().clearBeatContent().run();
  }, [editor]);

  const handleToggleCollapsed = useCallback(() => {
    updateAttributes({ collapsed: !collapsed });
  }, [collapsed, updateAttributes]);

  return (
    <NodeViewWrapper
      ref={wrapperRef}
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
                  onClick={() => setDialogOpen(true)}
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

      {/* GenerationBar — floating overlay */}
      {genStatus !== "idle" && genBarRect && createPortal(
        <div
          style={{ position: "fixed", left: genBarRect.left, top: genBarRect.top, zIndex: 99999 }}
        >
          <GenerationBar
            status={genStatus as "generating" | "done"}
            model={modelId || "默认模型"}
            wordCount={genWordCount}
            onApply={handleApply}
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
        chapterContent={activeChapter?.content ?? ""}
        chapterTitle={activeChapter?.title ?? ""}
        beatText={node.textContent.trim()}
      />
    </NodeViewWrapper>
  );
}
