/**
 * ChatView — NC-style full-screen chat workspace
 *
 * Layout inspired by NovelCrafter:
 * - Header + Messages + Bottom bar all constrained to max-w-3xl, centered
 * - NC dark theme (#18181b bg, zinc text hierarchy)
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useWritingChat } from "../../hooks/useWritingChat";
import { useWritingStore } from "../../stores/useWritingStore";
import * as writingApi from "../../api/writing";
import MarkdownContent from "../../components/MarkdownContent";
import type { Message, ThinkStep, ToolStep, TextStep } from "../../types/chat";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  RotateCcw,
  Send,
  StickyNote,
  FileText,
  Loader2,
} from "lucide-react";
import { cn } from "../../lib/utils";

// ── Helpers ──

function extractText(steps: Message["steps"]): string {
  if (!steps) return "";
  return steps
    .filter((s): s is TextStep => s.type === "text")
    .map((s) => s.content)
    .join("");
}

function countWords(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const englishWords = text
    .replace(/[一-鿿]/g, "")
    .split(/\s+/)
    .filter(Boolean).length;
  return chineseChars + englishWords;
}

// ── Sub Components ──

function ThinkingBubble({ step }: { step: ThinkStep }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-400 transition-colors cursor-pointer"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {step.done ? "思考过程" : "思考中..."}
        {!step.done && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {open && (
        <div className="mt-1 pl-3 py-2 border-l-2 border-zinc-700 text-xs text-zinc-500 whitespace-pre-wrap">
          {step.content}
        </div>
      )}
    </div>
  );
}

function ToolCallBubble({ step }: { step: ToolStep }) {
  const [open, setOpen] = useState(false);
  const isDone = step.status === "done";
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 text-[11px] transition-colors cursor-pointer rounded px-1.5 py-0.5",
          isDone && step.success === false
            ? "text-red-400 bg-red-950/20"
            : isDone
              ? "text-emerald-400 bg-emerald-950/20"
              : "text-zinc-500 hover:text-zinc-400",
        )}
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span className="font-mono text-[10px]">{step.name}</span>
        {!isDone && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {open && step.data != null && (
        <div className="mt-1 pl-3 py-1.5 text-[10px] text-zinc-500 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
          {typeof step.data === "string" ? step.data : JSON.stringify(step.data, null, 2) as string}
        </div>
      )}
    </div>
  );
}

function MessageActions({
  role,
  onCopy,
  onSnippet,
  onRetry,
  wordCount,
}: {
  role: "user" | "assistant";
  onCopy: () => void;
  onSnippet?: () => void;
  onRetry?: () => void;
  wordCount?: number;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-0.5 mt-1.5">
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors cursor-pointer"
      >
        <Copy className="w-3 h-3" />
        {copied ? "已复制" : "复制"}
      </button>

      {role === "assistant" && onSnippet && (
        <button
          onClick={onSnippet}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors cursor-pointer"
        >
          <StickyNote className="w-3 h-3" />
          保存为片段
        </button>
      )}

      {role === "assistant" && onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          重新生成
        </button>
      )}

      {role === "assistant" && wordCount != null && wordCount > 0 && (
        <span className="ml-auto text-[10px] text-zinc-600">{wordCount} 词</span>
      )}
    </div>
  );
}

// ── Template Options ──

const WORKSHOP_TEMPLATES = [
  { key: "chat", label: "General Chat", desc: "通用创作讨论" },
  { key: "developmental_editor", label: "Developmental Editor", desc: "开发编辑深度反馈" },
  { key: "scene_beats_from_summary", label: "Scene Beats from Summary", desc: "从摘要生成节拍" },
];

// ── Main Component ──

export function ChatView() {
  const {
    messages,
    isLoading,
    input,
    setInput,
    sendMessage,
  } = useWritingChat();

  const activeProjectId = useWritingStore((s) => s.activeProjectId);
  const createSnippetAction = useWritingStore((s) => s.createSnippetAction);
  const loadSnippets = useWritingStore((s) => s.loadSnippets);

  const [threadName, setThreadName] = useState("");
  const [showOptions, setShowOptions] = useState(true);
  const [templateKey, setTemplateKey] = useState("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  const handleSnippet = useCallback(
    async (text: string) => {
      if (!activeProjectId) return;
      const name = threadName || "Chat 片段";
      const snippet = await createSnippetAction(name);
      if (snippet?.id) {
        await writingApi.updateSnippet(snippet.id, { content: text });
        await loadSnippets(activeProjectId);
      }
    },
    [activeProjectId, createSnippetAction, loadSnippets, threadName],
  );

  const handleRetry = useCallback(() => {
    if (messages.length < 2) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      sendMessage(lastUser.content);
    }
  }, [messages, sendMessage]);

  const hasMessages = messages.length > 0;

  return (
    <div className="h-full flex flex-col bg-[#18181b]">
      {/* ── Header: Thread name ── */}
      <div className="flex-none flex justify-center pt-4 pb-2 px-4 md:px-6">
        <div className="w-full max-w-3xl flex items-center gap-2">
          <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide shrink-0">
            Name:
          </span>
          <input
            value={threadName}
            onChange={(e) => setThreadName(e.target.value)}
            placeholder="Name your thread..."
            className="flex-1 bg-transparent text-sm text-zinc-300 outline-none placeholder:text-zinc-600 border-b border-transparent hover:border-zinc-700 focus:border-zinc-500 transition-colors pb-0.5"
          />
        </div>
      </div>

      {/* ── Messages (centered) ── */}
      <div className="flex-1 overflow-y-auto flex justify-center">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-lg px-3 py-[6vh]">
            <FileText className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">
              开始一个新的聊天线程。
              <br />
              输入话题、大纲或任何想讨论的内容，AI 会基于你的世界观设定进行回复。
            </p>
            <p className="text-[11px] text-zinc-600 mt-2">
              AI 可能产生幻觉或错误信息。重要内容请核实。
            </p>
          </div>
        ) : (
          <div className="w-full max-w-3xl py-2 md:pt-6 px-2 md:px-3 flex flex-col gap-3 md:gap-6">
            {messages.map((msg) => (
              <MessageCard
                key={msg.id}
                message={msg}
                onCopy={handleCopy}
                onSnippet={handleSnippet}
                onRetry={
                  msg.role === "assistant" &&
                  messages.indexOf(msg) === messages.length - 1
                    ? handleRetry
                    : undefined
                }
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Bottom Bar (centered + sticky) ── */}
      <div className="flex-none flex justify-center border-t border-zinc-800 bg-[#18181b]">
        <div className="w-full max-w-3xl px-2 md:px-3 flex flex-col gap-1.5">
          {/* Options toggle */}
          <div className="pt-2">
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer uppercase tracking-wide"
            >
              {showOptions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showOptions ? "HIDE" : "SHOW"}
            </button>
          </div>

          {showOptions && (
            <div className="flex items-center gap-2 pb-1.5">
              <button className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-400 border border-zinc-700 hover:border-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer">
                <FileText className="w-3 h-3" />
                Context
              </button>

              <div className="relative group">
                <button className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-400 border border-zinc-700 hover:border-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer">
                  Switch prompt
                </button>
                <div className="absolute bottom-full left-0 mb-1 w-56 hidden group-hover:block z-50">
                  <div className="bg-[#18181b] border border-zinc-700 rounded-md p-1 shadow-lg">
                    {WORKSHOP_TEMPLATES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setTemplateKey(t.key)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded-sm text-[12px] transition-colors cursor-pointer",
                          templateKey === t.key
                            ? "text-zinc-100 bg-zinc-800"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50",
                        )}
                      >
                        <div>{t.label}</div>
                        <div className="text-[10px] text-zinc-500">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <span className="text-[10px] text-zinc-600 ml-auto">
                AI: {WORKSHOP_TEMPLATES.find((t) => t.key === templateKey)?.label || "General Chat"}
              </span>
            </div>
          )}

          {/* Input row */}
          <div className="flex items-end gap-2 pb-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              rows={1}
              disabled={isLoading}
              className="flex-1 bg-transparent border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-300 outline-none resize-none placeholder:text-zinc-600 focus:border-zinc-500 transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className={cn(
                "shrink-0 w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer",
                input.trim() && !isLoading
                  ? "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
              )}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Message Card ──

