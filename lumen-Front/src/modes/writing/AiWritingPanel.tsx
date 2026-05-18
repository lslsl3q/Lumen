// @ts-nocheck — AI 功能旧组件，NC 研究后重写
/**
 * AiWritingPanel — 右栏 AI 对话助手
 *
 * 使用共享 ChatPanel + useWritingChat，复用完整的消息渲染
 * （思维链、工具调用、Steps 结构化显示）。
 * 顶部保留 WS 状态指示器（写作模式特有）。
 */
import { useWritingChat } from "../../hooks/useWritingChat";
import { SharedChatPanel, WRITING_FEATURES } from "../../components/chat";
import { useWritingStore } from "../../stores/useWritingStore";

export function AiWritingPanel() {
  const chat = useWritingChat();
  const { isConnected } = chat;
  const activeChapterId = useWritingStore((s) => s.activeChapterId);
  const activeProjectId = useWritingStore((s) => s.activeProjectId);

  const noChapter = !activeChapterId || !activeProjectId;

  return (
    <div className="flex flex-col h-full w-full bg-surface-deep border-l border-border-default">
      {/* 顶栏：WS 状态 + 章节提示 */}
      <div className="p-3 border-b border-border-default">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
            AI 对话
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
            title={isConnected ? "WS 已连接" : "WS 未连接"}
          />
        </div>
        {noChapter && (
          <p className="text-[11px] text-slate-600 mt-1">
            请先在左侧选择一个章节
          </p>
        )}
      </div>

      {/* 共享 ChatPanel */}
      <SharedChatPanel
        features={WRITING_FEATURES}
        messages={chat.messages}
        isLoading={chat.isLoading}
        input={chat.input}
        setInput={chat.setInput}
        sendMessage={chat.sendMessage}
        abort={chat.abort}
        error={chat.error}
        inputPlaceholder="和 AI 讨论剧情…"
        emptyStateContent={
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-[12px] text-slate-600">和 AI 讨论你的作品</p>
              <p className="text-[11px] mt-2 text-slate-700">
                Ctrl+J 打开内联 AI（续写/润色/扩写/精简）
              </p>
              {!isConnected && (
                <p className="text-[11px] text-red-400 mt-1">
                  WebSocket 未连接
                </p>
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}
