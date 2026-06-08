import React, { useState, useMemo, useCallback, memo, useRef, useEffect } from "react";
import { previewTemplate, type PreviewResult, type TemplateInputDef } from "../../../../api/templates";
import { useWritingStore } from "../../../../stores/useWritingStore";
import type { TemplateDetail } from "../../../../api/templates";
import { LabelRow, LABEL_COLORS } from "../../../../components/editors/LabelRow";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../../../../components/ui/collapsible";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "../../../../components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { RadioDot } from "../../../../components/ui/radio-dot";
import { GripVertical, MessageSquare, BookOpen, Layers, FileText, Film, StickyNote, Database, Tag } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** NC-compatible content type definitions for Content Selection mode */
const CONTENT_TYPES: { id: string; label: string; expandable?: boolean; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "fullNovelText", label: "Full novel", expandable: true, icon: BookOpen },
  { id: "act", label: "Act", expandable: true, icon: Layers },
  { id: "chapter", label: "Chapter", expandable: true, icon: FileText },
  { id: "scene", label: "Scene", expandable: true, icon: Film },
  { id: "snippet", label: "Snippet", icon: StickyNote },
  { id: "codexEntry", label: "Codex Entry", expandable: true, icon: Database },
  { id: "label", label: "Label", icon: Tag },
];

/**
 * NC-style mutually exclusive groups for Content Selection.
 * Types in the same group are radio-like: only one can be selected at a time.
 * Full novel / Act / Chapter / Scene / Snippet are mutually exclusive (different granularity).
 * Codex Entry and Label are independent multi-select.
 */
const EXCLUSIVE_GROUPS = [
  ["fullNovelText", "act", "chapter", "scene", "snippet"],
] as const;