function MessageCard({
  message,
  onCopy,
  onSnippet,
  onRetry,
}: {
  message: Message;
  onCopy: (text: string) => void;
  onSnippet: (text: string) => void;
  onRetry?: () => void;
}) {
  const isUser = message.role === "user";
  const text = isUser ? message.content : extractText(message.steps);
  const wc = isUser ? undefined : countWords(text);
  const steps = message.steps || [];

  return (
    <div className="group">
      {isUser && (
        <div>
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-lg px-3.5 py-2.5 bg-amber-950/20 border border-amber-800/20 text-sm text-amber-100/90 leading-relaxed">
              {message.content}
            </div>
          </div>
          <div className="flex justify-end">
            <MessageActions role="user" onCopy={() => onCopy(message.content)} />
          </div>
        </div>
      )}

      {!isUser && (
        <div>
          {steps.filter((s) => s.type !== "text").map((step) => {
            if (step.type === "think") return <ThinkingBubble key={step.id} step={step} />;
            if (step.type === "tool") return <ToolCallBubble key={step.id} step={step} />;
            return null;
          })}

          {text && (
            <div className="prose prose-invert prose-sm max-w-none text-sm text-zinc-200 leading-relaxed">
              <MarkdownContent content={text} />
            </div>
          )}

          {message.isStreaming && !text && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>正在生成...</span>
            </div>
          )}

          {!message.isStreaming && text && (
            <MessageActions
              role="assistant"
              onCopy={() => onCopy(text)}
              onSnippet={() => onSnippet(text)}
              onRetry={onRetry}
              wordCount={wc}
            />
          )}
        </div>
      )}
    </div>
  );
}
