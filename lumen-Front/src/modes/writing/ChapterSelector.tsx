/**
 * ChapterSelector — 章节选择器 + 内容过滤器
 *
 * 匹配 NC 风格：顶部全局过滤（全部/片段）→ 按 Volume(Act) 分组 → 章节列表。
 * 选择不同项会过滤编辑器显示的内容范围。
 */
import { useMemo } from "react";
import { useWritingStore } from "../../stores/useWritingStore";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../../components/ui/popover";
import {
  ChevronDown,
  FileText,
  Layers,
  BookOpen,
  StickyNote,
} from "lucide-react";
import { cn } from "../../lib/utils";

export type ChapterFilter =
  | { type: "all" }
  | { type: "snippets" }
  | { type: "volume"; volume: string }
  | { type: "chapter"; chapterId: string };

export function ChapterSelector() {
  const chapters = useWritingStore((s) => s.chapters);
  const activeChapterId = useWritingStore((s) => s.activeChapterId);
  const setActiveChapter = useWritingStore((s) => s.setActiveChapter);

  const activeChapter = chapters?.find((c) => c.id === activeChapterId);

  // 按 volume 分组
  const grouped = useMemo(() => {
    const map = new Map<string, typeof chapters>();
    for (const ch of chapters ?? []) {
      const vol = ch.volume || "未分组";
      if (!map.has(vol)) map.set(vol, []);
      map.get(vol)!.push(ch);
    }
    return Array.from(map.entries());
  }, [chapters]);

  // 显示标签
  const label = activeChapter?.title || "全部章节";
  const subLabel = activeChapter?.volume || "";

  return (
    <Popover>
      <PopoverTrigger
        className="flex items-center gap-2 px-2.5 py-1 rounded text-sm hover:bg-gray-800 transition-colors max-w-[240px]"
        type="button"
        aria-label="Change chapter"
      >
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[13px] font-medium text-stone-200 truncate leading-tight">
            {label}
          </span>
          {subLabel && (
            <span className="text-[10px] text-stone-500 leading-tight">
              {subLabel}
            </span>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 flex-none text-stone-500" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-1 bg-gray-900 border-gray-800 rounded-lg shadow-xl max-h-[500px] overflow-y-auto"
      >
        {/* 全局过滤选项 */}
        <button
          onClick={() => {
            /* 全部章节 — 不切换 activeChapter，显示全部 */
          }}
          className={cn(
            "w-full text-left px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors",
            "hover:bg-gray-800 text-stone-300"
          )}
          type="button"
        >
          <BookOpen className="w-3.5 h-3.5 flex-none text-stone-500" />
          <span className="truncate">全部章节</span>
        </button>
        <button
          className={cn(
            "w-full text-left px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors",
            "hover:bg-gray-800 text-stone-400"
          )}
          type="button"
        >
          <StickyNote className="w-3.5 h-3.5 flex-none text-stone-500" />
          <span className="truncate">片段</span>
        </button>

        {/* 分隔线 */}
        <div className="h-px bg-gray-800 my-1" />

        {/* 按 Volume 分组 */}
        {grouped.map(([volume, chs]) => (
          <div key={volume}>
            {/* Volume/Act 头 */}
            <button
              onClick={() => {
                /* 选整个 volume — 可过滤显示该卷所有章节 */
              }}
              className="w-full flex items-center gap-1.5 px-3 pt-2 pb-1 hover:bg-gray-800 rounded transition-colors"
              type="button"
            >
              <Layers className="w-3 h-3 text-stone-500" />
              <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide">
                {volume}
              </span>
              <span className="ml-auto text-[10px] text-stone-600">
                {chs.length} 章
              </span>
            </button>
            {chs.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setActiveChapter?.(ch.id)}
                className={cn(
                  "w-full text-left px-3 py-1.5 pl-7 rounded flex items-center gap-2 text-sm transition-colors",
                  "hover:bg-gray-800",
                  ch.id === activeChapterId
                    ? "bg-gray-800 text-stone-200"
                    : "text-stone-400"
                )}
                type="button"
              >
                <FileText className="w-3 h-3 flex-none text-stone-500" />
                <span className="truncate">{ch.title}</span>
                {ch.word_count > 0 && (
                  <span className="ml-auto text-[10px] text-stone-600 flex-none">
                    {ch.word_count}字
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
