/**
 * 聊天消息类型 — 三模式共享（Chat / Writing / RPG）
 *
 * 从 useChat.ts 提取，作为 ChatPanel 和各模式 hook 的类型契约。
 */

/** 思维阶段 */
export interface ThinkStep {
  type: 'think';
  id: number;
  content: string;
  done: boolean;
}

/** 工具调用阶段 */
export interface ToolStep {
  type: 'tool';
  id: number;
  name: string;
  command?: string;
  status: 'running' | 'done';
  success?: boolean;
  params?: Record<string, unknown>;
  error?: string;
  data?: unknown;
}

/** 文本阶段 */
export interface TextStep {
  type: 'text';
  id: number;
  content: string;
}

/** 所有阶段的联合类型 */
export type MessageStep = ThinkStep | ToolStep | TextStep;

/** 向后兼容的旧类型（历史加载兜底） */
export interface ToolCall {
  callId: number;
  name: string;
  command?: string;
  status: 'running' | 'done';
  success?: boolean;
  params?: Record<string, unknown>;
  error?: string;
  data?: unknown;
}

/** 消息 */
export interface Message {
  id: string;
  dbId?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  steps?: MessageStep[];
  toolCalls?: ToolCall[];
  thinkingContent?: string;
  thinkingDone?: boolean;
}

/** Hook 返回接口 — useChat / useWritingChat 必须实现 */
export interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  input: string;
  setInput: (val: string) => void;
  sendMessage: (content: string) => void;
  abort: () => void;
  error: string | null;
}

// ── Steps 不可变操作工具（useChat / useWritingChat 共享） ──

let _nextStepId = 0;
export function nextStepId(): number {
  return _nextStepId++;
}

export function pushStep(steps: MessageStep[], step: MessageStep): MessageStep[] {
  return [...steps, step];
}

export function updateLastStep<T extends MessageStep>(
  steps: MessageStep[],
  type: T["type"],
  updater: (step: T) => T,
): MessageStep[] {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].type === type) {
      const updated = [...steps];
      updated[i] = updater(steps[i] as T);
      return updated;
    }
  }
  return steps;
}

export function clearText(steps: MessageStep[]): MessageStep[] {
  const last = steps[steps.length - 1];
  if (last && last.type === "text") {
    return updateLastStep(steps, "text", (s: TextStep) => ({ ...s, content: "" }));
  }
  return steps;
}

export function setText(steps: MessageStep[], content: string): MessageStep[] {
  const last = steps[steps.length - 1];
  if (last && last.type === "text") {
    return updateLastStep(steps, "text", (s: TextStep) => ({ ...s, content }));
  }
  if (content) {
    return pushStep(steps, { type: "text", id: nextStepId(), content });
  }
  return steps;
}
