import { useState, useMemo } from "react";
import { previewTemplate, type PreviewResult } from "../../../../api/templates";
import { useWritingStore } from "../../../../stores/useWritingStore";
import type { TemplateDetail } from "../../../../api/templates";

/** Extract Jinja2 variables from template content: {{ var }} and {{ obj.prop }} */
export function extractVariables(content: string): string[] {
  const vars = new Set<string>();
  // Match {{ variable }} patterns
  const varRegex = /\{\{\s*([a-zA-Z_][\w.]*)/g;
  let m;
  while ((m = varRegex.exec(content)) !== null) {
    vars.add(m[1].split(".")[0]);
  }
  // Match {% for x in ... %} patterns
  const forRegex = /\{%\s*-?\s*for\s+\w+\s+in\s+([a-zA-Z_][\w.]*)/g;
  while ((m = forRegex.exec(content)) !== null) {
    vars.add(m[1].split(".")[0]);
  }
  return Array.from(vars);
}

/** Extract {% include("...") %} references */
export function extractIncludes(content: string): string[] {
  const includes: string[] = [];
  const regex = /\{%[-]?\s*include\(\s*["']([^"']+)["']\s*\)\s*[-]?%\}/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    includes.push(m[1]);
  }
  return includes;
}

export function TabAdvanced({ template }: { template: TemplateDetail }) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeProjectId = useWritingStore((s) => s.activeProjectId);

  const variables = useMemo(() => extractVariables(template.content), [template.content]);
  const includes = useMemo(() => extractIncludes(template.content), [template.content]);

  const handlePreview = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await previewTemplate(template.name, {
        book_id: activeProjectId || undefined,
      } as Record<string, unknown>);
      setResult(data);
    } catch (e: any) {
      setError(e.message || "渲染失败");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Inputs section */}
        <section>
          <h3 className="text-[14px] font-semibold text-zinc-300 uppercase tracking-wide mb-2">
            Inputs
          </h3>
          <p className="text-[12px] text-zinc-500 mb-2">
            The following inputs are referenced in the instructions:
          </p>
          {variables.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] bg-zinc-800 border border-zinc-700/50 text-zinc-300"
                >
                  {v}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[12px] text-zinc-600 italic">No variables detected</span>
          )}
        </section>

        {/* Included Components section */}
        {includes.length > 0 && (
          <section>
            <h3 className="text-[14px] font-semibold text-zinc-300 uppercase tracking-wide mb-2">
              Included Components
            </h3>
            <p className="text-[12px] text-zinc-500 mb-2">
              The following components are included in the instructions:
            </p>
            <div className="space-y-1">
              {includes.map((inc) => (
                <div
                  key={inc}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[12px] bg-zinc-800/50 border border-zinc-700/40"
                >
                  <span className="text-zinc-300">{inc}</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    Component
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Preview section */}
        <section>
          <h3 className="text-[14px] font-semibold text-zinc-300 uppercase tracking-wide mb-2">
            Preview
          </h3>
          <button
            onClick={handlePreview}
            disabled={loading}
            className="px-3 py-1.5 rounded text-[12px] font-semibold bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors cursor-pointer disabled:opacity-40 mb-3"
            type="button"
          >
            {loading ? "Rendering…" : "Render Preview"}
          </button>

          {error && (
            <div className="px-3 py-2 bg-red-500/10 text-red-400 text-[12px] rounded mb-3">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              {/* System Message */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[13px] font-medium text-zinc-300">System Message</span>
                  <span className="text-[11px] text-zinc-500">{wordCount(result.system)} words</span>
                  <button
                    onClick={() => copyToClipboard(result.system)}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    type="button"
                  >
                    Copy
                  </button>
                </div>
                <pre className="text-[12px] text-zinc-400 whitespace-pre-wrap font-mono bg-zinc-800/30 rounded p-3 border border-zinc-700/30 leading-relaxed max-h-[300px] overflow-y-auto">
                  {result.system || "(empty)"}
                </pre>
              </div>

              {/* User Message */}
              {result.user && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[13px] font-medium text-zinc-300">User</span>
                    <span className="text-[11px] text-zinc-500">{wordCount(result.user)} words</span>
                    <button
                      onClick={() => copyToClipboard(result.user)}
                      className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                      type="button"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="text-[12px] text-zinc-400 whitespace-pre-wrap font-mono bg-zinc-800/30 rounded p-3 border border-zinc-700/30 leading-relaxed max-h-[300px] overflow-y-auto">
                    {result.user}
                  </pre>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
