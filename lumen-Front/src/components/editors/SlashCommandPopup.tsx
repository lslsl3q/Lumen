/**
 * SlashCommandPopup — 斜杠命令弹出列表
 *
 * 使用 shadcn Command（基于 cmdk）渲染，自动处理键盘导航。
 * 通过 ReactRenderer + createPortal 挂载，解决 Tauri 事件遮挡问题。
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Command,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import type { SlashCommandItem } from "./slash-commands";

const CATEGORY_ORDER = ["ai", "codex", "formatting", "other"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  ai: "AI 助手",
  codex: "法典",
  formatting: "格式",
  other: "其他",
};

interface SlashCommandPopupProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  clientRect?: (() => DOMRect | null) | null;
}

export function SlashCommandPopup({ items, command, clientRect }: SlashCommandPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // 跟随光标：滚动时持续更新位置
  useEffect(() => {
    if (!clientRect) return;

    const updatePosition = () => {
      const rect = clientRect();
      if (!rect || !popupRef.current) return;
      popupRef.current.style.left = `${rect.left}px`;
      popupRef.current.style.top = `${rect.bottom + 4}px`;
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    return () => window.removeEventListener("scroll", updatePosition, true);
  }, [clientRect]);

  const initialRect = clientRect?.();
  const style: React.CSSProperties = initialRect
    ? { position: "fixed", left: initialRect.left, top: initialRect.bottom + 4, zIndex: 5 }
    : { position: "fixed", top: -9999, left: -9999 };

  // 按分类分组
  const groups = useMemo(() => {
    const map: Record<string, SlashCommandItem[]> = {};
    for (const item of items) {
      const cat = item.category ?? "other";
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    return map;
  }, [items]);

  const handleSelect = useCallback(
    (item: SlashCommandItem) => {
      command(item);
    },
    [command]
  );

  return createPortal(
    <div ref={popupRef} style={style} onMouseDown={(e) => e.preventDefault()}>
      <Command className="slash-command-popup" shouldFilter={false}>
        <CommandList>
          <CommandEmpty>无匹配命令</CommandEmpty>
          {CATEGORY_ORDER.map((cat) => {
            const catItems = groups[cat];
            if (!catItems?.length) return null;
            return (
              <CommandGroup key={cat} heading={CATEGORY_LABELS[cat]}>
                {catItems.map((item) => (
                  <CommandItem
                    key={item.title}
                    value={item.title}
                    onSelect={() => handleSelect(item)}
                    className="slash-command-item"
                  >
                    {item.iconSvg && (
                      <span
                        className="slash-command-icon"
                        dangerouslySetInnerHTML={{ __html: item.iconSvg }}
                      />
                    )}
                    <div className="slash-command-text">
                      <span className="slash-command-title">{item.title}</span>
                      {item.description && (
                        <span className="slash-command-desc">{item.description}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </Command>
    </div>,
    document.body
  );
}
