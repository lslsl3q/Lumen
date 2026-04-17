/**
 * 推送通知 Toast 组件
 *
 * 通过 React Portal 渲染到 overlay-root，显示在右上角。
 * 每条通知 5 秒后自动消失（由 usePush 控制）。
 * 支持 info / warning / success / error 四种级别。
 */

import { createPortal } from 'react-dom';
import type { PushNotification as PushNotificationType } from '../hooks/usePush';

interface PushNotificationProps {
  notifications: PushNotificationType[];
  onDismiss: (id: string) => void;
}

/** 根据 level 获取颜色 */
function getLevelStyles(level: PushNotificationType['level']) {
  switch (level) {
    case 'success': return { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400' };
    case 'warning': return { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400' };
    case 'error':   return { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-400' };
    default:        return { border: 'border-teal-500/40', bg: 'bg-teal-500/10', text: 'text-teal-400' };
  }
}

/** level 对应的图标 */
function getLevelIcon(level: PushNotificationType['level']) {
  switch (level) {
    case 'success': return '✓';
    case 'warning': return '⚠';
    case 'error':   return '✕';
    default:        return '●';
  }
}

function PushNotification({ notifications, onDismiss }: PushNotificationProps) {
  if (notifications.length === 0) return null;

  const overlayRoot = document.getElementById('overlay-root');
  if (!overlayRoot) return null;

  const content = (
    <div className="pointer-events-auto fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map((n) => {
        const styles = getLevelStyles(n.level);
        return (
          <div
            key={n.id}
            className={`
              flex items-start gap-3 px-4 py-3 rounded-lg
              bg-slate-900/95 backdrop-blur-sm
              border ${styles.border}
              shadow-lg shadow-black/20
              animate-slide-in
            `}
          >
            {/* 图标 */}
            <span className={`${styles.text} text-sm mt-0.5 shrink-0`}>
              {getLevelIcon(n.level)}
            </span>

            {/* 内容 */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200">{n.title}</p>
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={() => onDismiss(n.id)}
              className="text-slate-500 hover:text-slate-300 text-xs shrink-0 mt-0.5 transition-colors"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );

  return createPortal(content, overlayRoot);
}

export default PushNotification;
