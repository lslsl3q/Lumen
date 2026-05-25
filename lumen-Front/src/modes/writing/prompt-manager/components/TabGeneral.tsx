import type { TemplateDetail } from "../../../../api/templates";

export function TabGeneral({ template }: { template: TemplateDetail }) {
  return (
    <div className="p-4 space-y-6 overflow-y-auto">
      {/* Type */}
      <section>
        <h3 className="text-[14px] font-semibold text-zinc-300 uppercase tracking-wide mb-3">
          General Settings
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-zinc-500 w-24">Type</span>
            <span className="px-2.5 py-1 rounded text-[12px] font-medium bg-zinc-800 border border-zinc-700/50 text-zinc-300">
              {template.type || "—"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-zinc-500 w-24">Path</span>
            <span className="text-[12px] text-zinc-500 font-mono">{template.path}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-zinc-500 w-24">Model</span>
            <span className="text-[13px] text-zinc-400">{template.model || "default"}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-zinc-500 w-24">User Section</span>
            <span className="text-[13px] text-zinc-400">
              {template.has_user_section ? "Yes (dual-layer)" : "No (system only)"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-zinc-500 w-24">Category</span>
            <span className="text-[13px] text-zinc-400">{template.category || "—"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
