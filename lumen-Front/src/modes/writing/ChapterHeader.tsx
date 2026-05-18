import type { WritingChapter } from "../../api/writing";

export function ChapterHeader({
  chapter,
  isAfterAct,
}: {
  chapter: WritingChapter;
  isAfterAct: boolean;
}) {
  return (
    <div className={`chapter-row-header${isAfterAct ? " after-act" : ""}`}>
      <span className="text-lg font-medium text-stone-300">
        {chapter.show_number ? `Chapter ${chapter.sort_order + 1}` : ""}
        {chapter.title ? `: ${chapter.title}` : ""}
      </span>
    </div>
  );
}
