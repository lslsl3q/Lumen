/**
 * RPG 叙事消息 — 三种样式
 *
 * GM 叙事：全宽、大字号、小说排版，上下呼吸感
 * 玩家行动：`>` 引导的引用样式，左对齐与叙事同宽，橘色左边框区分
 * 系统通知：灰色居中，骰子/检定结果
 */
import MarkdownContent from '../../components/MarkdownContent';
import type { Message } from '../../hooks/useChat';

interface NarrativeMessageProps {
  message: Message;
  /** 消息在流中的索引，用于渐隐效果 */
  index: number;
  /** 总消息数，用于判断新旧 */
  total: number;
}

/** 判断消息新旧程度，返回 opacity class */
function getAgeOpacity(index: number, total: number): string {
  const distance = total - 1 - index;
  if (distance <= 1) return 'opacity-100';
  if (distance <= 3) return 'opacity-85';
  if (distance <= 6) return 'opacity-70';
  return 'opacity-50';
}

/** 系统通知消息 */
function SystemMessage({ content }: { content: string }) {
  // 提取骰子/检定相关信息做简单格式化
  const isDiceRoll = content.includes('检定') || content.includes('骰');

  return (
    <div className="flex justify-center py-2">
      <div className={`
        px-4 py-1.5 rounded-full text-xs
        ${isDiceRoll
          ? 'bg-primary/10 text-primary/80 border border-primary/20'
          : 'bg-surface-elevated/50 text-text-muted border border-border-default/30'
        }
      `}>
        {content}
      </div>
    </div>
  );
}

/** 玩家行动消息 — 右对齐，微信风格，右边框 */
function PlayerAction({ content, className }: { content: string; className: string }) {
  return (
    <div className={`px-6 py-3 min-w-0 flex justify-end ${className}`}>
      <div className="max-w-[75%] min-w-0">
        <div className="border-r-2 border-primary/60 pr-4 py-1 bg-primary/3 rounded-l-lg">
          <p className="text-[14px] text-text-primary leading-relaxed italic break-words">
            {content}
          </p>
        </div>
      </div>
    </div>
  );
}

/** GM 叙事消息 */
function GmNarrative({ content, isStreaming, className }: {
  content: string;
  isStreaming?: boolean;
  className: string;
}) {
  if (!content.trim()) return null;

  return (
    <div className={`px-6 py-4 min-w-0 ${className}`}>
      <div className="max-w-2xl mx-auto">
        <div className="text-[15px] text-text-primary/95 leading-[1.85] tracking-wide font-serif
          break-words overflow-wrap-anywhere">
          <MarkdownContent content={content} isStreaming={isStreaming} />
        </div>
      </div>
    </div>
  );
}

function NarrativeMessage({ message, index, total }: NarrativeMessageProps) {
  const opacity = getAgeOpacity(index, total);

  if (message.role === 'system') {
    return <SystemMessage content={message.content} />;
  }

  if (message.role === 'user') {
    return <PlayerAction content={message.content} className={opacity} />;
  }

  // assistant → GM 叙事
  // 如果有 steps，提取纯文本；否则用 content
  const textContent = message.steps
    ? message.steps
        .filter(s => s.type === 'text')
        .map(s => s.content)
        .join('')
    : message.content;

  return (
    <GmNarrative
      content={textContent}
      isStreaming={message.isStreaming}
      className={opacity}
    />
  );
}

export default NarrativeMessage;
