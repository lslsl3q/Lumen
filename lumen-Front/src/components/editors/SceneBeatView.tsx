// @ts-nocheck — AI 功能旧组件，NC 研究后重写
/**
 * SceneBeatView — 场景节拍块的 React NodeView
 *
 * NC-aligned visual: uniform border, translucent bg, SVG drag handle,
 * grouped context menu, dashed collapse, no divider lines.
 */
import { useState, useCallback, useRef, useEffect, useMemo, useReducer } from "react";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "../ui/dropdown-menu";
import { useModels } from "../../hooks/useModels";
import { GripDotsIcon, useBlockDrag } from "./BlockDragHandle";

import { type PromptPreset, loadPresets } from "./preset-types";

const WORD_LIMITS = [200, 400, 600] as const;

/**
 * 递归提取 ProseMirror 节点中的纯文本。
 * 跳过 hideFromAI=true 的 sectionBlock 及其所有子节点。
 */
function _extractNodeText(node: any, hidden = false): string {
  if (!hidden && node.type?.name === 'sectionBlock' && node.attrs?.hideFromAI) {
    hidden = true;
  }
  if (node.type?.name === 'text' && node.text && !hidden) return node.text;
  if (!node.content || node.content.size === 0) return '';
  const parts: string[] = [];
  node.content.forEach((child: any) => {
    const t = _extractNodeText(child, hidden);
    if (t) parts.push(t);
  });
  return parts.join('\n');
}

/**
 * 提取当前场景中 beat 位置之前的纯文本。
 * 遍历 beat 所在 scene 节点内的前序兄弟节点，递归提取文本。
 * 跳过 hideFromAI=true 的 sectionBlock 和 sceneBeat 节点自身。
 */
function extractWordsBeforeBeat(editor: any, getPos: () => number | undefined): string {
  const pos = getPos();
  if (pos == null) return '';

  const $pos = editor.state.doc.resolve(pos);
  let sceneDepth = -1;
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'scene') {
      sceneDepth = d;
      break;
    }
  }
  if (sceneDepth < 0) return '';

  const sceneNode = $pos.node(sceneDepth);
  const sceneStart = $pos.start(sceneDepth);
  const beatOffsetInScene = pos - sceneStart;

  const texts: string[] = [];
  sceneNode.content.forEach((child: any, offset: number) => {
    if (offset >= beatOffsetInScene) return;
    if (child.type.name === 'sceneBeat') return;
    const t = _extractNodeText(child);
    if (t) texts.push(t);
  });

  const full = texts.join('\n');
  return full.length > 8000 ? full.slice(-8000) : full;
}

