import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { PLOT_LINE_TYPE_LABELS, PLOT_LINE_TYPES, type PlotLineType } from "../../../api/writing";

interface NodeContextMenuProps {
  x: number;
  y: number;
  lineType: PlotLineType;
  /** Whether there's a gap before this node (canInsertBeforeNoRipple) */
  hasGapBefore: boolean;
  /** Whether there's a node after this node that would overlap (needsRippleAfter) */
  hasNodeAfter: boolean;
  onEdit: () => void;
  onChangeType: (type: PlotLineType) => void;
  onCopy: () => void;
  onDelete: () => void;
  onRippleDelete: () => void;
  onInsertBeforeRipple: () => void;
  onInsertBeforeStay: () => void;
  onInsertAfterRipple: () => void;
  onInsertAfterStay: () => void;
  onClose: () => void;
}

interface SubMenuState {
  anchorRect: DOMRect;
  direction: "before" | "after";
}

export function NodeContextMenu({
  x, y, lineType, hasGapBefore, hasNodeAfter,
  onEdit, onChangeType, onCopy, onDelete, onRippleDelete,
  onInsertBeforeRipple, onInsertBeforeStay,
  onInsertAfterRipple, onInsertAfterStay,
  onClose,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [subMenu, setSubMenu] = useState<SubMenuState | null>(null);
  const subRef = useRef<HTMLDivElement>(null);

  // Viewport edge detection + reposition on resize
  useEffect(() => {
    const recompute = () => {
      const el = menuRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const nx = x + rect.width > window.innerWidth ? x - rect.width : x;
      const ny = y + rect.height > window.innerHeight ? y - rect.height : y;
      setPos({ x: Math.max(0, nx), y: Math.max(0, ny) });
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on outside click, Escape, or scroll
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (subRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onWheel = () => onClose();
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
    };
  }, [onClose]);

  const handleAction = useCallback((fn: () => void) => {
    fn();
    onClose();
  }, [onClose]);

  const openSubMenu = useCallback((e: React.MouseEvent, direction: "before" | "after") => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSubMenu({ anchorRect: rect, direction });
  }, []);

  const otherTypes = PLOT_LINE_TYPES.filter(t => t !== lineType);

  // Compute submenu position
  let subPos = { x: 0, y: 0 };
  if (subMenu) {
    const goRight = subMenu.anchorRect.right + 160 < window.innerWidth;
    subPos = {
      x: goRight ? subMenu.anchorRect.right - 2 : subMenu.anchorRect.left - 158,
      y: subMenu.anchorRect.top,
    };
  }

  return createPortal(
    <>
      <div
        ref={menuRef}
        className="nr-ctx-menu"
        style={{ left: pos.x, top: pos.y }}
      >
        <button className="nr-ctx-item" onClick={() => handleAction(onEdit)}>
          编辑
        </button>
        <div className="nr-ctx-sep" />
        {otherTypes.map(t => (
          <button key={t} className="nr-ctx-item nr-ctx-disabled" disabled>
            改为{PLOT_LINE_TYPE_LABELS[t]}
          </button>
        ))}
        <div className="nr-ctx-sep" />
        <button className="nr-ctx-item" onClick={(e) => openSubMenu(e, "before")}
          onMouseEnter={(e) => openSubMenu(e, "before")}
        >
          在此前插入 ▸
        </button>
        <button className="nr-ctx-item" onClick={(e) => openSubMenu(e, "after")}
          onMouseEnter={(e) => openSubMenu(e, "after")}
        >
          在此后插入 ▸
        </button>
        <div className="nr-ctx-sep" />
        <button className="nr-ctx-item nr-ctx-disabled" disabled>
          复制
        </button>
        <div className="nr-ctx-sep" />
        <button className="nr-ctx-item nr-ctx-danger" onClick={() => handleAction(onDelete)}>
          删除
        </button>
        <button className="nr-ctx-item nr-ctx-danger" onClick={() => handleAction(onRippleDelete)}>
          收拢删除
        </button>
      </div>

      {/* Submenu */}
      {subMenu && (
        <div
          ref={subRef}
          className="nr-ctx-menu nr-ctx-sub"
          style={{ left: subPos.x, top: subPos.y }}
        >
          <button
            className={`nr-ctx-item${subMenu.direction === "before" && !hasGapBefore ? " nr-ctx-disabled" : ""}`}
            onClick={() => {
              if (subMenu.direction === "before" && !hasGapBefore) return;
              handleAction(subMenu.direction === "before" ? onInsertBeforeStay : onInsertAfterStay);
            }}
          >
            原地插入
          </button>
          <button
            className={`nr-ctx-item${subMenu.direction === "after" && !hasNodeAfter ? " nr-ctx-disabled" : ""}`}
            onClick={() => {
              if (subMenu.direction === "after" && !hasNodeAfter) return;
              handleAction(subMenu.direction === "before" ? onInsertBeforeRipple : onInsertAfterRipple);
            }}
          >
            连移插入
          </button>
        </div>
      )}
    </>,
    document.body,
  );
}
