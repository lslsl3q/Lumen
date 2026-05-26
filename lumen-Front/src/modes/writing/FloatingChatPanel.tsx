/**
 * FloatingChatPanel — Write 模式下的悬浮/钉住 Chat 面板
 *
 * 两种模式：
 * - floating: fixed overlay, w-[34rem], rounded-xl, shadow-2xl
 * - pinned: flex child, 等宽侧边栏, 无圆角/阴影
 */
import { useCallback, useRef, useEffect, useState } from "react";
import { useWritingChat } from "../../hooks/useWritingChat";
import { useWritingStore } from "../../stores/useWritingStore";
import MarkdownContent from "../../components/MarkdownContent";
import type { Message, TextStep } from "../../types/chat";
import {
  Copy,
  Send,
  Loader2,
  Pin,
  PinOff,
  X,
  ArrowLeftToLine,
  ArrowRightToLine,
  MoreVertical,
} from "lucide-react";
import { cn } from "../../lib/utils";

function extractText(steps: Message["steps"]): string {
  if (!steps) return "";
  return steps
    .filter((s): s is TextStep => s.type === "text")
    .map((s) => s.content)
    .join("");
}

export function FloatingChatPanel() {
  const chatPanelMode = useWritingStore((s) => s.chatPanelMode);
  const activeThreadId = useWritingStore((s) => s.activeThreadId);
  const chatThreads = useWritingStore((s) => s.chatThreads);

  if (!activeThreadId || chatPanelMode === "none") return null;

  const activeThread = chatThreads.find((t) => t.id === activeThreadId);
  if (!activeThread) return null;

  if (chatPanelMode === "pinned") {
    return <PinnedPanel thread={activeThread} />;
  }
  return <FloatingPanel thread={activeThread} />;
}

/* ── Floating Panel ── */

function FloatingPanel({ thread }: { thread: { id: string; name: string } }) {
  const closeChatPanel = useWritingStore((s) => s.closeChatPanel);
  const toggleChatPanelPin = useWritingStore((s) => s.toggleChatPanelPin);
  const setWritingViewTab = useWritingStore((s) => s.setWritingViewTab);

  const handleOpenFull = useCallback(() => {
    closeChatPanel();
    setWritingViewTab("chat");
  }, [closeChatPanel, setWritingViewTab]);

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col bg-[var(--color-surface-base)] rounded-xl shadow-2xl ring-2 ring-zinc-800 overflow-hidden"
      style={{ width: "34rem", height: "calc(100vh - 80px)" }}
    >
      <ChatPanelContent
        thread={thread}
        mode="floating"
        onPin={toggleChatPanelPin}
        onOpenFull={handleOpenFull}
        onClose={closeChatPanel}
      />
    </div>
  );
}

/* ── Pinned Panel ── */

function PinnedPanel({ thread }: { thread: { id: string; name: string; pinned_side?: string } }) {
  const closeChatPanel = useWritingStore((s) => s.closeChatPanel);
  const toggleChatPanelPin = useWritingStore((s) => s.toggleChatPanelPin);
  const setWritingViewTab = useWritingStore((s) => s.setWritingViewTab);
  const chatPanelSide = useWritingStore((s) => s.chatPanelSide);

  const handleOpenFull = useCallback(() => {
    closeChatPanel();
    setWritingViewTab("chat");
  }, [closeChatPanel, setWritingViewTab]);

  return (
    <div
      className="flex-none flex flex-col bg-[var(--color-surface-base)] overflow-hidden"
      style={{ width: 450 }}
    >
      <ChatPanelContent
        thread={thread}
        mode="pinned"
        onPin={toggleChatPanelPin}
        onOpenFull={handleOpenFull}
        onClose={closeChatPanel}
        side={chatPanelSide}
      />
    </div>
  );
}

/* ── Shared Content ── */

