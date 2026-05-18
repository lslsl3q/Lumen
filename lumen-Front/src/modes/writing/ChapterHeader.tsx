import type { WritingChapter } from "../../api/writing";

export function ChapterHeader({
  chapter,
  isAfterAct,
}: {
  chapter: WritingChapter;
  isAfterAct: boolean;
}) {
  return (
    <div
      className="flex items-center gap-4"
      style={{
        marginTop: isAfterAct ? "16px" : "2.5em",
        marginBottom: "1em",
      }}
    >
      <div className="flex-1">
        <span className="text-lg font-medium text-stone-300">
          {chapter.show_number ? `Chapter ${chapter.sort_order + 1}` : ""}
          {chapter.title ? `: ${chapter.title}` : ""}
        </span>
      </div>
      <div className="w-64" />
    </div>
  );
}