/** Extract top-level Jinja2 variable names referenced in template body */
function extractJinjaVariables(content: string): Set<string> {
  let body = content;
  if (body.startsWith("---")) {
    const end = body.indexOf("---", 3);
    if (end !== -1) body = body.slice(end + 3);
  }

  const vars = new Set<string>();
  const exprRe = /\{\{[-\s]*(?:not\s+)?([a-zA-Z_]\w*)/g;
  let m;
  while ((m = exprRe.exec(body)) !== null) vars.add(m[1]);

  const blockRe = /\{%[-\s]*(?:if|elif)\s+(?:not\s+)?([a-zA-Z_]\w*)/g;
  while ((m = blockRe.exec(body)) !== null) vars.add(m[1]);

  const forRe = /\{%[-\s]*for\s+\w+\s+in\s+([a-zA-Z_]\w*)/g;
  while ((m = forRe.exec(body)) !== null) vars.add(m[1]);

  for (const sv of ["sys", "text_before_cursor", "text_after_cursor", "query", "true", "false", "none", "True", "False", "None", "word_count", "either"]) {
    vars.delete(sv);
  }
  return vars;
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

export function TabAdvanced({ template, editContent, onContentChange }: { template: TemplateDetail; editContent?: string; onContentChange?: (v: string) => void }) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeProjectId = useWritingStore((s) => s.activeProjectId);

  const currentContent = editContent || template.content;
  const includes = useMemo(() => extractIncludes(currentContent), [currentContent]);

  // Use ref to avoid passing currentContent as prop (causes re-renders)
  const contentRef = useRef<string>(currentContent);
  contentRef.current = currentContent;

  // Input values for preview
  const inputs: TemplateInputDef[] = template.inputs || [];
  const [inputValues, setInputValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const inp of inputs) {
      if (inp.default) defaults[inp.name] = inp.default;
    }
    return defaults;
  });

  const setInputValue = useCallback((name: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handlePreview = async () => {
    setLoading(true);
    setError("");
    try {
      const mockData: Record<string, unknown> = {
        book_id: activeProjectId || undefined,
        ...inputValues,
      };
      const data = await previewTemplate(template.name, mockData);
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
        <InputsSection template={template} contentRef={contentRef} onContentChange={onContentChange} content={currentContent} />

        {/* Included Components section */}
        {includes.length > 0 && (
          <section>
            <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-2">
              Included Components
            </h3>
            <p className="text-[12px] text-[var(--color-text-muted)] mb-2">
              The following components are included in the instructions:
            </p>
            <div className="space-y-1">
              {includes.map((inc) => (
                <div
                  key={inc}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[12px] bg-[var(--color-surface-base)] border border-[var(--color-border)]"
                >
                  <span className="text-[var(--color-text-primary)]">{inc}</span>
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
          <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-2">
            Preview
          </h3>

          {/* Input fields */}
          {inputs.length > 0 && (
            <div className="space-y-2 mb-3">
              {inputs.map((inp) => (
                <div key={inp.name}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">{inp.label || inp.name}</span>
                    {inp.required && (
                      <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Required</span>
                    )}
                  </div>
                  {inp.description && (
                    <p className="text-[11px] text-[var(--color-text-dim)] mb-1">{inp.description}</p>
                  )}
                  {/* Render based on enabled content types */}
                  {inp.custom_content && inp.options ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {inp.options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setInputValue(inp.name, opt)}
                          className={`px-2.5 py-1 rounded text-[11px] border cursor-pointer transition-colors ${
                            inputValues[inp.name] === opt
                              ? "bg-[var(--color-surface-tint)] border-[var(--color-border)] text-[var(--color-text-primary)]"
                              : "border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-border)]"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : inp.custom_content ? (
                    <textarea
                      value={inputValues[inp.name] || ""}
                      onChange={(e) => setInputValue(inp.name, e.target.value)}
                      placeholder={inp.description || `Enter ${inp.label || inp.name}...`}
                      className="w-full bg-[var(--color-surface-deep)] border border-[var(--color-border)] rounded px-2.5 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] resize-y min-h-[48px] placeholder-[var(--color-text-dim)]"
                      rows={2}
                    />
                  ) : inp.checkbox ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inputValues[inp.name] === "true"}
                        onChange={(e) => setInputValue(inp.name, e.target.checked ? "true" : "false")}
                        className="rounded border-[var(--color-border)]"
                      />
                      <span className="text-[12px] text-[var(--color-text-secondary)]">{inp.label || inp.name}</span>
                    </label>
                  ) : (
                    <input
                      type="text"
                      value={inputValues[inp.name] || ""}
                      onChange={(e) => setInputValue(inp.name, e.target.value)}
                      placeholder={`Enter ${inp.label || inp.name}...`}
                      className="w-full bg-[var(--color-surface-deep)] border border-[var(--color-border)] rounded px-2.5 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] placeholder-[var(--color-text-dim)]"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handlePreview}
            disabled={loading}
            className="px-3 py-1.5 rounded text-[12px] font-semibold bg-[var(--color-primary-deep)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tint)] transition-colors cursor-pointer disabled:opacity-40 mb-3"
            type="button"
          >
            {loading ? "Rendering..." : "Render Preview"}
          </button>

          {error && (
            <div className="px-3 py-2 bg-red-500/10 text-red-400 text-[12px] rounded mb-3">
              {error}
            </div>
          )}

          {!result && !error && !loading && (
            <div className="text-center py-8 text-[var(--color-text-muted)]">
              <svg className="w-8 h-8 mx-auto mb-3 text-[var(--color-text-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <p className="text-[13px] font-medium text-[var(--color-text-secondary)] mb-1">No preview yet</p>
              <p className="text-[12px] text-[var(--color-text-dim)]">Click "Render Preview" to see the rendered prompt with your current input values.</p>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              {result.messages && result.messages.length > 0 ? (
                result.messages.map((msg, i) => {
                  const label = msg.role === "system" ? "System Message" : msg.role === "assistant" ? "AI" : "User";
                  const color = msg.role === "system" ? "text-blue-400" : msg.role === "assistant" ? "text-amber-400" : "text-emerald-400";
                  return (
                    <div key={i}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[13px] font-medium ${color}`}>{label}</span>
                        <span className="text-[11px] text-[var(--color-text-muted)]">{wordCount(msg.content)} words</span>
                        <button
                          onClick={() => copyToClipboard(msg.content)}
                          className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
                          type="button"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="text-[12px] text-[var(--color-text-secondary)] whitespace-pre-wrap font-mono bg-[var(--color-surface-base)] rounded p-3 border border-[var(--color-border-subtle)] leading-relaxed max-h-[300px] overflow-y-auto">
                        {msg.content || "(empty)"}
                      </pre>
                    </div>
                  );
                })
              ) : (
                <>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[13px] font-medium text-[var(--color-text-primary)]">System Message</span>
                      <span className="text-[11px] text-[var(--color-text-muted)]">{wordCount(result.system)} words</span>
                      <button
                        onClick={() => copyToClipboard(result.system)}
                        className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
                        type="button"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="text-[12px] text-[var(--color-text-secondary)] whitespace-pre-wrap font-mono bg-[var(--color-surface-base)] rounded p-3 border border-[var(--color-border-subtle)] leading-relaxed max-h-[300px] overflow-y-auto">
                      {result.system || "(empty)"}
                    </pre>
                  </div>
                  {result.user && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">User</span>
                        <span className="text-[11px] text-[var(--color-text-muted)]">{wordCount(result.user)} words</span>
                        <button
                          onClick={() => copyToClipboard(result.user)}
                          className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
                          type="button"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="text-[12px] text-[var(--color-text-secondary)] whitespace-pre-wrap font-mono bg-[var(--color-surface-base)] rounded p-3 border border-[var(--color-border-subtle)] leading-relaxed max-h-[300px] overflow-y-auto">
                        {result.user}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Frontmatter patching ──

/** Replace the `inputs:` block in YAML frontmatter with a new array */
function patchFrontmatterInputs(content: string, newInputs: TemplateInputDef[]): string {
  const fmEnd = content.indexOf("\n---", 3);
  if (fmEnd === -1) return content;
  const fmBlock = content.slice(0, fmEnd + 4);
  const rest = content.slice(fmEnd + 4);

  // Build new inputs YAML
  const lines: string[] = [];
  for (const inp of newInputs) {
    lines.push(`  - name: ${JSON.stringify(inp.name)}`);
    if (inp.label) lines.push(`    label: ${JSON.stringify(inp.label)}`);
    if (inp.description) lines.push(`    description: ${JSON.stringify(inp.description)}`);
    if (inp.required) lines.push(`    required: true`);
    if (inp.multi) lines.push(`    multi: true`);
    if (inp.generate_only) lines.push(`    generate_only: true`);
    if (inp.custom_content) lines.push(`    custom_content: true`);
    if (inp.content_selection) lines.push(`    content_selection: true`);
    if (inp.checkbox) lines.push(`    checkbox: true`);
    if (inp.options?.length) {
      lines.push(`    options:`);
      for (const opt of inp.options) lines.push(`      - ${JSON.stringify(opt)}`);
    }
    if (inp.default) lines.push(`    default: ${JSON.stringify(inp.default)}`);
    if (inp.content_types?.length) {
      lines.push(`    content_types:`);
      for (const ct of inp.content_types) lines.push(`      - ${JSON.stringify(ct)}`);
    }
    if (inp.add_to_context) lines.push(`    add_to_context: true`);
    if (inp.display_name) lines.push(`    display_name: ${JSON.stringify(inp.display_name)}`);
    if (inp.placeholder) lines.push(`    placeholder: ${JSON.stringify(inp.placeholder)}`);
    if (inp.allow_formatted_text) lines.push(`    allow_formatted_text: true`);
  }

  const newInputsStr = lines.length > 0 ? `inputs:\n${lines.join("\n")}\n` : "";

  // Replace existing inputs block or add new one
  const inputsRe = /^inputs:\s*\n(?:  .*\n)*/m;
  let newFm: string;
  if (inputsRe.test(fmBlock)) {
    newFm = fmBlock.replace(inputsRe, newInputsStr);
  } else {
    newFm = fmBlock.replace(/\n---\s*$/, `\n${newInputsStr}---`);
  }
  return newFm + rest;
}

// ── Inputs Section with NC-style expandable config cards ──

function InputsSection({ template, contentRef, onContentChange, content }: { template: TemplateDetail; contentRef: React.RefObject<string>; onContentChange?: (v: string) => void; content: string }) {
  // Local structured state — decoupled from file format (NC approach)
  const [localInputs, setLocalInputs] = useState<TemplateInputDef[]>(() => template.inputs || []);

  // Sync from backend when template changes (e.g., initial load, navigation)
  const prevInputsRef = useRef(template.inputs);
  if (template.inputs !== prevInputsRef.current) {
    prevInputsRef.current = template.inputs;
    setLocalInputs(template.inputs || []);
  }

  const isUserCreated = template.user_created === true;

  const usedVars = useMemo(() => extractJinjaVariables(content), [content]);

  // Debounced sync: localInputs → serialize to content string
  const skipSyncRef = useRef(true);
  useEffect(() => {
    if (skipSyncRef.current) { skipSyncRef.current = false; return; }
    if (!onContentChange) return;
    const timer = setTimeout(() => {
      const ownInputs = localInputs.filter(i => !i.source_component);
      const newContent = patchFrontmatterInputs(contentRef.current || '', ownInputs);
      onContentChange(newContent);
    }, 100);
    return () => clearTimeout(timer);
  }, [localInputs, onContentChange, contentRef]);

  const handleAddInput = useCallback(() => {
    setLocalInputs(prev => [...prev, {
      name: `new_input_${Date.now()}`,
      label: "New input",
      custom_content: true,
    }]);
  }, []);

  const handleUpdateInput = useCallback((inputName: string, patch: Partial<TemplateInputDef>) => {
    setLocalInputs(prev => {
      const idx = prev.findIndex(i => i.name === inputName);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...patch };
      return updated;
    });
  }, []);

  const handleDeleteInput = useCallback((name: string) => {
    setLocalInputs(prev => prev.filter(i => i.name !== name));
  }, []);

  const handleDuplicateInput = useCallback((input: TemplateInputDef) => {
    const clone: TemplateInputDef = { ...input, name: `${input.name}_copy_${Date.now()}`, label: `${input.label || input.name} (Copy)` };
    clone.source_component = undefined;
    setLocalInputs(prev => [...prev, clone]);
  }, []);

  const handleAddMissing = useCallback(() => {
    const existingNames = new Set(localInputs.map(i => i.name));
    const missing = [...usedVars].filter(v => !existingNames.has(v));
    if (missing.length === 0) return;
    const newInputs: TemplateInputDef[] = missing.map(name => ({
      name,
      label: name,
      custom_content: true,
    }));
    setLocalInputs(prev => [...prev, ...newInputs]);
  }, [usedVars, localInputs]);

  const missingCount = useMemo(() => {
    const existingNames = new Set(localInputs.map(i => i.name));
    return [...usedVars].filter(v => !existingNames.has(v)).length;
  }, [usedVars, localInputs]);

  return (
    <section>
      <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide mb-2">
        Inputs
      </h3>
      <p className="text-[12px] text-[var(--color-text-muted)] mb-2">
        The following inputs are called upon in the instructions or those of included components:
      </p>

      {localInputs.length > 0 ? (
        <div className="space-y-1.5">
          {localInputs.map((input, idx) => (
            <InputCard key={input.name + idx} input={input} isUserCreated={isUserCreated}
              usedVars={usedVars}
              onUpdate={(patch) => handleUpdateInput(input.name, patch)}
              onDelete={() => handleDeleteInput(input.name)}
              onDuplicate={() => handleDuplicateInput(input)}
            />
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-[var(--color-text-dim)] italic">
          <span className="font-semibold text-[var(--color-text-muted)]">No inputs configured</span>
          <p className="mt-1">This prompt does not have any inputs configured.</p>
        </div>
      )}

      {isUserCreated && onContentChange && (
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={handleAddInput}
            className="px-2.5 py-1 rounded text-[11px] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-hover-surface)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
          >
            + Add input
          </button>
          {missingCount > 0 && (
            <button
              type="button"
              onClick={handleAddMissing}
              className="px-2.5 py-1 rounded text-[11px] text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-300 transition-colors cursor-pointer"
            >
              Add missing ({missingCount})
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Badge showing enabled content types */
function inputTypeBadges(input: TemplateInputDef): { label: string; color: string }[] {
  const badges: { label: string; color: string }[] = [];
  if (input.required) badges.push({ label: "Required", color: "text-amber-400 bg-amber-500/10" });
  if (input.custom_content) badges.push({ label: "Custom", color: "text-emerald-400 bg-emerald-500/10" });
  if (input.content_selection) badges.push({ label: "Content Selection", color: "text-blue-400 bg-blue-500/10" });
  if (input.checkbox) badges.push({ label: "Checkbox", color: "text-purple-400 bg-purple-500/10" });
  if (badges.length === 0) badges.push({ label: "Custom", color: "text-[var(--color-text-secondary)] bg-[var(--color-surface-tint)]" });
  return badges;
}

const InputCard = memo(function InputCard({ input, isUserCreated, onUpdate, usedVars, onDelete, onDuplicate }: {
  input: TemplateInputDef; isUserCreated: boolean; onUpdate: (patch: Partial<TemplateInputDef>) => void;
  usedVars: Set<string>; onDelete: () => void; onDuplicate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const badges = inputTypeBadges(input);
  const isInherited = !!input.source_component;
  const disabled = !isUserCreated || isInherited;
  const isUnused = !isInherited && usedVars.size > 0 && !usedVars.has(input.name);
  const inputCls = `flex-1 bg-[var(--color-surface-deep)] border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text-primary)] outline-none text-[12px] ${disabled ? "opacity-50 cursor-not-allowed" : "focus:border-[var(--color-primary)]"}`;
  const inputClsSm = `flex-1 bg-[var(--color-surface-deep)] border border-[var(--color-border)] rounded px-2 py-0.5 text-[11px] text-[var(--color-text-primary)] outline-none ${disabled ? "opacity-50 cursor-not-allowed" : "focus:border-[var(--color-primary)]"}`;

  // Direct state update — no string serialization (NC approach)
  const updateInput = useCallback((patch: Partial<TemplateInputDef>) => {
    if (isInherited) return;
    onUpdate(patch);
  }, [isInherited, onUpdate]);

  // NC-style content mode: 'none' | 'custom' | 'selection' | 'checkbox'
  const hasText = input.custom_content === true;
  const hasOpts = !!input.options?.length;
  const contentMode = input.content_selection ? 'selection' : input.checkbox ? 'checkbox' : (hasText || hasOpts) ? 'custom' : 'none';
  const setContentMode = useCallback((mode: 'custom' | 'selection' | 'checkbox' | 'none') => {
    if (disabled) return;
    if (mode === 'custom') {
      updateInput({
        custom_content: true,
        content_selection: undefined,
        checkbox: undefined,
        options: input.options?.length ? input.options : ["Option 1", "Option 2", "Option 3"],
      });
    } else {
      updateInput({
        custom_content: undefined,
        content_selection: mode === 'selection' ? true : undefined,
        checkbox: mode === 'checkbox' ? true : undefined,
        options: undefined,
      });
    }
  }, [disabled, input.options, updateInput]);
  const hasDropdown = !!input.options?.length;
  const setTextOn = useCallback((v: boolean) => {
    if (disabled) return;
    if (!v && !hasOpts) {
      updateInput({ custom_content: undefined, options: undefined });
    } else {
      updateInput({ custom_content: v ? true : undefined });
    }
  }, [disabled, hasOpts, updateInput]);
  const setDropdownOn = useCallback((v: boolean) => {
    if (disabled) return;
    if (v) {
      updateInput({ options: input.options?.length ? input.options : ["Option 1", "Option 2", "Option 3"] });
    } else {
      if (!hasText) {
        updateInput({ custom_content: undefined, options: undefined });
      } else {
        updateInput({ options: undefined });
      }
    }
  }, [disabled, hasText, input.options, updateInput]);

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-base)] p-1 flex items-start gap-2">
      {/* Expand chevron */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex-none w-7 h-7 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover-surface)] rounded transition-colors cursor-pointer"
      >
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Collapsed header */}
        <div className="flex items-center gap-2 min-h-7 flex-wrap">
          <span className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{input.label || input.name}</span>
          {badges.map((b, i) => (
            <span key={i} className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${b.color}`}>
              {b.label}
            </span>
          ))}
          {input.source_component && (
            <span className="text-[10px] text-blue-400" title={`From: ${input.source_component}`}>
              ← {input.source_component}
            </span>
          )}
          {isUnused && (
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">
              Not used by prompt
            </span>
          )}
          {!isInherited && (
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-auto px-1.5 py-0.5 text-[14px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer rounded hover:bg-[var(--color-hover-surface)] outline-none">
                ⋯
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Expanded config — same layout for all, disabled controls for system/inherited */}
        {expanded && (
          <div className="mt-2 mb-1 space-y-4 text-[12px]">
            {/* Inherited banner */}
            {isInherited && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-blue-500/10 border border-blue-500/20">
                <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                </svg>
                <span className="text-[11px] text-blue-300">
                  Inherited from <span className="font-medium">{input.source_component}</span>
                </span>
              </div>
            )}

            {/* Name + Description + toggles — side by side, matches NC */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <label className="text-[var(--color-text-muted)] shrink-0">Name</label>
                  <input type="text" value={input.label || ""} onChange={(e) => updateInput({ label: e.target.value })} readOnly={disabled} className={inputCls} />
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <label className="text-[var(--color-text-muted)] shrink-0">Description</label>
                  <input type="text" value={input.description || ""} onChange={(e) => updateInput({ description: e.target.value })} readOnly={disabled} placeholder="Enter an optional help text..." className={`${inputCls} placeholder-[var(--color-text-dim)]`} />
                </div>
              </div>
              <div className="space-y-3 pt-1">
                <ToggleSwitch label="Allow selecting multiple options" desc="e.g. a list of characters or locations, or a list of labels." checked={!!input.multi} onChange={(v) => updateInput({ multi: v })} disabled={disabled} />
                <ToggleSwitch label="Must be filled out" desc="The prompt won't work without this input and blocks sending to the AI." checked={!!input.required} onChange={(v) => updateInput({ required: v })} disabled={disabled} />
                <ToggleSwitch label="Only show in 'Generate Text'" desc="Hide this input directly on beats or above the chat message." checked={!!input.generate_only} onChange={(v) => updateInput({ generate_only: v })} disabled={disabled} />
              </div>
            </div>

            {/* ALLOWED CONTENT — radio selection, matches NC */}
            <div>
              <h3 className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-1.5">ALLOWED CONTENT</h3>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-2">Your input may contain more than one type of content (like chapters and snippets).</p>
              <div className="space-y-1">
                <RadioCard
                  selected={contentMode === 'custom'}
                  onClick={() => setContentMode(contentMode === 'custom' ? 'none' : 'custom')}
                  disabled={disabled}
                  label="Custom content"
                  description="Allows entering additional information not linked to a specific type of content."
                >
                  {/* Text */}
                  <ExpandableRow
                    checked={hasText}
                    onCheckedChange={(v) => setTextOn(v)}
                    disabled={disabled}
                    label="Text"
                  >
                    <div className="space-y-2">
                      <div>
                        <div className="text-[10px] text-[var(--color-text-muted)] mb-0.5">Placeholder</div>
                        <p className="text-[9px] text-[var(--color-text-dim)] mb-1">Enter an example of the text that your prompt needs.</p>
                        <input type="text" value={input.placeholder || ""} onChange={(e) => updateInput({ placeholder: e.target.value || undefined })} readOnly={disabled} placeholder="e.g. Enter your instructions here..." className={`${inputClsSm} placeholder-[var(--color-text-dim)] w-full`} />
                      </div>
                      <ToggleSwitch label="Allow Formatted Text" desc="Allow this input to use formatted text in a larger text area. Useful for longer additional instructions." checked={!!input.allow_formatted_text} onChange={(v) => updateInput({ allow_formatted_text: v })} disabled={disabled} />
                    </div>
                  </ExpandableRow>

                  {/* Dropdown */}
                  <ExpandableRow
                    checked={hasDropdown}
                    onCheckedChange={(v) => setDropdownOn(v)}
                    disabled={disabled}
                    label="Dropdown"
                    extra={hasDropdown ? <span className="text-[10px] text-[var(--color-text-muted)]">{input.options!.length} option{input.options!.length !== 1 ? 's' : ''}</span> : undefined}
                  >
                    {hasDropdown && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-medium text-[var(--color-text-secondary)] mb-0.5">Dropdown Options</div>
                        <p className="text-[9px] text-[var(--color-text-dim)] mb-1">Define the options for the select menu / dropdown.</p>
                        <DndContext
                          collisionDetection={closestCenter}
                          onDragEnd={(event: DragEndEvent) => {
                            const { active, over } = event;
                            if (!over || active.id === over.id) return;
                            const opts = input.options || [];
                            const oldIdx = opts.findIndex((_, i) => `${input.name}-opt-${i}` === active.id);
                            const newIdx = opts.findIndex((_, i) => `${input.name}-opt-${i}` === over.id);
                            if (oldIdx === -1 || newIdx === -1) return;
                            updateInput({ options: arrayMove(opts, oldIdx, newIdx) });
                          }}
                        >
                          <SortableContext items={input.options!.map((_, i) => `${input.name}-opt-${i}`)} strategy={verticalListSortingStrategy}>
                            {input.options!.map((opt, oi) => (
                              <OptionLabelRow
                                key={oi}
                                option={opt}
                                optionId={`${input.name}-opt-${oi}`}
                                index={oi}
                                disabled={disabled}
                                input={input}
                                updateInput={updateInput}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                        {!disabled && (
                          <div className="flex items-center gap-2 pt-0.5">
                            <button type="button" onClick={() => updateInput({ options: [...(input.options || []), `Option ${(input.options?.length || 0) + 1}`] })} className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer">+ Add Label</button>
                            {(input.options?.length ?? 0) >= 2 && (
                              <button type="button" onClick={() => updateInput({ options: [...(input.options || [])].sort() })} className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer">Sort Labels</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </ExpandableRow>
                </RadioCard>

                <RadioCard
                  selected={contentMode === 'selection'}
                  onClick={() => setContentMode('selection')}
                  disabled={disabled}
                  label="Content selection"
                  description="Select from a list of options based on your current novel/series."
                >
                  <ContentSelectionPanel input={input} disabled={disabled} updateInput={updateInput} inputClsSm={inputClsSm} />
                </RadioCard>

                <RadioCard
                  selected={contentMode === 'checkbox'}
                  onClick={() => setContentMode('checkbox')}
                  disabled={disabled}
                  label="Checkbox"
                  description="Shows a little checkbox next to the input."
                />
              </div>
            </div>

            {/* DEFAULT CONTENT */}
            <div>
              <h3 className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-1.5">DEFAULT CONTENT</h3>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-1.5">This content will be used as the default value. You can use this to provide an example or a template.</p>
              <input type="text" value={input.default || ""} onChange={(e) => updateInput({ default: e.target.value || undefined })} readOnly={disabled} placeholder="Optional default value..." className={`w-full bg-[var(--color-surface-deep)]/50 border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text-primary)] outline-none text-[12px] placeholder-[var(--color-text-dim)] ${disabled ? "opacity-50 cursor-not-allowed" : "focus:border-[var(--color-primary)]"}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

/** Get the current sub-option label shown next to the type name (NC-style) */
function getContentSubLabel(typeId: string, input: TemplateInputDef): string {
  const opts = (input as any).content_type_options as Record<string, any> | undefined;
  if (typeId === "fullNovelText") {
    const labels: string[] = [];
    if (opts?.allowOutline !== false) labels.push("Outline");
    if (opts?.allowFullText !== false) labels.push("Full text");
    return labels.join(", ");
  }
  if (typeId === "act" || typeId === "chapter" || typeId === "scene") {
    const treatAs = opts?.[`${typeId}_treatAs`] || "fullText";
    return treatAs === "summary" ? "Summary/Outline" : "Full text";
  }
  if (typeId === "codexEntry") {
    const codexTypes = ["Characters", "Locations", "Objects/Items", "Lore", "Subplots", "Others"];
    const allowed = opts?.allowedCodexTypes || codexTypes;
    return allowed.length === codexTypes.length ? "All types" : `${allowed.length} types`;
  }
  return "";
}

/** NC-style Content Selection panel: bordered rows, right-side disclosure, exclusive groups */
function ContentSelectionPanel({ input, disabled, updateInput, inputClsSm }: {
  input: TemplateInputDef; disabled: boolean; updateInput: (patch: Partial<TemplateInputDef>) => void; inputClsSm: string;
}) {
  const contentTypes = input.content_types || [];

  const toggleType = (id: string) => {
    if (disabled) return;
    if (contentTypes.includes(id)) {
      // Deselect
      updateInput({ content_types: contentTypes.filter(t => t !== id) || undefined });
    } else {
      // Check exclusive groups — deselect others in same group
      const exclusiveGroup = EXCLUSIVE_GROUPS.find(g => g.includes(id as any));
      let next = [...contentTypes, id];
      if (exclusiveGroup) {
        next = next.filter(t => !exclusiveGroup.includes(t as any) || t === id);
      }
      updateInput({ content_types: next.length > 0 ? next : undefined });
    }
  };

  return (
    <div className="px-2 pb-2 ml-5 border-t border-blue-500/15 pt-2 mx-1.5 space-y-0.5">
      {CONTENT_TYPES.map(ct => {
        const enabled = contentTypes.includes(ct.id);
        const subLabel = ct.expandable ? getContentSubLabel(ct.id, input) : undefined;

        return (
            <ExpandableRow
              key={ct.id}
              checked={enabled}
              onCheckedChange={() => toggleType(ct.id)}
              disabled={disabled}
              label={
                <div className="flex items-center gap-1.5">
                  <ct.icon className={`w-3.5 h-3.5 ${enabled ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-dim)]'}`} />
                  <span className={`text-[12px] ${enabled ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>{ct.label}</span>
                </div>
              }
              extra={subLabel ? <span className="text-[11px] text-[var(--color-text-muted)]">{subLabel}</span> : undefined}
            >
              {ct.expandable && (
                <ContentTypeSubOptions typeId={ct.id} input={input} disabled={disabled} updateInput={updateInput} />
              )}
            </ExpandableRow>
        );
      })}
      <div className="border-t border-blue-500/15 pt-2 mt-2">
        <ToggleSwitch label="Add to prompt context" desc="If enabled, any selected act/chapter/... will be added to the prompt context. Only use this if you don't do your own context management in the prompt." checked={!!input.add_to_context} onChange={(v) => updateInput({ add_to_context: v })} disabled={disabled} />
      </div>
      <div className="flex items-center gap-2 mt-1">
        <label className="text-[11px] text-[var(--color-text-muted)] w-24 shrink-0">Display Name</label>
        <input type="text" value={input.display_name || ""} onChange={(e) => updateInput({ display_name: e.target.value || undefined })} readOnly={disabled} placeholder="Additional Context" className={`${inputClsSm} placeholder-[var(--color-text-dim)]`} />
      </div>
      <p className="text-[10px] text-[var(--color-text-muted)]">Give a custom name to the button that will be shown to the user.</p>
    </div>
  );
}

/** Sub-options for expandable content types (NC-style) */
function ContentTypeSubOptions({ typeId, input, disabled, updateInput }: {
  typeId: string; input: TemplateInputDef; disabled: boolean; updateInput: (patch: Partial<TemplateInputDef>) => void;
}) {
  const opts = (input as any).content_type_options as Record<string, any> | undefined;
  const setOpt = (key: string, value: any) => {
    const current = opts || {};
    updateInput({ content_type_options: { ...current, [key]: value } } as any);
  };

  if (typeId === "fullNovelText") {
    return (
      <div className="space-y-1.5">
        <ToggleSwitch label="Allow full outline" desc="This offer selecting the full outline of the story (all acts, chapters, scenes)." checked={opts?.allowOutline !== false} onChange={(v) => setOpt("allowOutline", v)} disabled={disabled} />
        <ToggleSwitch label="Allow full text" desc="This offer selecting the full text of the story (all acts, chapters, scenes)." checked={opts?.allowFullText !== false} onChange={(v) => setOpt("allowFullText", v)} disabled={disabled} />
      </div>
    );
  }

  if (typeId === "act" || typeId === "chapter" || typeId === "scene") {
    const optKey = `${typeId}_treatAs`;
    const treatAs = opts?.[optKey] || "fullText";
    return (
      <div className="space-y-1.5">
        <span className="text-[11px] text-[var(--color-text-secondary)]">Treat as</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <RadioDot selected={treatAs === 'fullText'} />
            <button type="button" onClick={() => !disabled && setOpt(optKey, "fullText")} className={`text-[11px] ${treatAs === 'fullText' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>Full text</button>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <RadioDot selected={treatAs === 'summary'} />
            <button type="button" onClick={() => !disabled && setOpt(optKey, "summary")} className={`text-[11px] ${treatAs === 'summary' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>Summary/Outline</button>
          </label>
        </div>
      </div>
    );
  }

  if (typeId === "codexEntry") {
    const codexTypes = ["Characters", "Locations", "Objects/Items", "Lore", "Subplots", "Others"];
    const allowed = opts?.allowedCodexTypes || codexTypes;
    const toggleCodex = (name: string) => {
      if (disabled) return;
      const next = allowed.includes(name) ? allowed.filter((n: string) => n !== name) : [...allowed, name];
      setOpt("allowedCodexTypes", next.length < codexTypes.length ? next : codexTypes);
    };
    return (
      <div className="space-y-1">
        <span className="text-[11px] text-[var(--color-text-secondary)]">Allowed types</span>
        <p className="text-[10px] text-[var(--color-text-muted)]">Only allow selecting codex entries for the following types:</p>
        <div className="space-y-1 mt-1">
          {codexTypes.map(ct => (
            <ToggleSwitch key={ct} label={ct} checked={allowed.includes(ct)} onChange={() => toggleCodex(ct)} disabled={disabled} />
          ))}
        </div>
      </div>
    );
  }

  return null;
}

/** Per-option label row with drag handle, color, and advanced dialog */
function OptionLabelRow({ option, optionId, index, disabled, input, updateInput }: {
  option: string; optionId: string; index: number; disabled: boolean;
  input: TemplateInputDef; updateInput: (patch: Partial<TemplateInputDef>) => void;
}) {
  const [color, setColor] = useState(LABEL_COLORS[index % LABEL_COLORS.length].key);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: optionId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <>
      <div ref={setNodeRef} style={style}>
        <LabelRow
          name={option}
          color={color}
          disabled={disabled}
          onNameChange={(v: string) => { const o = [...(input.options || [])]; o[index] = v; updateInput({ options: o }); }}
          onColorChange={disabled ? undefined : setColor}
          onDelete={() => { const o = (input.options || []).filter((_, i) => i !== index); updateInput({ options: o.length > 0 ? o : undefined }); }}
          leading={
            !disabled && (
              <button
                {...attributes}
                {...listeners}
                className="flex-none cursor-grab text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] shrink-0"
                style={{ width: 24, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                type="button"
              >
                <GripVertical size={14} />
              </button>
            )
          }
          afterInput={
            !disabled && (
              <button
                type="button"
                onClick={() => setShowAdvanced(true)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer shrink-0 flex items-center justify-center"
                style={{ width: 36, height: 36, borderRadius: 4 }}
                title="Advanced options"
              >
                <MessageSquare size={16} />
              </button>
            )
          }
        />
      </div>

      {/* Advanced Dialog */}
      <Dialog open={showAdvanced} onOpenChange={setShowAdvanced}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Advanced Dropdown Options</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1 block">Description</label>
              <p className="text-[11px] text-[var(--color-text-dim)] mb-1.5">Add a little help text to describe this dropdown option.</p>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter an optional help text..."
                className="w-full bg-[var(--color-surface-deep)] border border-[var(--color-border)] rounded px-2.5 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] placeholder-[var(--color-text-dim)]"
              />
            </div>

            <div>
              <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1 block">Content</label>
              <p className="text-[11px] text-[var(--color-text-dim)] mb-1.5">This is the content that will be inserted into the prompt when this option is selected.</p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter content..."
                className="w-full bg-[var(--color-surface-deep)] border border-[var(--color-border)] rounded px-2.5 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] placeholder-[var(--color-text-dim)] resize-y min-h-[80px]"
                rows={3}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Small toggle switch with shadcn Checkbox */
function ToggleSwitch({ label, desc, checked, onChange, disabled }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      className={`flex items-start gap-2 select-none ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <Checkbox checked={checked} onCheckedChange={(v) => !disabled && onChange(!!v)} disabled={disabled} className="mt-0.5" />
      <div>
        <span className="text-[11px] text-[var(--color-text-primary)]">{label}</span>
        {desc && <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 leading-tight">{desc}</p>}
      </div>
    </div>
  );
}

/** Reusable expandable row — toggle + label + right-side triangle + collapsible content */
function ExpandableRow({
  checked,
  onCheckedChange,
  label,
  extra,
  children,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: React.ReactNode;
  extra?: React.ReactNode;
  children?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Collapsible className={`rounded border transition-colors border-[var(--color-border)] bg-[var(--color-surface-base)] ${className || ''}`}>
      <div className="flex items-center gap-1.5 px-2 py-1.5 min-h-[28px]">
        <Checkbox checked={checked} onCheckedChange={(v) => !disabled && onCheckedChange(!!v)} disabled={disabled} />
        <span className={`text-[11px] font-medium ${checked ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>{label}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {extra}
          {children && (
            <CollapsibleTrigger className="flex-none w-5 h-5 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer">
              <svg
                className="w-3 h-3 transition-transform [[data-panel-open]>&]:rotate-90"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </CollapsibleTrigger>
          )}
        </div>
      </div>
      {children && (
        <CollapsibleContent>
          <div className="px-2 pb-2 border-t border-[var(--color-border-subtle)]">
            {children}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

/** Radio card — 圆点选中 + 标题/描述 + 可展开子面板，选中态跟随主题 primary 色 */
function RadioCard({
  selected,
  onClick,
  disabled,
  label,
  description,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded border transition-colors ${selected ? 'border-[var(--color-primary-subtle)] bg-[var(--color-primary-subtle)]' : 'border-[var(--color-border-subtle)]'}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`group w-full text-left p-2 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2">
          <RadioDot selected={selected} />
          <span className={`text-[12px] font-medium transition-colors duration-300 ${selected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'}`}>
            {label}
          </span>
        </div>
        {description && (
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 ml-6">{description}</p>
        )}
      </button>
      {selected && children && (
        <div className="px-2 pb-2 ml-6 space-y-1.5 border-t border-[var(--color-border-subtle)] pt-2 mx-1.5">
          {children}
        </div>
      )}
    </div>
  );
}
