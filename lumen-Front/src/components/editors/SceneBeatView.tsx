/**
 * SceneBeatView — 场景节拍块的 React NodeView
 *
 * 布局：标题栏 + 指令输入区 + 设置区 + 模型选择器/Clear Beat
 * 生成时在 beat 块下方显示独立的 GenerationBar + ghost text。
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useWritingStore } from "../../stores/useWritingStore";
import { useWebSocket } from "../../hooks/useWebSocket";
import type { StreamEvent } from "../../api/chat";
import { GenerationBar } from "./GenerationBar";
import { PencilLine } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";

const WORD_LIMITS = [200, 400, 600] as const;

const TYPE_LABELS: Record<string, string> = {
  beat: "SCENE BEAT",
  continue: "CONTINUE WRITING",
};

export function SceneBeatView({ node, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const beatType = (node.attrs.beatType as string) ?? "beat";
  const maxWords = (node.attrs.maxWords as number) ?? 400;
  const status = (node.attrs.status as string) ?? "idle";
  const modelId = (node.attrs.modelId as string) ?? "";
  const collapsed = Boolean(node.attrs.collapsed);

  const activeProjectId = useWritingStore((s) => s.activeProjectId);
  const activeChapterId = useWritingStore((s) => s.activeChapterId);
  const activeProject = useWritingStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const activeChapter = useWritingStore((s) => s.chapters.find((c) => c.id === s.activeChapterId));
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

  const selectedContextIds = (node.attrs.contextIds as string[]) ?? [];
  const settings = useWritingStore((s) => s.settings);
  const selectedContexts = settings.filter((s) => selectedContextIds.includes(s.id));

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [genBarRect, setGenBarRect] = useState<{ left: number; top: number } | null>(null);

  // ── 自定义拖拽：纯 mouse 事件，不依赖 ProseMirror/HTML5 drag ──
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const pos = getPos();
    if (pos == null) return;

    // 半透明幽灵：克隆 SceneBeat 原始外观，从原位开始跟随鼠标
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

    // 插入线：宽度对齐编辑器文字区域
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

      // 吸附到段落边界：找到光标所在 block 的开头位置
      const $pos = editor.state.doc.resolve(dropResult.pos);
      // 如果在 block 中间，吸附到 block 开头
      const blockPos = $pos.before($pos.depth);
      // 目标插入位置 = block 节点之前（在它前面插入）
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
  }, [editor, getPos, beatType]);

  // 追踪 GenerationBar 浮动位置
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

  const toggleContext = useCallback(
    (id: string) => {
      const next = selectedContextIds.includes(id)
        ? selectedContextIds.filter((x: string) => x !== id)
        : [...selectedContextIds, id];
      updateAttributes({ contextIds: next });
    },
    [selectedContextIds, updateAttributes]
  );

  const removeContext = useCallback(
    (id: string) => {
      updateAttributes({ contextIds: selectedContextIds.filter((x: string) => x !== id) });
    },
    [selectedContextIds, updateAttributes]
  );

  const handleGenerate = useCallback(() => {
    if (!activeProjectId || !activeChapterId || !activeProject || !activeChapter) return;

    const beatText = node.textContent.trim();
    if (!beatText) return;

    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    generatedTextRef.current = "";
    useWritingStore.setState({ aiMode: "beat_generate" });
    clearGhostText();
    updateAttributes({ status: "generating" });
    setGenStatus("generating");
    setGenWordCount(0);

    // 把光标移到 SceneBeat 节点之后，ghost text 才会插在 beat 下方（正文区域）
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
      max_words: maxWords,
      model_id: modelId,
      request_id: requestId,
    });
  }, [
    activeChapter,
    activeChapterId,
    activeProject,
    activeProjectId,
    clearGhostText,
    editor,
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
    // 重新生成
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
        {/* 标题栏 */}
        <div className="scene-beat-header" contentEditable={false}>
          <span
            className="scene-beat-drag"
            title="拖拽排序"
            onMouseDown={handleDragStart}
          >⠿</span>
          <span className="scene-beat-type-label">{TYPE_LABELS[beatType] ?? "SCENE BEAT"}</span>
          <button
            onClick={handleToggleCollapsed}
            className="scene-beat-collapse"
            title={collapsed ? "Show" : "Hide"}
          >
            {collapsed ? "Show" : "Hide"}
          </button>
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
            <div className="scene-beat-settings" contentEditable={false}>
              {/* 字数 + 自定义 + Context 按钮一行 */}
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
                    <PencilLine size={13} />
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
                <Popover>
                  <PopoverTrigger
                    className="scene-beat-ghost-btn"
                    title="添加上下文"
                  >
                    +Context
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={4} className="scene-beat-context-dropdown">
                    {settings.length === 0 ? (
                      <div className="scene-beat-context-empty">暂无设定条目</div>
                    ) : (
                      settings.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => toggleContext(s.id)}
                          className={`scene-beat-context-item ${selectedContextIds.includes(s.id) ? "selected" : ""}`}
                        >
                          <span className="scene-beat-context-name">{s.name}</span>
                          <span className="scene-beat-context-cat">{s.category}</span>
                        </button>
                      ))
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              {/* 已选上下文标签 */}
              {selectedContexts.length > 0 && (
                <div className="scene-beat-context-tags">
                  {selectedContexts.map((ctx) => (
                    <span key={ctx.id} className="scene-beat-context-tag">
                      {ctx.name}
                      <button onClick={() => removeContext(ctx.id)}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 底部：模型选择器 + Clear Beat */}
            <div className="scene-beat-footer" contentEditable={false}>
              <button
                onClick={handleGenerate}
                className="scene-beat-generate-btn"
              >
                <span className="scene-beat-generate-icon">▶</span>
                <span className="scene-beat-generate-model">
                  {modelId || "默认模型"}
                </span>
                <span className="scene-beat-generate-dropdown">▼</span>
              </button>
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

      {/* GenerationBar — 浮动 overlay，不在编辑器文档流中 */}
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
    </NodeViewWrapper>
  );
}
