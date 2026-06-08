/**
 * GenerateTextDialog — NC-aligned generation configuration modal
 *
 * Layout: Tweak | Preview | Presets▼ | Edit
 * Tweak has toggleable fields (Words/Instructions/Additional Context).
 * Presets save/load field values. Edit embeds the Prompt Manager.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { getTemplate, previewTemplate, type TemplateDetail, type PreviewResult, type TemplateInputDef } from "../../api/templates";
import { TemplateEditorTabs } from "../../modes/writing/prompt-manager/components/TemplateEditorTabs";
import { useWritingStore } from "../../stores/useWritingStore";
import { useModels } from "../../hooks/useModels";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { BeatContextMenu, type ContextSelection, typeIcon } from "./BeatContextMenu";

const WORD_PRESETS = [200, 400, 600] as const;

// ── Helpers ──

/**
 * 从 TipTap JSON 字符串或纯文本中提取可显示的文本
 * TipTap JSON 格式：{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"..."}]}]}
 */
function extractTextFromTipTap(jsonStr: string | undefined | null): string {
  if (!jsonStr) return "";
  // 先尝试作为 JSON 解析
  if (jsonStr.trim().startsWith("{")) {
    try {
      const doc = JSON.parse(jsonStr);
      const texts: string[] = [];
      const walk = (node: any) => {
        if (node.text) texts.push(node.text);
        if (node.content) node.content.forEach(walk);
      };
      walk(doc);
      return texts.join("").trim();
    } catch {
      // JSON 解析失败，返回原字符串
    }
  }
  return jsonStr.trim();
}

// ── Preset Storage ──

import { type PromptPreset, type PromptPresetField, loadPresets, savePresets } from "./preset-types";

type TabId = "tweak" | "preview" | "edit";

interface GenerateTextDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (opts: GenerateOptions) => void;
  defaultMaxWords: number;
  defaultModelId: string;
  contextIds: string[];
  defaultContextSelection: ContextSelection;
  templateName?: string;
  onMaxWordsChange?: (value: number) => void;
  onModelChange?: (value: string) => void;
  onContextChange?: (selection: ContextSelection) => void;
}

export interface GenerateOptions {
  maxWords: number;
  modelId: string;
  instructions: string;
  inputValues?: Record<string, string | number>;
}

