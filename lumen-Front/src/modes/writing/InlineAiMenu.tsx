/**
 * InlineAiMenu — Ctrl+J 浮动 AI 菜单
 *
 * 参考 Author 的内联 AI 设计：
 * - 光标处弹出浮动面板
 * - 模式按钮：续写/润色/扩写/精简（选中文本时显示）/问答
 * - 可选输入框：补充指示
 * - 生成按钮
 * - Esc 关闭
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import type { AiMode } from "../../stores/useWritingStore";
import { useWebSocket } from "../../hooks/useWebSocket";
import type { StreamEvent } from "../../api/chat";
import { Sparkles, PenLine, Expand, Shrink, MessageSquare, Loader2, X } from "lucide-react";

interface InlineAiMenuProps {
  editor: any;
  position: { top: number; left: number } | null;
  onClose: () => void;
}

const AI_MODES: {
  key: AiMode;
  label: string;
  icon: typeof Sparkles;
  needsSelection: boolean;
}[] = [
  { key: "continue", label: "续写", icon: Sparkles, needsSelection: false },
  { key: "rewrite", label: "润色", icon: PenLine, needsSelection: true },
  { key: "expand", label: "扩写", icon: Expand, needsSelection: true },
  { key: "condense", label: "精简", icon: Shrink, needsSelection: true },
  { key: "chat", label: "问答", icon: MessageSquare, needsSelection: false },
];

export function InlineAiMenu({ editor, position, onClose }: InlineAiMenuProps) {
  const {
    activeProjectId, activeChapterId,
    projects, chapters,
    setGhostText, clearGhostText,
  } = useWritingStore();

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeChapter = chapters.find((c) => c.id === activeChapterId);

  const [mode, setMode] = useState<AiMode>("continue");
  const [instruction, setInstruction] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [accumulated, setAccumulated] = useState("");
  const requestIdRef = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 判断是否有选中文本
  const hasSelection = editor?.state ? !editor.state.selection.empty : false;
  const availableModes = AI_MODES.filter((m) => !m.needsSelection || hasSelection);

  // WS 事件处理
  const handleWsEvent = useCallback((event: StreamEvent) => {
    if (event.request_id && event.request_id !== requestIdRef.current) return;
    const currentMode = mode;
    const rid = requestIdRef.current;

    switch (event.type) {
      case "text": {
        const chunk = event.content || "";
        setAccumulated((prev) => {
          const newContent = prev + chunk;

          // 续写模式 → ghost text
          if (currentMode === "continue") {
            setGhostText(newContent, rid || "");
          }
          // 润色/扩写/精简 → 也用 ghost text（替换选中文字的预览）
          if (["rewrite", "expand", "condense"].includes(currentMode)) {
            setGhostText(newContent, rid || "");
          }
          return newContent;
        });
        break;
      }
      case "done":
        setStreaming(false);
        requestIdRef.current = null;
        // 问答模式完成后不自动关闭，让用户看到结果
        break;
      case "error":
        setStreaming(false);
        requestIdRef.current = null;
        clearGhostText();
        break;
    }
  }, [mode, setGhostText, clearGhostText]);

  const { sendMessage, isConnected } = useWebSocket(handleWsEvent);

  // 聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (streaming) {
          // 流式中先停？暂时直接关
        }
        onClose();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [onClose, streaming]);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 延迟绑定，避免打开即触发
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const handleGenerate = () => {
    if (!activeProject || !activeChapter || !isConnected) return;

    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    setAccumulated("");
    setStreaming(true);

    // 获取选中文本
    const { from, to } = editor.state.selection;
    const selectedText = hasSelection ? editor.state.doc.textBetween(from, to, "\n") : "";

    // 章节上下文（限 8000 字）
    const chapterContent = activeChapter.content ?? "";
    const trimmedContent = chapterContent.length > 8000
      ? chapterContent.slice(-8000)
      : chapterContent;

    sendMessage({
      type: "writing",
      ai_mode: mode,
      book_id: activeProjectId,
      chapter_id: activeChapterId,
      chapter_title: activeChapter.title,
      chapter_content: trimmedContent,
      book_name: activeProject.name,
      selected_text: selectedText,
      content: instruction,
      request_id: requestId,
    });

    // 续写/润色/扩写/精简 发送后立即关闭面板（ghost text 在编辑器里显示）
    if (mode !== "chat") {
      onClose();
    }
  };

  if (!position) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-[380px] bg-surface-deep border border-border-default rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
      {/* 模式按钮行 */}
      <div className="flex items-center gap-0.5 px-2 py-2 border-b border-border-default">
        {availableModes.map((m) => {
          const Icon = m.icon;
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer
                ${active
                  ? "bg-primary/15 text-primary"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-elevated"
                }`}
            >
              <Icon className="w-3 h-3" />
              {m.label}
            </button>
          );
        })}

        {/* 连接状态 */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          <button onClick={onClose} className="p-0.5 text-text-muted hover:text-text-secondary cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 输入行 */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleGenerate();
            }
          }}
          placeholder={
            mode === "continue" ? "补充续写方向…（留空自动续写）"
            : mode === "rewrite" ? "补充润色要求…"
            : mode === "expand" ? "补充扩写方向…"
            : mode === "condense" ? "补充精简要求…"
            : "向 AI 提问…"
          }
          disabled={!activeChapterId || streaming}
          className="flex-1 bg-surface-deep border border-border-default rounded-lg px-3 py-1.5
            text-[12px] text-text-primary placeholder-[var(--color-text-dim)]
            focus:outline-none focus:border-primary/30 transition-colors
            disabled:opacity-50"
        />
        <button
          onClick={handleGenerate}
          disabled={!activeChapterId || streaming || !isConnected}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/15 text-primary
            hover:bg-primary/25 transition-colors cursor-pointer text-[11px] font-medium
            disabled:opacity-50"
        >
          {streaming ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          生成
        </button>
      </div>

      {/* 问答模式：显示 AI 回复 */}
      {mode === "chat" && accumulated && (
        <div className="px-3 pb-3 max-h-[200px] overflow-y-auto scrollbar-lumen">
          <div className="text-[12px] leading-relaxed text-text-primary whitespace-pre-wrap bg-surface-deep rounded-lg p-2.5">
            {accumulated}
            {streaming && <span className="animate-pulse">▊</span>}
          </div>
        </div>
      )}

      {!isConnected && (
        <div className="px-3 pb-2 text-[10px] text-red-400">
          WebSocket 未连接，请检查后端是否启动
        </div>
      )}
    </div>
  );
}
