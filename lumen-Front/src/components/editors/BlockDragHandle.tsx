/**
 * BlockDragHandle — 共享拖拽把手组件
 *
 * 所有块级编辑器组件（SceneBeat / SectionBlock / CodexAddition）统一使用。
 * CSS 在 editor.css 的 .block-drag-handle 里，改一处全部生效。
 */
import { useCallback } from "react";
import type { NodeViewProps } from "@tiptap/react";

export function GripDotsIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
      <circle cx="2" cy="3" r="1.5" />
      <circle cx="7" cy="3" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
      <circle cx="7" cy="8" r="1.5" />
      <circle cx="2" cy="13" r="1.5" />
      <circle cx="7" cy="13" r="1.5" />
    </svg>
  );
}

/**
 * 返回 onMouseDown 拖拽处理器。
 * 用法：const handleDrag = useBlockDrag(editor, getPos, wrapperRef, '.my-block-class');
 */
export function useBlockDrag(
  editor: NodeViewProps["editor"],
  getPos: NodeViewProps["getPos"],
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  blockSelector: string,
) {
  return useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const pos = typeof getPos === "function" ? getPos() : getPos;
      if (pos == null) return;

      const blockEl = wrapperRef.current?.querySelector<HTMLElement>(blockSelector);
      const ghost = blockEl
        ? (blockEl.cloneNode(true) as HTMLElement)
        : document.createElement("div");
      const blockRect = blockEl?.getBoundingClientRect();
      const offsetX = e.clientX - (blockRect?.left ?? e.clientX);
      const offsetY = e.clientY - (blockRect?.top ?? e.clientY);
      ghost.style.cssText = `
        position:fixed; pointer-events:none; z-index:51; opacity:0.5;
        width:${blockRect?.width ?? 200}px;
        left:${blockRect?.left ?? e.clientX}px;
        top:${blockRect?.top ?? e.clientY}px;
      `;
      document.body.appendChild(ghost);

      const editorEl = editor.view.dom as HTMLElement;
      const editorRect = editorEl.getBoundingClientRect();
      const dropLine = document.createElement("div");
      dropLine.style.cssText = `
        position:fixed;height:0;z-index:50;pointer-events:none;
        left:${editorRect.left}px;width:${editorRect.width}px;
        border-top:1px solid var(--color-text-secondary,#888);
      `;
      dropLine.style.display = "none";
      document.body.appendChild(dropLine);

      const fromPos = pos;
      let targetPos: number | null = null;

      const onMouseMove = (me: MouseEvent) => {
        ghost.style.left = `${me.clientX - offsetX}px`;
        ghost.style.top = `${me.clientY - offsetY}px`;

        const dropResult = editor.view.posAtCoords({ left: me.clientX, top: me.clientY });
        if (!dropResult) { dropLine.style.display = "none"; targetPos = null; return; }

        const $pos = editor.state.doc.resolve(dropResult.pos);
        if ($pos.depth === 0) { dropLine.style.display = "none"; targetPos = null; return; }
        const blockPos = $pos.before($pos.depth);
        targetPos = blockPos;

        try {
          const coords = editor.view.coordsAtPos(blockPos);
          dropLine.style.top = `${coords.top - 1}px`;
          dropLine.style.display = "block";
        } catch { dropLine.style.display = "none"; }
      };

      const onMouseUp = () => {
        ghost.remove();
        dropLine.remove();
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);

        if (targetPos == null || targetPos === fromPos) return;

        const draggedNode = editor.state.doc.nodeAt(fromPos);
        if (!draggedNode) return;

        let adjustedTo = targetPos > fromPos ? targetPos - draggedNode.nodeSize : targetPos;
        if (adjustedTo < 0) adjustedTo = 0;
        if (adjustedTo === fromPos) return;

        const tr = editor.state.tr;
        tr.delete(fromPos, fromPos + draggedNode.nodeSize);
        tr.insert(adjustedTo, draggedNode.copy(draggedNode.content));
        editor.view.dispatch(tr);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [editor, getPos, wrapperRef, blockSelector],
  );
}
