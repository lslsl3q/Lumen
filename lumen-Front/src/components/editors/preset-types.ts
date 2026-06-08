// Shared PromptPreset type used by SceneBeatView and GenerateTextDialog.
// Both components share the same localStorage key, so they MUST use the same shape.

export interface ContextSelection {
  [key: string]: unknown;
}

export interface PromptPresetField {
  enabled: boolean;
  value: string | number;
}

export interface PromptPreset {
  id: string;
  name: string;
  fields: Record<string, PromptPresetField>;
  contextSelection?: ContextSelection;
  modelId: string;
  createdAt: number;
}

export function getPresetKey(templateName: string) {
  return `prompt-presets:${templateName}`;
}

export function loadPresets(templateName: string): PromptPreset[] {
  try {
    const raw = localStorage.getItem(getPresetKey(templateName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Migrate flat-field presets to structured format
    return parsed.map((p: any) => {
      if (p.fields && typeof p.fields === "object") {
        const migrated: Record<string, PromptPresetField> = {};
        for (const [k, v] of Object.entries(p.fields)) {
          if (v && typeof v === "object" && "enabled" in v) {
            migrated[k] = v as PromptPresetField;
          } else {
            // Flat value → structured
            migrated[k] = { enabled: true, value: v as string | number };
          }
        }
        p.fields = migrated;
      }
      return p as PromptPreset;
    });
  } catch {
    return [];
  }
}

export function savePresets(templateName: string, presets: PromptPreset[]) {
  localStorage.setItem(getPresetKey(templateName), JSON.stringify(presets));
}
