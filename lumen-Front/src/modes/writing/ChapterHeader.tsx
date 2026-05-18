import type { WritingChapterV2 } from "../../api/writing";

export function ChapterHeader({
  chapter,
  isAfterAct,
}: {
  chapter: WritingChapterV2;
  isAfterAct: boolean;
}) {
  return (
    <div
      className="chapter-row-header flex items-center gap-4"
      style={{
        borderTop: isAfterAct ? "none" : "1px solid var(--color-border-subtle)",
        marginTop: isAfterAct ? "0" : "2.5em",
        marginBottom: "1em",
        paddingTop: isAfterAct ? "0" : "2.5em",
      }}
    >
      <div className="flex-1">
        <span className="text-base font-medium text-text-secondary">
          {chapter.show_number ? `Chapter ${chapter.sort_order + 1}` : ""}
          {chapter.title ? `: ${chapter.title}` : ""}
        </span>
      </div>
      <div className="w-64" />
    </div>
  );
}
