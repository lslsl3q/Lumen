/**
 * 自定义 Tooltip — 替代浏览器原生 title，匹配暗色主题
 *
 * 用法：<Tooltip text="发送"><button>...</button></Tooltip>
 */
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text: string;
  children: React.ReactElement;
  delay?: number;
}

export default function Tooltip({ text, children, delay = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const show = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top - 6 });
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  return (
    <>
      {React.cloneElement(children, {
        onMouseEnter: (e: React.MouseEvent) => { show(e); children.props.onMouseEnter?.(e); },
        onMouseLeave: (e: React.MouseEvent) => { hide(); children.props.onMouseLeave?.(e); },
      })}
      {visible && createPortal(
        <div
          className="fixed z-[300] px-2 py-1 rounded text-xs text-slate-300 bg-[#2a2926] border border-[#3a3935] shadow-lg pointer-events-none"
          style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -100%)' }}
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}
