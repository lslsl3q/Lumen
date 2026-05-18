import type { WritingAct } from "../../api/writing";

export function ActHeader({ act, isFirst }: { act: WritingAct; isFirst: boolean }) {
  return (
    <div
      className="act-row-header flex items-center gap-4"
      style={{
        borderTop: isFirst ? "3.5px solid var(--color-border-subtle)" : "none",
        marginTop: isFirst ? "80px" : "0px",
        paddingTop: isFirst ? "64px" : "0px",
        paddingBottom: "64px",
      }}
    >
      <div className="flex-1">
        <span className="text-lg font-semibold text-text-primary">
          {act.numerate ? `Act ${act.sort_order + 1}` : ""}
          {act.title ? `: ${act.title}` : ""}
        </span>
      </div>
      <div className="w-64 opacity-50 hover:opacity-100 transition-opacity">
        {/* Actions button placeholder */}
      </div>
    </div>
  );
}
