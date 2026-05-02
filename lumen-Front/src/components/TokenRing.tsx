/**
 * Token 圆形进度指示器
 *
 * - 颜色渐变：绿(0-50%) → 黄(50-75%) → 橙(75-90%) → 红(>90%)
 * - 左键点击：手动触发上下文压缩
 * - 右键菜单：token 信息 + 压缩 / 监控面板 / 配置
 */
import { useState, useCallback } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface TokenRingProps {
  percent: number;
  current: number;
  total: number;
  onCompact?: () => void;
  onOpenMonitor?: () => void;
}

/** 根据百分比计算颜色：绿 → 黄 → 橙 → 红 */
function getTokenColor(pct: number): string {
  if (pct < 50) return '#4ade80';
  if (pct < 75) return '#facc15';
  if (pct < 90) return '#f97316';
  return '#ef4444';
}

function TokenRing({ percent, current, total, onCompact, onOpenMonitor }: TokenRingProps) {
  const [isCompacting, setIsCompacting] = useState(false);

  const radius = 8;
  const stroke = 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
  const color = getTokenColor(percent);

  const handleCompact = useCallback(async () => {
    if (!onCompact || isCompacting) return;
    setIsCompacting(true);
    try {
      await onCompact();
    } finally {
      setIsCompacting(false);
    }
  }, [onCompact, isCompacting]);

  return (
    <ContextMenu>
      <ContextMenuTrigger className="contents">
        <button
          className="w-5 h-5 flex items-center justify-center cursor-pointer"
          onClick={handleCompact}
        >
          <svg width="20" height="20" className="-rotate-90">
            <circle
              cx="10" cy="10" r={radius}
              fill="none" stroke="rgba(74,71,68,0.3)" strokeWidth={stroke}
            />
            <circle
              cx="10" cy="10" r={radius}
              fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          {isCompacting && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white/60 animate-ping" />
            </div>
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        {/* Token 信息头 */}
        <div className="px-2 py-1.5 text-[10px] text-slate-500 border-b border-border/40 mb-0.5">
          <span style={{ color }} className="font-mono">{percent.toFixed(0)}%</span>
          <span className="mx-1">|</span>
          <span className="font-mono">{current.toLocaleString()} / {total.toLocaleString()}</span>
          <span className="ml-1">tokens</span>
        </div>
        <ContextMenuItem onClick={handleCompact}>
          压缩上下文
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onOpenMonitor?.()}>
          打开监控面板
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default TokenRing;