export function GenerateTextDialog({
  open,
  onClose,
  onGenerate,
  defaultMaxWords,
  defaultModelId,
  contextIds: _contextIds,
  defaultContextSelection,
  templateName,
  onMaxWordsChange,
  onModelChange,
  onContextChange,
}: GenerateTextDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>("tweak");
  const [modelId, setModelId] = useState(defaultModelId);
  const [editTemplate, setEditTemplate] = useState<TemplateDetail | null>(null);
  const [tweakTemplate, setTweakTemplate] = useState<TemplateDetail | null>(null);
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const activeProjectId = useWritingStore(s => s.activeProjectId);
  const { models } = useModels();

  // Dynamic input values — keyed by input name
  const [inputValues, setInputValues] = useState<Record<string, string | number>>({});

  const handleModelChange = useCallback((value: string) => {
    setModelId(value);
    onModelChange?.(value);
  }, [onModelChange]);

  const [contextSelection, setContextSelection] = useState<ContextSelection>({});

  // Sync context selection back to parent and update internal state
  const handleContextChange = useCallback((selection: ContextSelection) => {
    setContextSelection(selection);
    onContextChange?.(selection);
  }, [onContextChange]);

  const setInputValue = useCallback((name: string, value: string | number) => {
    setInputValues((prev) => ({ ...prev, [name]: value }));
    if (name === "words") onMaxWordsChange?.(typeof value === "number" ? value : parseInt(String(value), 10) || 400);
  }, [onMaxWordsChange]);

  const templateInputs: TemplateInputDef[] = tweakTemplate?.inputs || [];

  const dialogRef = useRef<HTMLDivElement>(null);

  // Derive active preset for Reset functionality
  const activePreset = presets.find(p => p.id === activePresetId) ?? null;

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab("tweak");
      setActivePresetId(null);
      setModelId(defaultModelId);
      setContextSelection(defaultContextSelection);
      setEditTemplate(null);
      setTweakTemplate(null);
      setInputValues({ words: defaultMaxWords });
      if (templateName) {
        setPresets(loadPresets(templateName));
        getTemplate(`${templateName}.md.j2`).then((t) => {
          setTweakTemplate(t);
          setInputValues((prev) => {
            const defaults = { ...prev };
            for (const inp of t.inputs || []) {
              if (inp.default && !(inp.name in defaults)) {
                defaults[inp.name] = inp.default;
              }
            }
            return defaults;
          });
        }).catch(() => {});
      }
    }
  }, [open, templateName, defaultMaxWords, defaultModelId, defaultContextSelection]);

  // Sync values when parent updates them (dialog already open)
  useEffect(() => {
    if (open) {
      setInputValues((prev) => ({ ...prev, words: defaultMaxWords }));
      setModelId(defaultModelId);
      setContextSelection(defaultContextSelection);
    }
  }, [defaultMaxWords, defaultModelId, defaultContextSelection, open]);

  // Load template detail when Edit tab is activated
  useEffect(() => {
    if (activeTab === "edit" && templateName && !editTemplate) {
      getTemplate(`${templateName}.md.j2`).then(setEditTemplate).catch(() => {});
    }
  }, [activeTab, templateName, editTemplate]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleGenerate = useCallback(() => {
    onGenerate({
      maxWords: typeof inputValues.words === "number" ? inputValues.words : parseInt(String(inputValues.words), 10) || defaultMaxWords,
      modelId,
      instructions: String(inputValues.instructions || ""),
      inputValues,
    });
  }, [inputValues, modelId, defaultMaxWords, onGenerate]);

  const applyPreset = useCallback((preset: PromptPreset) => {
    setActivePresetId(preset.id);
    handleModelChange(preset.modelId);
    // Convert structured fields to flat values
    const flat: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(preset.fields)) {
      if (v.enabled) flat[k] = v.value;
    }
    setInputValues(flat);
    if (preset.contextSelection) handleContextChange(preset.contextSelection);
  }, [handleModelChange, handleContextChange]);

  // Reset tweak field to preset's original value
  const resetField = useCallback((field: string) => {
    if (!activePreset) return;
    const presetField = activePreset.fields[field];
    setInputValues((prev) => ({ ...prev, [field]: presetField?.value ?? prev[field] }));
  }, [activePreset]);

  const createPreset = useCallback((name: string) => {
    if (!templateName) return;
    // Convert flat values to structured fields
    const structured: Record<string, PromptPresetField> = {};
    for (const [k, v] of Object.entries(inputValues)) {
      structured[k] = { enabled: true, value: v };
    }
    const p: PromptPreset = {
      id: crypto.randomUUID(),
      name,
      fields: structured,
      contextSelection: Object.keys(contextSelection).length > 0 ? { ...contextSelection } : undefined,
      modelId,
      createdAt: Date.now(),
    };
    const next = [...presets, p];
    savePresets(templateName, next);
    setPresets(next);
  }, [templateName, presets, inputValues, contextSelection, modelId]);

  const deletePreset = useCallback((id: string) => {
    if (!templateName) return;
    const next = presets.filter(p => p.id !== id);
    savePresets(templateName, next);
    setPresets(next);
  }, [templateName, presets]);

  if (!open) return null;

  return createPortal(
    <div className="gen-dialog-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="gen-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="gen-dialog-header">
          <h2 className="gen-dialog-title">Generate Text</h2>
          <button className="gen-dialog-close" onClick={onClose}>
            × Close
          </button>
        </div>

        {/* Body */}
        <div className="gen-dialog-body">
          {/* Tabs: Tweak | Preview ──── Presets▼ | Edit */}
          <div className="gen-dialog-tabs">
            {(["tweak", "preview"] as TabId[]).map((id) => (
              <button
                key={id}
                className={`gen-dialog-tab ${activeTab === id ? "gen-dialog-tab-active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                {id === "tweak" ? "Tweak" : "Preview"}
              </button>
            ))}

            {/* Presets — dropdown pushed to right */}
            <div className="gen-dialog-presets-spacer" />

            <DropdownMenu>
              <DropdownMenuTrigger className="gen-dialog-tab">
                Presets
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                {presets.length > 0 && presets.map(p => (
                  <DropdownMenuItem key={p.id} onClick={() => applyPreset(p)}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
                {presets.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={() => {
                  const name = prompt('Preset name:');
                  if (name?.trim()) createPreset(name.trim());
                }}>
                  Create Preset
                </DropdownMenuItem>
                {presets.length > 0 && (
                  <DropdownMenuItem onClick={() => {
                    const name = prompt('Delete preset:');
                    if (!name) return;
                    const p = presets.find(p => p.name === name);
                    if (p) deletePreset(p.id);
                  }}>
                    Manage Presets
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              className={`gen-dialog-tab ${activeTab === "edit" ? "gen-dialog-tab-active" : ""}`}
              onClick={() => setActiveTab("edit")}
            >
              Edit
            </button>
          </div>

          {/* Tab content */}
          <div className="gen-dialog-content">
            {activeTab === "tweak" && (
              <TweakTab
                inputs={templateInputs}
                inputValues={inputValues}
                onInputValueChange={setInputValue}
                onResetField={resetField}
                hasActivePreset={!!activePreset}
                contextSelection={contextSelection}
                onContextChange={handleContextChange}
              />
            )}
            {activeTab === "preview" && (
              <PreviewTab templateName={templateName ?? undefined} bookId={activeProjectId ?? undefined} />
            )}
            {activeTab === "edit" && (
              editTemplate ? (
                <div className="gen-dialog-edit-panel">
                  <TemplateEditorTabs template={editTemplate} />
                </div>
              ) : (
                <PlaceholderTab text="Loading template editor..." />
              )
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="gen-dialog-footer">
          <DropdownMenu>
            <DropdownMenuTrigger className="gen-dialog-model-select">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <circle cx="8" cy="12" r="2" />
                <path d="M14 10h4M14 14h2" />
              </svg>
              <span>{modelId || "Default Model"}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="gen-dialog-model-chevron">
                <path d="M2.5 3.75L5 6.25L7.5 3.75" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4} className="min-w-[200px] max-h-[280px] overflow-y-auto p-0 !bg-surface-deep !text-text-primary !border-border-default !rounded-md shadow-[0_0_0_1px_#3f3f46,0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)]">
              {models.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => handleModelChange(m.id)}
                  className="!px-4 !py-1.5 !text-[13px] !gap-3"
                >
                  {m.id === modelId && <span style={{ color: "var(--color-primary)" }}>✓</span>}
                  {m.id}
                </DropdownMenuItem>
              ))}
              {models.length === 0 && (
                <div className="px-4 py-2 text-xs text-text-dim">No models available</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <button className="gen-dialog-generate" onClick={handleGenerate}>
            Generate
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** NC-style context badges showing selected context items */
function ContextChips({ selection, onRemove }: { selection: ContextSelection; onRemove: (key: keyof ContextSelection, id?: string) => void }) {
  const acts = useWritingStore(s => s.acts);
  const codexEntries = useWritingStore(s => s.codexEntries ?? []);
  const snippets = useWritingStore(s => s.snippets ?? []);

  const allChapters = useMemo(() => {
    const result: { id: string; title: string; sceneCount: number }[] = [];
    for (const act of acts) {
      for (const ch of act.chapters) {
        const chapterNumber = (ch.sort_order ?? 0) + 1;
        const title = ch.title ? `第${chapterNumber}章: ${ch.title}` : `第${chapterNumber}章`;
        result.push({ id: ch.id, title, sceneCount: ch.scenes?.length ?? 0 });
      }
    }
    return result;
  }, [acts]);

  const allScenes = useMemo(() => {
    const result: { id: string; subtitle: string; chapterTitle: string }[] = [];
    for (const act of acts) {
      for (const ch of act.chapters) {
        const chapterNumber = (ch.sort_order ?? 0) + 1;
        const chTitle = ch.title ? `第${chapterNumber}章: ${ch.title}` : `第${chapterNumber}章`;
        for (const sc of ch.scenes) {
          const subtitle = extractTextFromTipTap(sc.subtitle) || extractTextFromTipTap(sc.summary)?.slice(0, 30) || "Scene";
          result.push({ id: sc.id, subtitle, chapterTitle: chTitle });
        }
      }
    }
    return result;
  }, [acts]);

  interface Badge { key: string; id: string; type: string; title: string; subtitle?: string }
  const badges: Badge[] = [];

  if (selection.fullNovelText) badges.push({ key: "fullNovelText", id: "", type: "fullNovelText", title: "全部手稿" });
  if (selection.fullOutline) badges.push({ key: "fullOutline", id: "", type: "fullOutline", title: "全部大纲" });
  for (const id of selection.acts || []) {
    const act = acts.find(a => a.id === id);
    if (act) {
      const chCount = act.chapters?.length ?? 0;
      badges.push({ key: "acts", id, type: "acts", title: act.title || `Act ${(act.sort_order ?? 0) + 1}`, subtitle: `${chCount} 章节` });
    }
  }
  for (const id of selection.chapters || []) {
    const ch = allChapters.find(c => c.id === id);
    if (ch) badges.push({ key: "chapters", id, type: "chapters", title: ch.title, subtitle: `${ch.sceneCount} 场景` });
  }
  for (const id of selection.scenes || []) {
    const sc = allScenes.find(s => s.id === id);
    if (sc) badges.push({ key: "scenes", id, type: "scenes", title: sc.subtitle, subtitle: sc.chapterTitle });
  }
  for (const id of selection.snippets || []) {
    const sn = snippets.find(s => s.id === id);
    if (sn) badges.push({ key: "snippets", id, type: "snippets", title: sn.name || "片段" });
  }
  for (const id of selection.codexEntries || []) {
    const entry = codexEntries.find(e => e.id === id);
    if (entry) badges.push({ key: "codexEntries", id, type: "codexEntries", title: entry.name || "条目", subtitle: entry.type });
  }
  for (const name of selection.codexTypes || []) {
    const count = codexEntries.filter(e => e.type === name).length;
    badges.push({ key: "codexTypes", id: name, type: "codexTypes", title: name, subtitle: `${count} 条目` });
  }
  for (const name of selection.codexCategories || []) {
    const count = codexEntries.filter(e => e.category === name).length;
    badges.push({ key: "codexCategories", id: name, type: "codexCategories", title: name, subtitle: `${count} 条目` });
  }
  for (const name of selection.codexTags || []) {
    const count = codexEntries.filter(e => e.tags?.includes(name)).length;
    badges.push({ key: "codexTags", id: name, type: "codexTags", title: name, subtitle: `${count} 条目` });
  }

  if (badges.length === 0) return null;

  return (
    <div className="ctx-badge-list">
      {badges.map(b => (
        <span key={`${b.key}-${b.id}`} className="ctx-badge">
          <span className="ctx-badge-icon">{typeIcon(b.type)}</span>
          <span className="ctx-badge-text">
            <span className="ctx-badge-title">{b.title}</span>
            {b.subtitle && <span className="ctx-badge-sub">{b.subtitle}</span>}
          </span>
          <button
            className="ctx-badge-delete"
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(b.key as keyof ContextSelection, b.id || undefined); }}
          >×</button>
        </span>
      ))}
    </div>
  );
}

function TweakTab({
  inputs, inputValues, onInputValueChange,
  onResetField, hasActivePreset,
  contextSelection, onContextChange,
}: {
  inputs: TemplateInputDef[];
  inputValues: Record<string, string | number>;
  onInputValueChange: (name: string, value: string | number) => void;
  onResetField: (field: string) => void;
  hasActivePreset: boolean;
  contextSelection: ContextSelection;
  onContextChange: (sel: ContextSelection) => void;
}) {
  return (
    <div className="gen-tweak">
      <div className="gen-tweak-card">
        {/* Dynamic inputs from template — NC-style content type toggles */}
        {inputs.map((inp) => {
          const val = inputValues[inp.name];

          // custom_content + options → button group (like Words)
          if (inp.custom_content && inp.options && inp.options.length > 0) {
            return (
              <fieldset key={inp.name} className="gen-tweak-fieldset">
                <legend className="gen-tweak-legend">
                  <span>{inp.label || inp.name}</span>
                  {inp.required && <span className="gen-tweak-badge">Required</span>}
                  <div className="flex-1" />
                  <button type="button" className="gen-tweak-reset-btn" disabled={!hasActivePreset} onClick={() => onResetField(inp.name)}>↺ Reset</button>
                </legend>
                {inp.description && <p className="gen-tweak-description">{inp.description}</p>}
                <div className="gen-tweak-word-row">
                  {inp.options.map((opt) => (
                    <button key={opt} className={`gen-tweak-word-btn ${String(val) === opt ? "gen-tweak-word-btn-active" : ""}`} onClick={() => onInputValueChange(inp.name, opt)}>{opt}</button>
                  ))}
                  <span className="gen-tweak-or">OR</span>
                  <input type="number" className="gen-tweak-custom-input" placeholder="e.g. 300"
                    value={!inp.options.includes(String(val)) ? val : ""}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (v > 0) onInputValueChange(inp.name, v); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
                </div>
              </fieldset>
            );
          }

          // custom_content without options → textarea (like Instructions)
          if (inp.custom_content) {
            const textVal = String(val || "");
            return (
              <fieldset key={inp.name} className="gen-tweak-fieldset">
                <legend className="gen-tweak-legend">
                  <span>{inp.label || inp.name}</span>
                  {inp.required && <span className="gen-tweak-badge">Required</span>}
                  <div className="flex-1" />
                  <button type="button" className="gen-tweak-reset-btn" disabled={!hasActivePreset} onClick={() => onResetField(inp.name)}>↺ Reset</button>
                </legend>
                {inp.description && <p className="gen-tweak-description">{inp.description}</p>}
                <div className="gen-tweak-textarea-row">
                  <textarea className="gen-tweak-textarea" placeholder={`Enter ${inp.label || inp.name}...`} value={textVal} onChange={(e) => onInputValueChange(inp.name, e.target.value)} rows={3} />
                  <div className="gen-tweak-textarea-actions">
                    <button type="button" className="gen-tweak-action-btn" disabled={!textVal} title="Expand">Expand</button>
                    <button type="button" className="gen-tweak-action-btn" disabled={!textVal} title="Copy" onClick={() => textVal && navigator.clipboard.writeText(textVal)}>Copy</button>
                  </div>
                </div>
              </fieldset>
            );
          }

          // content_selection → context selector
          if (inp.content_selection) {
            return (
              <fieldset key={inp.name} className="gen-tweak-fieldset">
                <legend className="gen-tweak-legend">
                  <span>{inp.label || inp.name}</span>
                  {inp.required && <span className="gen-tweak-badge">Required</span>}
                  <div className="flex-1" />
                  <button type="button" className="gen-tweak-reset-btn" disabled={!hasActivePreset} onClick={() => onResetField(inp.name)}>↺ Reset</button>
                </legend>
                {inp.description && <p className="gen-tweak-description">{inp.description}</p>}
                <div className="gen-tweak-context-row">
                  <BeatContextMenu selection={contextSelection} onChange={onContextChange}>
                    <button type="button" className="gen-tweak-context-btn">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      Context
                    </button>
                  </BeatContextMenu>
                  <ContextChips selection={contextSelection} onRemove={(key, id) => {
                    if (id) {
                      const arr = (contextSelection[key] as string[]) || [];
                      onContextChange({ ...contextSelection, [key]: arr.filter(x => x !== id) });
                    } else {
                      onContextChange({ ...contextSelection, [key]: undefined });
                    }
                  }} />
                </div>
              </fieldset>
            );
          }

          // checkbox → toggle
          if (inp.checkbox) {
            return (
              <fieldset key={inp.name} className="gen-tweak-fieldset">
                <legend className="gen-tweak-legend">
                  <span>{inp.label || inp.name}</span>
                  <div className="flex-1" />
                  <button type="button" className="gen-tweak-reset-btn" disabled={!hasActivePreset} onClick={() => onResetField(inp.name)}>↺ Reset</button>
                </legend>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={val === "true"}
                    onChange={(e) => onInputValueChange(inp.name, e.target.checked ? "true" : "false")}
                    className="rounded border-zinc-600"
                  />
                  <span className="text-[13px] text-zinc-400">{inp.description || inp.label || inp.name}</span>
                </label>
              </fieldset>
            );
          }

          return null;
        })}

        {/* If no inputs defined, show hardcoded fallback */}
        {inputs.length === 0 && (
          <>
            <fieldset className="gen-tweak-fieldset">
              <legend className="gen-tweak-legend">
                <span>Words</span>
                <span className="gen-tweak-badge">Required</span>
              </legend>
              <p className="gen-tweak-description">How many words should the AI write?</p>
              <div className="gen-tweak-word-row">
                {WORD_PRESETS.map((w) => (
                  <button key={w} className={`gen-tweak-word-btn ${Number(inputValues.words || 400) === w ? "gen-tweak-word-btn-active" : ""}`}
                    onClick={() => onInputValueChange("words", w)}>{w}</button>
                ))}
              </div>
            </fieldset>
            <fieldset className="gen-tweak-fieldset">
              <legend className="gen-tweak-legend"><span>Instructions</span></legend>
              <textarea className="gen-tweak-textarea" placeholder="Optional: add specific instructions..."
                value={String(inputValues.instructions || "")} onChange={(e) => onInputValueChange("instructions", e.target.value)} rows={3} />
            </fieldset>
          </>
        )}
      </div>
    </div>
  );
}

function PlaceholderTab({ text }: { text: string }) {
  return (
    <div className="gen-placeholder">
      <div className="gen-placeholder-icon">🚧</div>
      <p>{text}</p>
    </div>
  );
}

function PreviewTab({ templateName, bookId }: { templateName?: string; bookId?: string }) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePreview = useCallback(() => {
    if (!templateName) return;
    setLoading(true);
    setError("");
    previewTemplate(`${templateName}.md.j2`, bookId ? { book_id: bookId } as any : undefined)
      .then(r => setResult(r))
      .catch(e => setError(e.message || "Preview failed"))
      .finally(() => setLoading(false));
  }, [templateName, bookId]);

  const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

  return (
    <div className="gen-preview">
      <div className="gen-preview-toolbar">
        <button className="gen-preview-render-btn" onClick={handlePreview} disabled={loading}>
          {loading ? "Rendering…" : "Render Preview"}
        </button>
        {result && (
          <span className="gen-preview-wordcount">
            {wordCount(result.system) + wordCount(result.user)} words total
          </span>
        )}
        {result && (
          <button className="gen-preview-copy-btn" onClick={() => {
            const full = result.system + '\n\n' + result.user;
            navigator.clipboard.writeText(full);
          }}>
            Copy to Clipboard
          </button>
        )}
      </div>
      {error && <div className="gen-preview-error">{error}</div>}
      {result && (
        <div className="gen-preview-content">
          {result.system && (
            <div>
              <div className="gen-preview-section-header">
                <span>System Message</span>
                <span className="gen-preview-section-words">{wordCount(result.system)} words</span>
                <button className="gen-preview-section-copy" onClick={() => navigator.clipboard.writeText(result.system)}>Copy</button>
              </div>
              <pre className="gen-preview-pre">{result.system}</pre>
            </div>
          )}
          {result.user && (
            <div>
              <div className="gen-preview-section-header">
                <span>User</span>
                <span className="gen-preview-section-words">{wordCount(result.user)} words</span>
                <button className="gen-preview-section-copy" onClick={() => navigator.clipboard.writeText(result.user)}>Copy</button>
              </div>
              <pre className="gen-preview-pre">{result.user}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
