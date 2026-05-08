/**
 * ChatPanel — 向后兼容适配器
 *
 * 旧接口 → 新共享 ChatPanel 的薄包装。
 * ChatMode 无需任何改动即可继续使用。
 */
import { SharedChatPanel, CHAT_FEATURES } from './chat';
import type { Message } from '../types/chat';
import type { AuthorsNoteConfig } from '../types/authorNote';
import type { CommandResult } from '../commands/registry';

interface LegacyChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  input: string;
  error: string | null;
  sessionId: string | null;
  tokenUsage?: { current_tokens: number; context_size: number; usage_percent: number } | null;
  onInputChange: (value: string) => void;
  onSendMessage: (message: string) => void;
  onCommandResult?: (result: CommandResult) => void;
  onAbort?: () => void;
  onCompact?: () => void;
  onOpenMonitor?: () => void;
  characterName?: string;
  characterAvatar?: string | null;
  currentModel?: string;
  onModelChange?: (model: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onBranchFromMessage?: (messageId: string) => Promise<string | null>;
  responseStyle?: string;
  onResponseStyleChange?: (style: string) => void;
  authorNoteConfig?: AuthorsNoteConfig | null;
  onAuthorNoteSaveContent?: (content: string) => void;
  onAuthorNoteSetPosition?: (position: 'before_user' | 'after_user') => void;
}

function ChatPanel({
  messages,
  isLoading,
  input,
  error,
  sessionId: _sessionId,
  tokenUsage,
  onInputChange,
  onSendMessage,
  onCommandResult,
  onAbort,
  onCompact,
  onOpenMonitor,
  characterName,
  characterAvatar,
  currentModel,
  onModelChange,
  onEditMessage,
  onDeleteMessage,
  onRegenerateMessage,
  onBranchFromMessage,
  responseStyle,
  onResponseStyleChange,
  authorNoteConfig,
  onAuthorNoteSaveContent,
  onAuthorNoteSetPosition,
}: LegacyChatPanelProps) {
  return (
    <SharedChatPanel
      features={CHAT_FEATURES}
      messages={messages}
      isLoading={isLoading}
      input={input}
      setInput={onInputChange}
      sendMessage={onSendMessage}
      abort={onAbort || (() => {})}
      error={error}
      cockpitConfig={{
        characterName,
        characterAvatar,
        currentModel,
        onModelChange,
        tokenUsage,
        onCompact,
        onOpenMonitor,
        responseStyle,
        onResponseStyleChange,
      }}
      authorNoteConfig={authorNoteConfig ? {
        config: authorNoteConfig,
        onSaveContent: onAuthorNoteSaveContent || (() => {}),
        onSetPosition: onAuthorNoteSetPosition || (() => {}),
      } : undefined}
      contextMenuHandlers={{
        onEditMessage,
        onDeleteMessage,
        onRegenerateMessage,
        onBranchFromMessage,
      }}
      onCommandResult={onCommandResult}
    />
  );
}

export default ChatPanel;
export type { LegacyChatPanelProps as ChatPanelProps };
