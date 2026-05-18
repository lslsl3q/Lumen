import type { WritingAct } from "../../api/writing";

export function ActHeader({ act, isFirst }: { act: WritingAct; isFirst: boolean }) {
  return (
    <div
      className="flex items-center gap-4"
      style={{
        borderTop: "3.5px solid #27272a",
        marginTop: isFirst ? "20vh" : "80px",
        paddingTop: "80px",
        paddingBottom: "24px",
      }}
    >
      <div className="flex-1">
        <span className="text-sm font-semibold text-stone-300">
          {act.numerate ? `Act ${act.sort_order + 1}` : ""}
          {act.title ? `: ${act.title}` : ""}
        </span>
      </div>
      <div className="w-64" />
    </div>
  );
}