function ChatPanelContent({
  thread,
  mode,
  onPin,
  onOpenFull,
  onClose,
  side = "right",
}: {
  thread: { id: string; name: string };
  mode: "floating" | "pinned";
  onPin: () => void;
  onOpenFull: () => void;
  onClose: () => void;
  side?: "left" | "right";
}) {
  const {
    messages,
    isLoading,
    input,
    setInput,
    sendMessage,
  } = useWritingChat();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [localName, setLocalName] = useState(thread.name);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // 同步外部 thread.name 变化到本地
  useEffect(() => { setLocalName(thread.name); }, [thread.name]);

  const handleNameChange = useCallback((value: string) => {
    setLocalName(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      useWritingStore.getState().updateChatThreadAction(thread.id, { name: value });
    }, 600);
  }, [thread.id]);

  const hasMessages = messages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (input.trim() && !isLoading) {
          sendMessage(input);
        }
      }
    },
    [input, isLoading, sendMessage],
  );

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
  }, [input, isLoading, sendMessage]);

  return (
    <>
      {/* Pin button — absolute positioned above panel (NC style) */}
      {mode === "floating" && (
        <div className="hidden xl:flex absolute -top-1 -translate-y-full gap-px">
          <button
            onClick={onPin}
            className="flex items-center gap-1 px-2.5 h-7 rounded-full bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-[12px] text-stone-100 transition-colors cursor-pointer"
            type="button"
          >
            <Pin className="w-3 h-3" />Pin
          </button>
        </div>
      )}

      {/* Header nav bar — NC: bg-gray-800 shadow strip */}
      <div className="flex-none bg-[var(--color-surface-elevated)] shadow relative flex gap-1.5 p-1.5 pl-2 z-20 items-center">
        {mode === "pinned" && (
          <button
            onClick={() => useWritingStore.getState().updateChatThreadAction(thread.id, { pinned_side: side === "right" ? "left" : "right" })}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/5 text-[var(--color-text-dim)] transition-colors cursor-pointer"
            title={side === "right" ? "移到左侧" : "移到右侧"}
            type="button"
          >
            {side === "right" ? <ArrowLeftToLine className="w-3.5 h-3.5" /> : <ArrowRightToLine className="w-3.5 h-3.5" />}
          </button>
        )}

        {mode === "pinned" && (
          <button
            onClick={onPin}
            className="flex items-center gap-1 px-2.5 h-7 rounded-full bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-[12px] text-stone-100 transition-colors cursor-pointer"
            type="button"
          >
            <PinOff className="w-3 h-3" />Unpin
          </button>
        )}

        {/* Name input — NC: Name: label + form-input */}
        <div className="flex gap-2 items-center flex-1 min-w-24 mr-auto">
          <span className="text-sm font-medium text-[var(--color-text-secondary)] shrink-0 hidden @xl:inline">
            Name:
          </span>
          <input
            type="text"
            value={localName}
            onChange={(e) => handleNameChange(e.target.value)}
            className="flex-1 h-9 text-sm bg-transparent text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-dim)] border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-border)] transition-colors"
            placeholder="Name your thread..."
          />
        </div>

        <button
          onClick={onOpenFull}
          className="flex-none px-2.5 py-1.5 rounded text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-stone-300 hover:text-stone-100 transition-colors cursor-pointer"
          type="button"
        >
          Open thread
        </button>

        <button
          className="flex-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/5 text-[var(--color-text-dim)] transition-colors cursor-pointer"
          type="button"
          title="Thread settings"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>

        {mode === "floating" && (
          <button
            onClick={onClose}
            className="flex-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/5 text-[var(--color-text-dim)] transition-colors cursor-pointer"
            type="button"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <p className="text-[13px] text-[var(--color-text-dim)]">
              输入话题开始对话
            </p>
          </div>
        ) : (
          <div className="py-2 px-3 flex flex-col gap-3">
            {messages.map((msg) => (
              <MiniMessageCard
                key={msg.id}
                message={msg}
                onCopy={handleCopy}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex-none border-t border-[var(--color-border)] bg-[var(--color-surface-base)] px-3 py-2">
        <div className={cn(
          "border border-[var(--color-border)] rounded-md flex flex-col",
          "bg-[var(--color-surface-elevated)]/30",
          "focus-within:border-[var(--color-border)]",
          isLoading && "opacity-50",
        )}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息…"
            rows={1}
            disabled={isLoading}
            className="w-full bg-transparent text-[13px] text-[var(--color-text-primary)] outline-none resize-none placeholder:text-[var(--color-text-dim)] px-3 py-2"
          />
          <div className="flex items-center justify-end px-2 pb-1.5">
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer",
                input.trim() && !isLoading
                  ? "bg-zinc-700 text-[var(--color-text-muted)] hover:bg-zinc-600"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
              )}
              type="button"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Mini Message Card (compact for panel) ── */

function MiniMessageCard({
  message,
  onCopy,
}: {
  message: Message;
  onCopy: (text: string) => void;
}) {
  const isUser = message.role === "user";
  const text = isUser ? message.content : extractText(message.steps);

  return (
    <div className="group/message flex flex-col gap-1">
      {isUser ? (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-[16px_4px_16px_16px] bg-[var(--color-surface-tint)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] leading-relaxed">
            {message.content}
          </div>
        </div>
      ) : (
        <>
          {text && (
            <div className="rounded-[4px_16px_16px_16px] bg-[var(--color-surface-elevated)] overflow-hidden">
              <div className="px-3 py-2 prose prose-sm prose-invert prose-stone max-w-none text-[13px] text-[var(--color-text-primary)]">
                <MarkdownContent content={text} />
              </div>
            </div>
          )}
          {message.isStreaming && !text && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-dim)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>生成中…</span>
            </div>
          )}
          {!message.isStreaming && text && (
            <div className="flex justify-start opacity-0 group-hover/message:opacity-100 transition-opacity">
              <button
                onClick={() => onCopy(text)}
                className="p-1 rounded hover:bg-white/5 text-[var(--color-text-dim)] transition-colors"
                type="button"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
