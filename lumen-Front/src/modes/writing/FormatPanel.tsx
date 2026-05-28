import { useEffect } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover";
import { Checkbox } from "../../components/ui/checkbox";
import { Type, AlignLeft, AlignJustify, Maximize, ArrowUpToLine, ArrowDownToLine } from "lucide-react";
import { useWritingStore, type FormatPreferences } from "../../stores/useWritingStore";
import { cn } from "../../lib/utils";

const FONT_OPTIONS = [
  { value: "serif", label: "衬线体" },
  { value: "sans", label: "无衬线体" },
  { value: "noto-serif", label: "思源宋体" },
  { value: "mono", label: "等宽体" },
];

const FONT_MAP: Record<string, string> = {
  serif: '"Noto Serif SC", "Source Serif Pro", Georgia, serif',
  sans: '"Noto Sans SC", "Source Sans Pro", system-ui, sans-serif',
  "noto-serif": '"Noto Serif SC", Georgia, serif',
  mono: '"JetBrains Mono", "Fira Code", monospace',
};

const SIZE_MAP: Record<string, string> = { s: "14px", m: "17px", l: "20px", xl: "23px" };
const LINE_HEIGHT_MAP: Record<string, string> = { none: "1.4", s: "1.7", m: "2.0", l: "2.3" };
const INDENT_MAP: Record<string, string> = { none: "0", s: "1em", m: "2em", l: "3em" };
const PARA_SPACE_MAP: Record<string, string> = { none: "0", s: "4px", m: "8px", l: "16px" };
const PAGE_WIDTH_MAP: Record<string, string> = { s: "480px", m: "600px", l: "720px", xl: "900px", full: "none" };

