/**
 * TabGeneral — Edit → General sub-tab
 *
 * NC-aligned layout:
 * - PRESETS: collapsible cards with full Tweak UI inside (Name/Model/Input values)
 * - MODELS: model collections
 * - GENERAL SETTINGS: type, path, category, user section
 */
import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { TemplateDetail } from "../../../../api/templates";
import { useModels } from "../../../../hooks/useModels";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "../../../../components/ui/dropdown-menu";
import { useWritingStore } from "../../../../stores/useWritingStore";

// ── Shared Preset interface ──

interface PromptPreset {
  id: string;
  name: string;
  fields: {
    words?: { enabled: boolean; value: number };
    instructions?: { enabled: boolean; value: string };
    additionalContext?: { enabled: boolean; value: string; contextSelection?: Record<string, string[]> };
  };
  modelId: string;
  createdAt: number;
}

function getPresetKey(templateName: string) {
  return `prompt-presets:${templateName}`;
}

function loadPresets(templateName: string): PromptPreset[] {
  try {
    const raw = localStorage.getItem(getPresetKey(templateName));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePresets(templateName: string, presets: PromptPreset[]) {
  localStorage.setItem(getPresetKey(templateName), JSON.stringify(presets));
}

const WORD_PRESETS = [200, 400, 600] as const;

// ── Expandable Instructions Editor Dialog ──

function ExpandInstructionsDialog({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div className="gen-dialog-overlay" onClick={onClose}>
      <div className="gen-dialog" onClick={e => e.stopPropagation()} style={{ height: "min(400px, 80vh)", width: "min(520px, 90vw)" }}>
        <div className="gen-dialog-header">
          <h2 className="gen-dialog-title">Edit Instructions</h2>
          <div className="flex items-center gap-2">
            <button className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer border border-zinc-700/40 px-2 py-1 rounded"
              onClick={() => navigator.clipboard.writeText(value)}>Copy</button>
            <button className="gen-dialog-close" onClick={onClose}>× Close</button>
          </div>
        </div>
        <div className="gen-dialog-body" style={{ padding: 0 }}>
          <textarea
            autoFocus
            className="w-full h-full bg-transparent text-zinc-300 text-[13px] outline-none resize-none p-4"
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Context Selection Dropdown ──

function ContextDropdown({
  selection,
  onToggle,
}: {
  selection: Record<string, string[]>;
  onToggle: (key: string, value: string) => void;
}) {
  // We load lightweight lists from the store — no API calls here
  const codexEntries = useWritingStore(s => s.codexEntries) || [];
  const acts = useWritingStore(s => s.acts) || [];
  const scenes = acts.flatMap(act => act.chapters.flatMap(ch => ch.scenes));
  const chapters = acts.flatMap(act => act.chapters);

  const isSelected = (key: string, val: string) => (selection[key] || []).includes(val);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="text-[11px] text-zinc-400 hover:text-zinc-300 cursor-pointer border border-zinc-700/40 px-2 py-1 rounded bg-zinc-900/40">
        Context
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={2} className="max-h-[300px] overflow-y-auto">
        <DropdownMenuItem onClick={() => onToggle("fullNovelText", "true")}>
          {isSelected("fullNovelText", "true") ? "✓ " : ""}Full Novel Text
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onToggle("fullOutline", "true")}>
          {isSelected("fullOutline", "true") ? "✓ " : ""}Full Outline
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Codex Entries</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[200px] overflow-y-auto">
            {codexEntries.length > 0 ? codexEntries.map(e => (
              <DropdownMenuItem key={e.id} onClick={() => onToggle("codexEntries", e.id)}>
                {isSelected("codexEntries", e.id) ? "✓ " : ""}{e.name}
              </DropdownMenuItem>
            )) : <DropdownMenuItem disabled>No codex entries</DropdownMenuItem>}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Scenes</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[200px] overflow-y-auto">
            {scenes.length > 0 ? scenes.map((s: any) => (
              <DropdownMenuItem key={s.id} onClick={() => onToggle("scenes", s.id)}>
                {isSelected("scenes", s.id) ? "✓ " : ""}{s.title || s.subtitle || s.id}
              </DropdownMenuItem>
            )) : <DropdownMenuItem disabled>No scenes</DropdownMenuItem>}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Chapters</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {chapters.length > 0 ? chapters.map((c: any) => (
              <DropdownMenuItem key={c.id} onClick={() => onToggle("chapters", c.id)}>
                {isSelected("chapters", c.id) ? "✓ " : ""}{c.title || c.id}
              </DropdownMenuItem>
            )) : <DropdownMenuItem disabled>No chapters</DropdownMenuItem>}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {Object.keys(selection).length > 0 && (
          <DropdownMenuItem onClick={() => onToggle("__clear__", "")}>
            Clear selection
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Preset Card (collapsible) ──

function PresetCard({
  preset,
  models,
  onUpdate,
  onDelete,
  onClone,
}: {
  preset: PromptPreset;
  models: { id: string; owned_by: string }[];
  onUpdate: (p: PromptPreset) => void;
  onDelete: () => void;
  onClone: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const [expandInstructions, setExpandInstructions] = useState(false);

  const wordsEnabled = !!preset.fields.words?.enabled;
  const wordsValue = preset.fields.words?.value ?? 400;
  const instrEnabled = !!preset.fields.instructions?.enabled;
  const instrValue = preset.fields.instructions?.value ?? "";
  const ctxEnabled = !!preset.fields.additionalContext?.enabled;
  const ctxSelection = preset.fields.additionalContext?.contextSelection ?? {};

  const updateField = useCallback((field: string, val: any) => {
    const next = { ...preset };
    if (field === "name") next.name = val;
    else if (field === "modelId") next.modelId = val;
    else if (field === "words") next.fields = { ...next.fields, words: { enabled: true, value: val } };
    else if (field === "instructions") next.fields = { ...next.fields, instructions: { enabled: true, value: val } };
    else if (field === "toggleWords") next.fields = { ...next.fields, words: val ? { enabled: true, value: 400 } : undefined };
    else if (field === "toggleInstructions") next.fields = { ...next.fields, instructions: val ? { enabled: true, value: "" } : undefined };
    else if (field === "toggleContext") next.fields = { ...next.fields, additionalContext: val ? { enabled: true, value: "", contextSelection: {} } : undefined };
    else if (field === "contextSelection") next.fields = { ...next.fields, additionalContext: { enabled: true, value: "", ...next.fields.additionalContext, contextSelection: val } };
    onUpdate(next);
  }, [preset, onUpdate]);

  const handleContextToggle = useCallback((key: string, value: string) => {
    const sel = { ...ctxSelection };
    if (key === "__clear__") {
      updateField("contextSelection", {});
      return;
    }
    const arr = sel[key] || [];
    if (arr.includes(value)) {
      sel[key] = arr.filter(v => v !== value);
      if (sel[key].length === 0) delete sel[key];
    } else {
      sel[key] = [...arr, value];
    }
    updateField("contextSelection", sel);
  }, [ctxSelection, updateField]);

  // Collapsed header
  if (!expanded) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-2 rounded text-[12px] bg-zinc-800/50 border border-zinc-700/40 cursor-pointer hover:border-zinc-600/60"
        onClick={() => setExpanded(true)}>
        <div className="flex-1 min-w-0">
          <div className="text-zinc-300 truncate">{preset.name}</div>
          <div className="text-[10px] text-zinc-500">{preset.modelId || "No model selected"}</div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="text-zinc-500 hover:text-zinc-300 cursor-pointer px-0.5"
            onClick={e => e.stopPropagation()}>⋯</DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={2}>
            <DropdownMenuItem onClick={() => { const n = prompt("Rename:", preset.name); if (n?.trim()) updateField("name", n.trim()); }}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className="text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer shrink-0 border border-zinc-700/40 px-1.5 py-0.5 rounded"
          onClick={e => { e.stopPropagation(); onClone(); }}>Clone</button>
      </div>
    );
  }

  // Expanded body
  return (
    <div className="rounded text-[12px] bg-zinc-800/30 border border-zinc-700/50">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/30">
        <button type="button" className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
          onClick={() => setExpanded(false)}>▾</button>
        <span className="text-zinc-400 flex-1 truncate">{preset.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger className="text-zinc-500 hover:text-zinc-300 cursor-pointer px-0.5">⋯</DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={2}>
            <DropdownMenuItem onClick={() => { const n = prompt("Rename:", preset.name); if (n?.trim()) updateField("name", n.trim()); }}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className="text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer border border-zinc-700/40 px-1.5 py-0.5 rounded"
          onClick={onClone}>Clone</button>
      </div>

      <div className="px-3 py-3 space-y-4">
        {/* Name */}
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Name</label>
          <input type="text" className="w-full bg-zinc-900/60 border border-zinc-700/40 rounded px-2 py-1.5 text-zinc-300 text-[12px] outline-none focus:border-zinc-500/50"
            value={preset.name} onChange={e => updateField("name", e.target.value)} />
        </div>

        {/* Model */}
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Model</label>
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full text-left px-2 py-1.5 rounded border border-zinc-700/40 bg-zinc-900/60 text-zinc-400 text-[12px] hover:border-zinc-600/60">
              {preset.modelId || "No model selected"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={2}>
              {models.map(m => (
                <DropdownMenuItem key={m.id} onClick={() => updateField("modelId", m.id)}>
                  {m.id} {m.id === preset.modelId ? "✓" : ""}
                </DropdownMenuItem>
              ))}
              {models.length === 0 && <DropdownMenuItem disabled>No models available</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Input values */}
        <div className="p-4 flex flex-col gap-0 border rounded shadow-inner bg-zinc-900/80 border-zinc-700/30">
          <div className="text-[11px] text-zinc-400 font-medium mb-1">Input values</div>
          <p className="text-[10px] text-zinc-600 mb-3">
            The values for this preset. These will be used when you select it for a prompt.
          </p>

          {/* Words — toggleable */}
          {wordsEnabled ? (
            <fieldset className="border border-zinc-700/30 rounded px-3 py-2.5 mb-3">
              <legend className="text-[11px] text-zinc-400 flex items-center gap-1.5 px-1 w-full">
                <span>Words</span>
                <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 py-px rounded">Required</span>
                <span className="flex-1" />
                <button type="button" className="text-[12px] text-stone-100 bg-zinc-700 hover:bg-zinc-600 rounded px-1.5 py-0.5 flex items-center gap-1 cursor-pointer"
                  onClick={() => updateField("toggleWords", false)}>
                  <span className="text-[10px]">↺</span>Reset
                </button>
              </legend>
              <p className="text-[10px] text-zinc-600 mb-2">How many words should the AI write?</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {WORD_PRESETS.map(w => (
                  <button key={w} type="button"
                    className={`px-2 py-1 rounded text-[11px] border cursor-pointer ${wordsValue === w ? "bg-zinc-600/40 border-zinc-500/50 text-zinc-200" : "border-zinc-700/40 text-zinc-500 hover:border-zinc-600/50"}`}
                    onClick={() => updateField("words", w)}>
                    {w}
                  </button>
                ))}
                <span className="text-zinc-600 text-[10px] mx-1">OR</span>
                <input type="number" className="w-16 bg-zinc-900/60 border border-zinc-700/40 rounded px-1.5 py-1 text-[11px] text-zinc-300 outline-none"
                  placeholder="e.g. 300"
                  onChange={e => { const v = parseInt(e.target.value, 10); if (v > 0) updateField("words", v); }} />
              </div>
            </fieldset>
          ) : (
            <button type="button" className="text-[11px] text-zinc-500 hover:text-zinc-300 mb-3 block cursor-pointer"
              onClick={() => updateField("toggleWords", true)}>
              + Add 'Words'
            </button>
          )}

          {/* Instructions — toggleable */}
          {instrEnabled ? (
            <fieldset className="border border-zinc-700/30 rounded px-3 py-2.5 mb-3">
              <legend className="text-[11px] text-zinc-400 flex items-center gap-1.5 px-1 w-full">
                <span>Instructions</span>
                <span className="flex-1" />
                <button type="button" className="text-[12px] text-stone-100 bg-zinc-700 hover:bg-zinc-600 rounded px-1.5 py-0.5 flex items-center gap-1 cursor-pointer"
                  onClick={() => updateField("toggleInstructions", false)}>
                  <span className="text-[10px]">↺</span>Reset
                </button>
              </legend>
              <p className="text-[10px] text-zinc-600 mb-2">Any (optional) additional instructions and roles for the AI</p>
              <div className="flex gap-1.5">
                <textarea className="flex-1 bg-zinc-900/60 border border-zinc-700/40 rounded px-2 py-1.5 text-zinc-300 text-[12px] outline-none resize-y min-h-[60px]"
                  value={instrValue} onChange={e => updateField("instructions", e.target.value)} rows={3} />
                <div className="flex flex-col gap-1">
                  <button type="button" className="text-[9px] text-zinc-500 hover:text-zinc-300 border border-zinc-700/40 px-1.5 py-1 rounded cursor-pointer disabled:opacity-30 disabled:cursor-default"
                    disabled={!instrValue.trim()} onClick={() => setExpandInstructions(true)}>Expand</button>
                  <button type="button" className="text-[9px] text-zinc-500 hover:text-zinc-300 border border-zinc-700/40 px-1.5 py-1 rounded cursor-pointer disabled:opacity-30 disabled:cursor-default"
                    disabled={!instrValue.trim()} onClick={() => navigator.clipboard.writeText(instrValue)}>Copy</button>
                </div>
              </div>
            </fieldset>
          ) : (
            <button type="button" className="text-[11px] text-zinc-500 hover:text-zinc-300 mb-3 block cursor-pointer"
              onClick={() => updateField("toggleInstructions", true)}>
              + Add 'Instructions'
            </button>
          )}

          {/* Additional Context — toggleable */}
          {ctxEnabled ? (
            <fieldset className="border border-zinc-700/30 rounded px-3 py-2.5 mb-3">
              <legend className="text-[11px] text-zinc-400 flex items-center gap-1.5 px-1 w-full">
                <span>Additional Context</span>
                <span className="flex-1" />
                <button type="button" className="text-[12px] text-stone-100 bg-zinc-700 hover:bg-zinc-600 rounded px-1.5 py-0.5 flex items-center gap-1 cursor-pointer"
                  onClick={() => updateField("toggleContext", false)}>
                  <span className="text-[10px]">↺</span>Reset
                </button>
              </legend>
              <p className="text-[10px] text-zinc-600 mb-2">Any additional information to provide to the AI</p>
              <ContextDropdown selection={ctxSelection} onToggle={handleContextToggle} />
              {/* Show selected items */}
              {Object.entries(ctxSelection).map(([key, vals]) => vals.map(v => (
                <span key={`${key}-${v}`} className="inline-flex items-center gap-1 text-[9px] text-zinc-400 bg-zinc-700/30 border border-zinc-700/40 px-1.5 py-0.5 rounded mr-1 mt-1">
                  {v === "true" ? key : v}
                  <button type="button" className="text-zinc-600 hover:text-zinc-400" onClick={() => handleContextToggle(key, v)}>×</button>
                </span>
              )))}
            </fieldset>
          ) : (
            <button type="button" className="text-[11px] text-zinc-500 hover:text-zinc-300 mb-3 block cursor-pointer"
              onClick={() => updateField("toggleContext", true)}>
              + Add 'Additional Context'
            </button>
          )}

          {/* History — placeholder */}
          <button type="button" className="text-[11px] text-zinc-600 hover:text-zinc-400 mt-1 cursor-pointer">History</button>
        </div>
      </div>

      {/* Expand instructions dialog */}
      {expandInstructions && (
        <ExpandInstructionsDialog
          value={instrValue}
          onChange={v => updateField("instructions", v)}
          onClose={() => setExpandInstructions(false)}
        />
      )}
    </div>
  );
}

// ── Main Component ──

export function TabGeneral({ template }: { template: TemplateDetail }) {
  const { models } = useModels();
  const [presets, setPresets] = useState<PromptPreset[]>(() => loadPresets(template.name));

  const persistAndSet = useCallback((next: PromptPreset[]) => {
    savePresets(template.name, next);
    setPresets(next);
  }, [template.name]);

  const createPreset = useCallback(() => {
    const p: PromptPreset = {
      id: crypto.randomUUID(),
      name: "New Preset",
      fields: { words: { enabled: true, value: 400 } },
      modelId: "",
      createdAt: Date.now(),
    };
    persistAndSet([...presets, p]);
  }, [presets, persistAndSet]);

  const updatePreset = useCallback((updated: PromptPreset) => {
    persistAndSet(presets.map(p => p.id === updated.id ? updated : p));
  }, [presets, persistAndSet]);

  const deletePreset = useCallback((id: string) => {
    persistAndSet(presets.filter(p => p.id !== id));
  }, [presets, persistAndSet]);

  const clonePreset = useCallback((p: PromptPreset) => {
    persistAndSet([...presets, { ...p, id: crypto.randomUUID(), name: `${p.name} (Copy)`, createdAt: Date.now() }]);
  }, [presets, persistAndSet]);

  return (
    <div className="p-4 space-y-6 overflow-y-auto">
      {/* ── PRESETS ── */}
      <section className="p-4 rounded-lg border border-zinc-700/30 bg-zinc-800/25">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[14px] font-semibold text-zinc-300 uppercase tracking-wide">Presets</h3>
          <button type="button" className="text-[18px] text-zinc-500 hover:text-zinc-300 cursor-pointer leading-none"
            onClick={createPreset} title="New Preset">+</button>
        </div>
        <p className="text-[12px] text-zinc-500 mb-3">
          You can create custom presets for when you want to use this prompt.
        </p>
        {presets.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {presets.map(p => (
              <PresetCard key={p.id} preset={p} models={models}
                onUpdate={updatePreset} onDelete={() => deletePreset(p.id)} onClone={() => clonePreset(p)} />
            ))}
          </div>
        )}
        <button type="button" className="text-[12px] text-zinc-500 hover:text-zinc-300 cursor-pointer border border-zinc-700/40 px-2.5 py-1.5 rounded"
          onClick={createPreset}>New Preset</button>
      </section>

      {/* ── MODELS ── */}
      <section className="p-4 rounded-lg border border-zinc-700/30 bg-zinc-800/25">
        <h3 className="text-[14px] font-semibold text-zinc-300 uppercase tracking-wide mb-2">Models</h3>
        <p className="text-[12px] text-zinc-500 mb-3">
          Each prompt needs at least one model for it to run, but you can use different models to get different flavoured outputs.
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 px-2.5 py-2 rounded text-[12px] bg-zinc-800/50 border border-zinc-700/40">
            <span className="text-zinc-300 flex-1 truncate">{template.model || "default"}</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Default</span>
          </div>
          {models.length > 0 && (
            <p className="text-[11px] text-zinc-500 mt-1">Available: {models.map(m => m.id).join(', ')}</p>
          )}
        </div>
      </section>

      {/* ── GENERAL SETTINGS ── */}
      <section className="p-4 rounded-lg border border-zinc-700/30 bg-zinc-800/25">
        <h3 className="text-[14px] font-semibold text-zinc-300 uppercase tracking-wide mb-3">General Settings</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-zinc-500 w-24">Type</span>
            <span className="px-2.5 py-1 rounded text-[12px] font-medium bg-zinc-800 border border-zinc-700/50 text-zinc-300">{template.type || "—"}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-zinc-500 w-24">Path</span>
            <span className="text-[12px] text-zinc-500 font-mono">{template.path}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-zinc-500 w-24">Category</span>
            <span className="text-[13px] text-zinc-400">{template.category || "—"}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-zinc-500 w-24">User Section</span>
            <span className="text-[13px] text-zinc-400">{template.has_user_section ? "Yes (dual-layer)" : "No (system only)"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
