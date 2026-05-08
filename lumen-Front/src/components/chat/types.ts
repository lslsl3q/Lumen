/**
 * ChatPanel 共享类型 — Features 配置 + Props 接口
 *
 * 三模式通过 features 对象控制 ChatPanel 渲染哪些 UI 元素。
 * 所有组件均为"Dumb Components"：不直接访问 store，数据全由 props 传入。
 */
import type { ReactNode } from "react";
import type { Message } from "../../types/chat";
import type { CommandResult } from "../../commands/registry";
import type { AuthorsNoteConfig } from "../../types/authorNote";

// ── Features 开关 ──

export interface ChatPanelFeatures {
  /** 驾驶舱面板（模型选择 + token 环形图） */
  cockpit: boolean;
  /** Author's Note 编辑面板 */
  authorNote: boolean;
  /** Slash 命令面板 */
  commands: boolean;
  /** 右键上下文菜单（编辑/删除/重新生成/分支） */
  contextMenu: boolean;
  /** 多行输入框（textarea），false = 单行 input */
  multilineInput: boolean;
  /** 工具调用渲染（ToolCallBlock） */
  toolRendering: boolean;
  /** 思维链渲染（ThinkingBubble） */
  thinkingRendering: boolean;
  /** Token 用量环形图 */
  tokenUsage: boolean;
  /** 自定义空状态内容 */
  emptyState: boolean;
}

// ── 功能预设 ──

/** Chat 模式：全功能 */
export const CHAT_FEATURES: ChatPanelFeatures = {
  cockpit: true,
  authorNote: true,
  commands: true,
  contextMenu: true,
  multilineInput: true,
  toolRendering: true,
  thinkingRendering: true,
  tokenUsage: true,
  emptyState: true,
};

/** Writing 模式：工具+思维+多行，无驾驶舱/AN/命令/右键菜单 */
export const WRITING_FEATURES: ChatPanelFeatures = {
  cockpit: false,
  authorNote: false,
  commands: false,
  contextMenu: false,
  multilineInput: true,
  toolRendering: true,
  thinkingRendering: true,
  tokenUsage: false,
  emptyState: true,
};

/** RPG 模式：极简（用 renderMessage 自定义叙事消息） */
export const RPG_FEATURES: ChatPanelFeatures = {
  cockpit: false,
  authorNote: false,
  commands: false,
  contextMenu: false,
  multilineInput: false,
  toolRendering: false,
  thinkingRendering: false,
  tokenUsage: false,
  emptyState: true,
};

// ── Token 用量 ──

export interface TokenUsageData {
  current_tokens: number;
  context_size: number;
  usage_percent: number;
}

// ── ChatPanel Props ──

export interface ChatPanelProps {
  /** Features 配置，控制渲染哪些 UI 元素 */
  features: ChatPanelFeatures;

  // ── 核心 8 个（UseChatReturn 契约） ──
  messages: Message[];
  isLoading: boolean;
  input: string;
  setInput: (val: string) => void;
  sendMessage: (content: string) => void;
  abort: () => void;
  error: string | null;

  // ── 驾驶舱（features.cockpit 时需要） ──
  cockpitConfig?: {
    characterName?: string;
    characterAvatar?: string | null;
    currentModel?: string;
    onModelChange?: (model: string) => void;
    tokenUsage?: TokenUsageData | null;
    onCompact?: () => void;
    onOpenMonitor?: () => void;
    responseStyle?: string;
    onResponseStyleChange?: (style: string) => void;
  };

  // ── Author's Note（features.authorNote 时需要） ──
  authorNoteConfig?: {
    config: AuthorsNoteConfig | null;
    onSaveContent: (content: string) => void;
    onSetPosition: (position: "before_user" | "after_user") => void;
  };

  // ── 右键菜单（features.contextMenu 时需要） ──
  contextMenuHandlers?: {
    onEditMessage?: (messageId: string, newContent: string) => void;
    onDeleteMessage?: (messageId: string) => void;
    onRegenerateMessage?: (messageId: string) => void;
    onBranchFromMessage?: (messageId: string) => Promise<string | null>;
  };

  // ── 命令系统（features.commands 时需要） ──
  onCommandResult?: (result: CommandResult) => void;

  // ── 渲染插槽 ──

  /** 自定义消息渲染（RPG 用这个替换 MessageBubble） */
  renderMessage?: (message: Message, index: number) => ReactNode;

  /** 自定义空状态内容 */
  emptyStateContent?: ReactNode;

  /** 输入框占位文本 */
  inputPlaceholder?: string;

  /** 容器 className（方便外部控制尺寸） */
  className?: string;
}