export function FormatPanel() {
  const prefs = useWritingStore((s) => s.formatPreferences);
  const update = useWritingStore((s) => s.updateFormatPreference);

  const applyCssVar = (prop: string, value: string) => {
    document.documentElement.style.setProperty(prop, value);
  };

  useEffect(() => {
    applyCssVar("--editor-font-family", FONT_MAP[prefs.fontFamily] || FONT_MAP.serif);
    applyCssVar("--editor-font-size", SIZE_MAP[prefs.textSizeMode] || SIZE_MAP.m);
    applyCssVar("--editor-line-height", LINE_HEIGHT_MAP[prefs.lineHeightMode] || LINE_HEIGHT_MAP.s);
    applyCssVar("--editor-text-indent", prefs.chicagoStyle ? "2em" : (INDENT_MAP[prefs.textIndentMode] || INDENT_MAP.none));
    applyCssVar("--editor-paragraph-spacing", prefs.chicagoStyle ? "0" : (PARA_SPACE_MAP[prefs.paragraphSpacingMode] || PARA_SPACE_MAP.s));
    applyCssVar("--editor-max-width", PAGE_WIDTH_MAP[prefs.pageWidthMode] || PAGE_WIDTH_MAP.l);

    if (prefs.smoothFollow) {
      document.querySelectorAll(".writing-manuscript-scroll").forEach((el) => {
        (el as HTMLElement).classList.add("smooth-follow");
      });
    }
    if (prefs.typewriterMode) {
      document.querySelectorAll(".rich-text-editor-prosemirror").forEach((el) => {
        (el as HTMLElement).classList.add("typewriter-mode");
      });
    }
    if (!prefs.colorizeAnnotations) {
      document.querySelectorAll(".rich-text-editor-prosemirror").forEach((el) => {
        (el as HTMLElement).classList.add("no-codex-colors");
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setPref = <K extends keyof FormatPreferences>(key: K, value: FormatPreferences[K]) => {
    update(key, value);
    applyToEditor(key, value);
  };

  const applyToEditor = <K extends keyof FormatPreferences>(key: K, value: FormatPreferences[K]) => {
    switch (key) {
      case "fontFamily":
        applyCssVar("--editor-font-family", FONT_MAP[value as string] || FONT_MAP.serif);
        break;
      case "textSizeMode":
        applyCssVar("--editor-font-size", SIZE_MAP[value as string] || SIZE_MAP.m);
        break;
      case "lineHeightMode":
        applyCssVar("--editor-line-height", LINE_HEIGHT_MAP[value as string] || LINE_HEIGHT_MAP.s);
        break;
      case "textIndentMode":
        applyCssVar("--editor-text-indent", INDENT_MAP[value as string] || INDENT_MAP.none);
        break;
      case "paragraphSpacingMode":
        applyCssVar("--editor-paragraph-spacing", PARA_SPACE_MAP[value as string] || PARA_SPACE_MAP.s);
        break;
      case "pageWidthMode":
        applyCssVar("--editor-max-width", PAGE_WIDTH_MAP[value as string] || PAGE_WIDTH_MAP.l);
        break;
      case "textAlignMode": {
        document.querySelectorAll(".rich-text-editor-prosemirror").forEach((el) => {
          (el as HTMLElement).style.textAlign = value as string;
        });
        break;
      }
      case "chicagoStyle": {
        document.querySelectorAll(".rich-text-editor-prosemirror").forEach((el) => {
          (el as HTMLElement).classList.toggle("chicago-style", value as boolean);
        });
        if (value) {
          applyCssVar("--editor-text-indent", "2em");
          applyCssVar("--editor-paragraph-spacing", "0");
        } else {
          applyCssVar("--editor-text-indent", INDENT_MAP[prefs.textIndentMode]);
          applyCssVar("--editor-paragraph-spacing", PARA_SPACE_MAP[prefs.paragraphSpacingMode]);
        }
        break;
      }
      case "typewriterMode": {
        document.querySelectorAll(".rich-text-editor-prosemirror").forEach((el) => {
          (el as HTMLElement).classList.toggle("typewriter-mode", value as boolean);
        });
        useWritingStore.setState({ typewriterMode: value as boolean });
        break;
      }
      case "smoothFollow": {
        document.querySelectorAll(".writing-manuscript-scroll").forEach((el) => {
          (el as HTMLElement).classList.toggle("smooth-follow", value as boolean);
        });
        break;
      }
      case "colorizeAnnotations": {
        document.querySelectorAll(".rich-text-editor-prosemirror").forEach((el) => {
          (el as HTMLElement).classList.toggle("no-codex-colors", !value);
        });
        break;
      }
    }
  };

  return (
    <Popover>
      <PopoverTrigger
        className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-semibold text-stone-400 hover:text-stone-300 hover:bg-gray-800 transition-colors"
        type="button"
      >
        <Type className="w-4 h-4" />
        <span className="hidden sm:inline">Format</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[360px] max-h-[70vh] overflow-y-auto p-4 bg-[var(--color-surface-deep)] border-[var(--color-border)] rounded-lg shadow-xl space-y-2"
      >
        {/* ── TYPOGRAPHY — 4 rows ── */}

        {/* Row 1: 字体 + 分割线 */}
        <div className="grid grid-cols-2 gap-x-4">
          <SegField label="字体">
            <select
              value={prefs.fontFamily}
              onChange={(e) => setPref("fontFamily", e.target.value)}
              className="w-full h-7 rounded-md border border-[var(--color-border)] bg-transparent text-xs text-[var(--color-text-primary)] px-2 outline-none"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </SegField>

          <SegField label="分割线">
            <select
              value={prefs.sceneDividerStyle}
              onChange={(e) => setPref("sceneDividerStyle", e.target.value as FormatPreferences["sceneDividerStyle"])}
              className="w-full h-7 rounded-md border border-[var(--color-border)] bg-transparent text-xs text-[var(--color-text-primary)] px-2 outline-none"
            >
              <option value="line">横线</option>
              <option value="boxes">方块</option>
              <option value="wave">波浪</option>
              <option value="heart">心形</option>
              <option value="asterisks">星号</option>
            </select>
          </SegField>
        </div>

        {/* Row 2: 字号 + 行高 */}
        <div className="grid grid-cols-2 gap-x-4">
          <SegField label="字号">
            <SegButtons
              options={[
                { value: "s", content: <span className="text-[10px] font-bold">S</span> },
                { value: "m", content: <span className="text-[11px] font-bold">M</span> },
                { value: "l", content: <span className="text-[12px] font-bold">L</span> },
                { value: "xl", content: <span className="text-[13px] font-bold">XL</span> },
              ]}
              value={prefs.textSizeMode}
              onChange={(v) => setPref("textSizeMode", v as FormatPreferences["textSizeMode"])}
            />
          </SegField>

          <SegField label="行高">
            <SegButtons
              options={[
                { value: "none", content: <LinesIcon gap={1} /> },
                { value: "s", content: <LinesIcon gap={3} /> },
                { value: "m", content: <LinesIcon gap={5} /> },
                { value: "l", content: <LinesIcon gap={7} /> },
              ]}
              value={prefs.lineHeightMode}
              onChange={(v) => setPref("lineHeightMode", v as FormatPreferences["lineHeightMode"])}
            />
          </SegField>
        </div>

        {/* Row 3: 缩进+Chicago + 段间距 */}
        <div className="grid grid-cols-2 gap-x-4">
          <SegField label="缩进">
            <SegButtons
              options={[
                { value: "none", content: <IndentIcon level={0} /> },
                { value: "s", content: <IndentIcon level={3} /> },
                { value: "m", content: <IndentIcon level={6} /> },
                { value: "l", content: <IndentIcon level={9} /> },
              ]}
              value={prefs.textIndentMode}
              onChange={(v) => setPref("textIndentMode", v as FormatPreferences["textIndentMode"])}
            />
            <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
              <Checkbox checked={prefs.chicagoStyle} onCheckedChange={(v) => setPref("chicagoStyle", !!v)} className="size-3.5 [&[data-checked]]:bg-zinc-500 [&[data-checked]]:border-zinc-500 [&_svg]:size-2.5" />
              <span className="text-[10px] text-[var(--color-text-dim)]">Chicago</span>
            </label>
          </SegField>

          <SegField label="段间距">
            <SegButtons
              options={[
                { value: "none", content: <span className="text-[10px]">无</span> },
                { value: "s", content: <span className="text-[10px]">小</span> },
                { value: "m", content: <span className="text-[10px]">中</span> },
                { value: "l", content: <span className="text-[10px]">大</span> },
              ]}
              value={prefs.paragraphSpacingMode}
              onChange={(v) => setPref("paragraphSpacingMode", v as FormatPreferences["paragraphSpacingMode"])}
            />
          </SegField>
        </div>

        {/* Row 4: 对齐 + 页宽 */}
        <div className="grid grid-cols-2 gap-x-4">
          <SegField label="对齐">
            <SegButtons
              options={[
                { value: "left", content: <AlignLeft className="w-3.5 h-3.5" /> },
                { value: "justify", content: <AlignJustify className="w-3.5 h-3.5" /> },
              ]}
              value={prefs.textAlignMode}
              onChange={(v) => setPref("textAlignMode", v as FormatPreferences["textAlignMode"])}
            />
          </SegField>

          <SegField label="页宽">
            <SegButtons
              options={[
                { value: "s", content: "S" },
                { value: "m", content: "M" },
                { value: "l", content: "L" },
                { value: "xl", content: "XL" },
                { value: "full", content: <Maximize className="w-3 h-3" /> },
              ]}
              value={prefs.pageWidthMode}
              onChange={(v) => setPref("pageWidthMode", v as FormatPreferences["pageWidthMode"])}
            />
          </SegField>
        </div>

        <hr className="border-t border-[var(--color-border)] -mx-4" />

        {/* ── CURSOR ── */}
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">光标</h3>

        <div className="grid grid-cols-2 gap-x-4">
          <DescField label="跳转位置" description="点击场景时光标落在开头还是末尾">
            <SegButtons
              options={[
                { value: "start", content: <><ArrowUpToLine className="w-3 h-3" /><span className="text-[10px]">开头</span></> },
                { value: "end", content: <><ArrowDownToLine className="w-3 h-3" /><span className="text-[10px]">末尾</span></> },
              ]}
              value={prefs.jumpPosition}
              onChange={(v) => setPref("jumpPosition", v as FormatPreferences["jumpPosition"])}
            />
          </DescField>

          <DescField label="打字机模式" description="光标始终保持在屏幕中央">
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={prefs.typewriterMode} onCheckedChange={(v) => setPref("typewriterMode", !!v)} className="size-3.5 [&[data-checked]]:bg-zinc-500 [&[data-checked]]:border-zinc-500 [&_svg]:size-2.5" />
                <span className="text-[10px] text-[var(--color-text-secondary)]">启用</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={prefs.smoothFollow} onCheckedChange={(v) => setPref("smoothFollow", !!v)} className="size-3.5 [&[data-checked]]:bg-zinc-500 [&[data-checked]]:border-zinc-500 [&_svg]:size-2.5" />
                <span className="text-[10px] text-[var(--color-text-secondary)]">平滑跟随</span>
              </label>
            </div>
          </DescField>
        </div>

        <hr className="border-t border-[var(--color-border)] -mx-4" />

        {/* ── PAGE + STATISTICS ── */}
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">页面</h3>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-14">
                <span className="text-[10px] text-[var(--color-text-dim)]">阅读速度</span>
                <span className="text-[9px] text-[var(--color-text-dim)] opacity-60 block leading-tight">词/分钟</span>
              </div>
              <NumberInput value={prefs.readingSpeed} min={50} max={900} onChange={(v) => setPref("readingSpeed", v)} />
            </div>
          </div>

          <CheckRow label="Codex 着色" description="下划线常驻，开关控制 hover 颜色" checked={prefs.colorizeAnnotations} onChange={(v) => setPref("colorizeAnnotations", v)} />

          <div>
            <div className="flex items-center gap-3">
              <div className="w-14">
                <span className="text-[10px] text-[var(--color-text-dim)]">每页字数</span>
                <span className="text-[9px] text-[var(--color-text-dim)] opacity-60 block leading-tight">用于计算页数</span>
              </div>
              <NumberInput value={prefs.wordsPerPage} min={50} max={900} onChange={(v) => setPref("wordsPerPage", v)} />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Sub-components ── */

function SegField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-[var(--color-text-dim)]">{label}</p>
      {children}
    </div>
  );
}

function DescField({ label, description, children }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-[var(--color-text-dim)]">{label}</p>
      {description && <p className="text-[9px] text-[var(--color-text-dim)] opacity-60">{description}</p>}
      {children}
    </div>
  );
}

function CheckRow({ label, description, checked, onChange }: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} className="size-3.5 mt-0.5 [&[data-checked]]:bg-zinc-500 [&[data-checked]]:border-zinc-500 [&_svg]:size-2.5" />
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-[var(--color-text-secondary)]">{label}</span>
        {description && <span className="text-[9px] text-[var(--color-text-dim)] opacity-60">{description}</span>}
      </div>
    </label>
  );
}

function SegButtons({ options, value, onChange }: {
  options: { value: string; content: React.ReactNode }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center justify-center px-2 py-1 text-[11px] rounded-md border transition-all cursor-pointer min-w-[28px]",
            value === opt.value
              ? "border-stone-400 text-stone-200 bg-transparent ring-0"
              : "text-[var(--color-text-dim)] border-[var(--color-border)] bg-transparent hover:border-stone-600"
          )}
        >
          {opt.content}
        </button>
      ))}
    </div>
  );
}