const TYPE_LABELS: Record<string, string> = {
  beat: "SCENE BEAT",
  continue: "CONTINUE WRITING",
};

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

  // Force re-render when node.attrs changes (TipTap NodeView workaround)
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const attrsKey = useMemo(() => JSON.stringify({
    maxWords: node.attrs.maxWords,
    modelId: node.attrs.modelId,
    collapsed: node.attrs.collapsed
  }), [node.attrs.maxWords, node.attrs.modelId, node.attrs.collapsed]);

  useEffect(() => {
    forceUpdate();
  }, [attrsKey]);

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const { models } = useModels();
  const [presets, setPresets] = useState<PromptPreset[]>([]);

  const templateName = useMemo(() => "writing/beat_generate", []);

  // Load presets when templateName is available
  useEffect(() => {
    if (templateName) setPresets(loadPresets(templateName));
  }, [templateName]);

  // Track last used preset+model for quick-access
  const lastPresetId = (node.attrs.lastPresetId as string) ?? "";
  const lastPreset = presets.find(p => p.id === lastPresetId) ?? null;

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

  // ── Custom drag: shared hook ──
  const handleDragStart = useBlockDrag(editor, getPos, wrapperRef, ".scene-beat-block");

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
    },
    [updateAttributes]
  );

  const updateModelId = useCallback(
    (value: string) => {
      updateAttributes({ modelId: value });
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

    const wordsBefore = extractWordsBeforeBeat(editor, getPos());
    const payload = {
      type: "writing" as const,
      ai_mode: "beat_generate" as const,
      book_id: activeProjectId,
      chapter_id: chapterId,
      scene_id: sceneId ?? '',
      chapter_title: chapterTitle,
      chapter_content: wordsBefore,
      book_name: activeProject.name,
      selected_text: "",
      content: beatText,
      beat_text: beatText,
      max_words: finalMaxWords,
      model_id: finalModelId,
      instructions: finalInstructions,
      request_id: requestId,
      context_selection: effectiveSelection,
      ...(opts?.inputValues || {}),
    };
    wsSend(payload);
  }, [
    activeProject,
    activeProjectId,
    chapterId,
    chapterTitle,
    clearGhostText,
    editor,
    effectiveSelection,
    getPos,
    maxWords,
    modelId,
    node,
    sceneId,
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
            className="block-drag-handle"
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
            </svg>
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
                    onClick={() => setDialogOpen(true)}
                    className="scene-beat-ghost-btn"
                    title="自定义字数"
                  >
                    …
                  </button>
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
                  <span className="scene-beat-generate-icon">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M5.5 4.5L9.5 7L5.5 9.5Z" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="scene-beat-generate-label">
                    <span className="scene-beat-generate-preset">{lastPreset?.name ?? "General Purpose"}</span>
                    <span className="scene-beat-generate-model">{modelId || "默认模型"}</span>
                  </span>
                </button>
                <div className="scene-beat-generate-divider" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="scene-beat-generate-dropdown"
                      title="生成选项"
                      type="button"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2.5 3.75L5 6.25L7.5 3.75" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={4} className="scene-beat-menu-root">
                    {/* Quick: last used preset+model */}
                    {lastPreset && (
                      <DropdownMenuItem
                        onClick={() => {
                          updateAttributes({ modelId: lastPreset.modelId, lastPresetId: lastPreset.id });
                          handleGenerate({
                            modelId: lastPreset.modelId,
                            maxWords: Number(lastPreset.fields.words?.value) || maxWords,
                            instructions: String(lastPreset.fields.instructions?.value ?? ""),
                          });
                        }}
                      >
                        <span className="scene-beat-menu-quick">
                          Last used: {lastPreset.name} ({lastPreset.modelId || "default"})
                        </span>
                      </DropdownMenuItem>
                    )}
                    {lastPreset && <DropdownMenuSeparator />}

                    {/* Custom presets — expandable submenus */}
                    {presets.map((preset) => (
                      <DropdownMenuSub key={preset.id}>
                        <DropdownMenuSubTrigger>
                          <span className="scene-beat-menu-preset-icon">✦</span>
                          {preset.name}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="scene-beat-model-submenu">
                          <DropdownMenuGroup>
                            <div className="scene-beat-model-list">
                              {models.map((m) => (
                                <DropdownMenuItem
                                  key={m.id}
                                  onClick={() => {
                                    updateAttributes({ modelId: m.id, lastPresetId: preset.id });
                                    handleGenerate({
                                      modelId: m.id,
                                      maxWords: Number(preset.fields.words?.value) || maxWords,
                                      instructions: String(preset.fields.instructions?.value ?? ""),
                                    });
                                  }}
                                >
                                  {m.id}
                                </DropdownMenuItem>
                              ))}
                              {models.length === 0 && (
                                <DropdownMenuItem disabled>No models</DropdownMenuItem>
                              )}
                            </div>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => {
                            updateAttributes({ modelId: preset.modelId, lastPresetId: preset.id });
                            setDialogOpen(true);
                          }}>
                            ⚙ Tweak and generate...
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))}

                    {/* System default — expandable */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <span className="scene-beat-menu-preset-icon">◇</span>
                        General Purpose
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="scene-beat-model-submenu">
                        <DropdownMenuGroup>
                          <div className="scene-beat-model-list">
                            {models.map((m) => (
                              <DropdownMenuItem
                                key={m.id}
                                onClick={() => {
                                  updateAttributes({ modelId: m.id, lastPresetId: "" });
                                  handleGenerate({ modelId: m.id });
                                }}
                              >
                                {m.id}
                              </DropdownMenuItem>
                            ))}
                            {models.length === 0 && (
                              <DropdownMenuItem disabled>No models</DropdownMenuItem>
                            )}
                          </div>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => {
                          updateAttributes({ lastPresetId: "" });
                          setDialogOpen(true);
                        }}>
                          ⚙ Tweak and generate...
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    {/* Actions */}
                    <DropdownMenuItem onClick={() => setDialogOpen(true)}>
                      ⚙ Tweak and generate...
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled>
                      Configure prompts and defaults...
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
        defaultContextSelection={effectiveSelection}
        onMaxWordsChange={updateMaxWords}
        onModelChange={updateModelId}
        onContextChange={updateContextSelection}
        contextIds={(effectiveSelection.codexEntries as string[]) ?? []}
        chapterContent={chapterContent}
        chapterTitle={chapterTitle}
        beatText={node.textContent.trim()}
        templateName={templateName}
      />
    </NodeViewWrapper>
  );
}
