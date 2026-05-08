/**
 * useWritingChat — 写作模式聊天状态 Hook
 *
 * 实现 UseChatReturn 接口，通过 WebSocket 与 WritingAgent 通信。
 * 复用 useChat 的 Steps 结构（think/tool/text），支持思维链和工具调用渲染。
 */
import { useState, useCallback, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import type { StreamEvent } from "../api/chat";
import type {
  Message,
  ThinkStep,
  TextStep,
  UseChatReturn,
} from "../types/chat";
import {
  pushStep,
  updateLastStep,
  clearText,
  setText,
  nextStepId,
} from "../types/chat";
import { useWritingStore } from "../stores/useWritingStore";

export function useWritingChat(): UseChatReturn & { isConnected: boolean } {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const streamingMsgIdRef = useRef<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const { sendMessage: wsSend, isConnected } = useWebSocket(
    (event: StreamEvent) => {
      // 过滤：只处理当前请求的事件
      if (
        event.request_id &&
        event.request_id !== requestIdRef.current
      )
        return;

      const msgId = streamingMsgIdRef.current;
      if (!msgId) return;

      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        const last = updated[lastIdx];
        if (!last || last.id !== msgId) return prev;

        let steps = last.steps || [];

        switch (event.type) {
          case "think_start":
            steps = pushStep(steps, {
              type: "think",
              id: nextStepId(),
              content: "",
              done: false,
            });
            break;
          case "think_content":
            steps = updateLastStep(steps, "think", (s: ThinkStep) => ({
              ...s,
              content: s.content + (event.content || ""),
            }));
            break;
          case "think_end":
            steps = updateLastStep(steps, "think", (s: ThinkStep) => ({
              ...s,
              done: true,
            }));
            break;
          case "tool_start": {
            const raw = event.tool;
            const toolNames = (Array.isArray(raw) ? raw : [raw]).filter(
              (n): n is string => typeof n === "string",
            );
            const toolCommands = Array.isArray(event.command)
              ? event.command
              : toolNames.map(() =>
                  typeof event.command === "string" ? event.command : "",
                );
            for (let i = 0; i < toolNames.length; i++) {
              steps = pushStep(steps, {
                type: "tool",
                id: nextStepId(),
                name: toolNames[i],
                command: toolCommands[i] || "",
                status: "running" as const,
                params: event.params,
              });
            }
            break;
          }
          case "tool_result":
            for (let i = steps.length - 1; i >= 0; i--) {
              const s = steps[i];
              if (
                s.type === "tool" &&
                s.status === "running" &&
                s.name === event.tool &&
                (!event.command || s.command === event.command)
              ) {
                const u2 = [...steps];
                u2[i] = {
                  ...s,
                  status: "done",
                  success: event.success,
                  error: event.error,
                  data: event.data,
                };
                steps = u2;
                break;
              }
            }
            break;
          case "text": {
            const lastStep = steps[steps.length - 1];
            if (lastStep && lastStep.type === "text") {
              steps = updateLastStep(steps, "text", (s: TextStep) => ({
                ...s,
                content: s.content + (event.content || ""),
              }));
            } else if (event.content) {
              steps = pushStep(steps, {
                type: "text",
                id: nextStepId(),
                content: event.content,
              });
            }
            break;
          }
          case "text_clear":
            steps = clearText(steps);
            break;
          case "text_set":
            steps = setText(steps, event.content || "");
            break;
          case "error":
            steps = setText(steps, `Error: ${event.message || "未知错误"}`);
            setIsLoading(false);
            streamingMsgIdRef.current = null;
            requestIdRef.current = null;
            return [
              ...updated.slice(0, -1),
              { ...last, steps, isStreaming: false },
            ];
          case "done":
            streamingMsgIdRef.current = null;
            requestIdRef.current = null;
            setIsLoading(false);
            return [
              ...updated.slice(0, -1),
              { ...last, steps, isStreaming: false },
            ];
          default:
            return prev;
        }

        return [...updated.slice(0, -1), { ...last, steps }];
      });
    },
  );

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;

      const {
        activeProjectId,
        activeChapterId,
        projects,
        chapters,
      } = useWritingStore.getState();
      const activeProject = projects.find((p) => p.id === activeProjectId);
      const activeChapter = chapters.find(
        (c) => c.id === activeChapterId,
      );

      if (!activeProject || !activeChapter) return;

      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;

      const userMessage: Message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        role: "user",
        content,
      };

      const assistantId = `msg_${Date.now() + 1}_${Math.random().toString(36).slice(2, 9)}`;
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        steps: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setIsLoading(true);
      setError(null);
      streamingMsgIdRef.current = assistantId;

      const chapterContent = activeChapter.content ?? "";
      const trimmedContent =
        chapterContent.length > 8000
          ? chapterContent.slice(-8000)
          : chapterContent;

      wsSend({
        type: "writing",
        ai_mode: "chat",
        book_id: activeProjectId,
        chapter_id: activeChapterId,
        chapter_title: activeChapter.title,
        chapter_content: trimmedContent,
        book_name: activeProject.name,
        selected_text: "",
        content,
        request_id: requestId,
      });
    },
    [wsSend],
  );

  const abort = useCallback(() => {
    wsSend({ type: "cancel", session_id: "writing" });
    streamingMsgIdRef.current = null;
    requestIdRef.current = null;
    setIsLoading(false);
  }, [wsSend]);

  return {
    messages,
    isLoading,
    input,
    setInput,
    sendMessage,
    abort,
    error,
    isConnected,
  };
}