/** 3 horizontal lines with variable gap — visualizes line-height */
function LinesIcon({ gap }: { gap: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline-block">
      <rect x="1" y={2} width="14" height="2" rx="0.5" fill="currentColor" opacity={0.8} />
      <rect x="1" y={7 - gap * 0.3} width="14" height="2" rx="0.5" fill="currentColor" opacity={0.5} />
      <rect x="1" y={12 - gap * 0.6} width="14" height="2" rx="0.5" fill="currentColor" opacity={0.3} />
    </svg>
  );
}

/** Text block with indent marker — visualizes text-indent */
function IndentIcon({ level }: { level: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline-block">
      <rect x={1 + level} y="2" width={14 - level} height="2" rx="0.5" fill="currentColor" opacity={0.8} />
      <rect x={1 + level} y="7" width={14 - level} height="2" rx="0.5" fill="currentColor" opacity={0.5} />
      <rect x="1" y="12" width="14" height="2" rx="0.5" fill="currentColor" opacity={0.3} />
      {level > 0 && <rect x="1" y="7" width={level} height="2" rx="0.3" fill="currentColor" opacity={0.6} />}
    </svg>
  );
}

function NumberInput({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v) && v >= min && v <= max) onChange(v);
      }}
      onBlur={(e) => {
        const v = parseInt(e.target.value, 10);
        if (isNaN(v) || v < min || v > max) onChange(Math.min(max, Math.max(min, isNaN(v) ? 200 : v)));
      }}
      className="w-14 h-6 rounded border border-[var(--color-border)] bg-transparent text-[11px] text-[var(--color-text-primary)] text-center outline-none focus:border-stone-400"
    />
  );
}
