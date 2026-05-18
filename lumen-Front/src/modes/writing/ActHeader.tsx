import type { WritingAct } from "../../api/writing";

export function ActHeader({ act, isFirst }: { act: WritingAct; isFirst: boolean }) {
  return (
    <div className={`act-row-header${isFirst ? " is-first" : ""}`}>
      <span className="text-sm font-semibold text-stone-300">
        {act.numerate ? `Act ${act.sort_order + 1}` : ""}
        {act.title ? `: ${act.title}` : ""}
      </span>
    </div>
  );
}
