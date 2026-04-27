/**
 * Token 圆形进度指示器
 *
 * - 颜色渐变：绿(0-50%) → 黄(50-75%) → 橙(75-90%) → 红(>90%)
 * - 左键点击：手动触发上下文压缩
 * - 右键菜单：压缩 / 跳转配置
 * - 悬停 tooltip 显示详情
 * - tooltip 和菜单通过 Portal 渲染到 body，避免被 overflow-hidden 裁剪
 */
import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface TokenRingProps {
  percent: number;
  current: number;
  total: number;
  onCompact?: () => void;
  onOpenConfig?: () => void;
}

/** 根据百分比计算颜色：绿 → 黄 → 橙 → 红 */
function getTokenColor(pct: number): string {
  if (pct < 50) return '#4ade80';       // 绿
  if (pct < 75) return '#facc15';       // 黄
  if (pct < 90) return '#f97316';       // 橙
  return '#ef4444';                      // 红
}

function TokenRing({ percent, current, total, onCompact, onOpenConfig }: TokenRingProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLDivElement>(null);

  const radius = 8;
  const stroke = 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
  const color = getTokenColor(percent);

  // 根据按钮位置计算弹出坐标（fixed 定位，相对于 viewport）
  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPopupPos({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    });
  }, []);

  // 悬停时更新位置
  useLayoutEffect(() => {
    if (hovering || menuOpen) updatePosition();
  }, [hovering, menuOpen, updatePosition]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // 左键：手动压缩
  const handleClick = useCallback(async () => {
    if (!onCompact || isCompacting) return;
    setIsCompacting(true);
    try {
      await onCompact();
    } finally {
      setIsCompacting(false);
    }
    setMenuOpen(false);
  }, [onCompact, isCompacting]);

  // 右键：打开菜单
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(prev => !prev);
  }, []);

  const menuItems = [
    { label: '压缩上下文', action: () => { handleClick(); } },
    { label: '配置最大上下文', action: () => { onOpenConfig?.(); setMenuOpen(false); } },
  ];

  // Portal 弹出层（tooltip 或菜单）
  const popup =
    popupPos ? (
      menuOpen ? (
        <div
          ref={menuRef}
          className="fixed z-[100]
            bg-[#1f1f1c] border border-[#2a2926] rounded-lg shadow-xl
            py-1 min-w-[110px] overflow-hidden"
          style={{
            top: popupPos.top - 58,
            left: popupPos.left - 4,
            transform: 'translateX(-100%)',
          }}
        >
          {menuItems.map(item => (
            <button
              key={item.label}
              onClick={item.action}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400
                hover:text-slate-200 hover:bg-[#CC7C5E]/08
                cursor-pointer transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : hovering ? (
        <div
          className="fixed z-[100]
            bg-[#1f1f1c] border border-[#2a2926] rounded px-2 py-1
            text-[10px] text-slate-400 whitespace-nowrap shadow-lg pointer-events-none"
          style={{
            top: popupPos.top - 48,
            left: popupPos.left,
            transform: 'translateX(-50%)',
          }}
        >
          <span style={{ color }}>{percent.toFixed(0)}%</span>
          <span className="text-slate-600 mx-1">|</span>
          {current.toLocaleString()} / {total.toLocaleString()}
          <span className="text-slate-600 ml-1">tokens</span>
          <div className="text-slate-600 mt-0.5">点击压缩 · 右键更多</div>
        </div>
      ) : null
    ) : null;

  return (
    <>
      <div
        ref={btnRef}
        className="relative w-5 h-5 flex items-center justify-center cursor-pointer"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
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

        {/* 压缩中动画 */}
        {isCompacting && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white/60 animate-ping" />
          </div>
        )}
      </div>

      {createPortal(popup, document.body)}
    </>
  );
}

export default TokenRing;
