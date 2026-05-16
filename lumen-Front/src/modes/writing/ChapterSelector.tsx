/**
 * T11 ChapterSelector — 章节场景下拉选择器
 */
import { useWritingStore } from "../../stores/useWritingStore";
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

export function ChapterSelector() {
  const chapters = useWritingStore((s) => s.chapters);
  const activeChapterId = useWritingStore((s) => s.activeChapterId);
  const setActiveChapter = useWritingStore((s) => s.setActiveChapter);

  const activeChapter = chapters?.find((c) => c.id === activeChapterId);
  const activeChapterLabel = activeChapter?.title || "未选择章节";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1.5 rounded text-sm font-medium text-stone-300 hover:bg-gray-800 transition-colors max-w-[200px]"
          type="button"
          aria-label="Change chapter/scene"
        >
          <span className="truncate">{activeChapterLabel}</span>
          <ChevronDown className="w-3 h-3 flex-none text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-1 bg-gray-900 border-gray-700 rounded-lg shadow-xl max-h-[400px] overflow-y-auto"
      >
        {chapters?.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setActiveChapter?.(ch.id)}
            className={cn(
              "w-full text-left px-3 py-2 rounded text-sm transition-colors",
              "hover:bg-gray-800",
              ch.id === activeChapterId
                ? "bg-gray-800 text-stone-200"
                : "text-stone-400"
            )}
            type="button"
          >
            <span className="font-medium">{ch.title}</span>
            {ch.word_count !== undefined && (
              <span className="ml-2 text-xs text-stone-500">{ch.word_count} 字</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
