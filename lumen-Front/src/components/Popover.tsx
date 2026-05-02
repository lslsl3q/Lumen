/**
 * Popover — 轻量弹出面板
 *
 * 点击 trigger 切换显示，点击外部关闭。
 * createPortal 到 body 避免 overflow 裁剪。
 * 支持受控和非受控模式。
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

interface PopoverProps {
  trigger: React.ReactElement;
  content: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: Placement;
  className?: string;
}

function getPosition(triggerRect: DOMRect, placement: Placement): React.CSSProperties {
  const gap = 6;
  switch (placement) {
    case 'bottom-start':
      return { top: triggerRect.bottom + gap, left: triggerRect.left };
    case 'bottom-end':
      return { top: triggerRect.bottom + gap, left: triggerRect.right, transform: 'translateX(-100%)' };
    case 'top-start':
      return { bottom: window.innerHeight - triggerRect.top + gap, left: triggerRect.left };
    case 'top-end':
      return { bottom: window.innerHeight - triggerRect.top + gap, left: triggerRect.right, transform: 'translateX(-100%)' };
  }
}

export default function Popover({
  trigger,
  content,
  open: controlledOpen,
  onOpenChange,
  placement = 'bottom-start',
  className = '',
}: PopoverProps) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;

  const triggerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({});

  const setOpen = useCallback((value: boolean) => {
    if (isControlled) {
      onOpenChange?.(value);
    } else {
      setInternalOpen(value);
    }
  }, [isControlled, onOpenChange]);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    setPos(getPosition(el.getBoundingClientRect(), placement));
  }, [placement]);

  const toggle = useCallback(() => {
    updatePos();
    setOpen(!open);
  }, [open, setOpen, updatePos]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  // 打开时更新位置（窗口 resize 时也更新）
  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener('resize', updatePos);
    return () => window.removeEventListener('resize', updatePos);
  }, [open, updatePos]);

  return (
    <>
      {React.cloneElement(trigger, {
        ref: (el: HTMLElement | null) => {
          (triggerRef as React.MutableRefObject<HTMLElement | null>).current = el;
          const originalRef = (trigger as any).ref;
          if (typeof originalRef === 'function') originalRef(el);
        },
        onClick: (e: React.MouseEvent) => {
          toggle();
          trigger.props.onClick?.(e);
        },
      })}
      {open && createPortal(
        <div
          ref={panelRef}
          className={`fixed z-[200] min-w-[180px] rounded-lg
            bg-[#1a1a19] border border-[#3a3935]
            shadow-[0_8px_32px_rgba(0,0,0,0.4)]
            animate-in fade-in duration-100
            ${className}`}
          style={pos}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}
