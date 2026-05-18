/**
 * GenerateTextDialog — NC-aligned generation configuration modal
 *
 * Opens from Scene Beat's generate button. 4 tabs:
 * - Tweak: configure words, instructions, additional context
 * - Preview: (placeholder) see the actual prompt
 * - Presets: (placeholder) saved prompt configurations
 * - Edit: (placeholder) edit prompt template
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const WORD_PRESETS = [200, 400, 600] as const;

type TabId = "tweak" | "preview" | "presets" | "edit";

const TABS: { id: TabId; label: string }[] = [
  { id: "tweak", label: "Tweak" },
  { id: "preview", label: "Preview" },
  { id: "presets", label: "Presets" },
  { id: "edit", label: "Edit" },
];

interface GenerateTextDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (opts: GenerateOptions) => void;
  defaultMaxWords: number;
  defaultModelId: string;
  contextIds: string[];
  chapterContent: string;
  chapterTitle: string;
  beatText: string;
}

export interface GenerateOptions {
  maxWords: number;
  modelId: string;
  instructions: string;
}

export function GenerateTextDialog({
  open,
  onClose,
  onGenerate,
  defaultMaxWords,
  defaultModelId,
  contextIds: _contextIds,
  chapterContent,
  chapterTitle,
  beatText,
}: GenerateTextDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>("tweak");
  const [maxWords, setMaxWords] = useState(defaultMaxWords);
  const [customWords, setCustomWords] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [modelId] = useState(defaultModelId);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab("tweak");
      setMaxWords(defaultMaxWords);
      setInstructions("");
      setCustomWords("");
      setShowCustom(false);
    }
  }, [open, defaultMaxWords]);

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
    onGenerate({ maxWords, modelId, instructions });
  }, [maxWords, modelId, instructions, onGenerate]);

  if (!open) return null;

  const previewContext = chapterContent.length > 300
    ? chapterContent.slice(-300)
    : chapterContent;

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
          {/* Tabs */}
          <div className="gen-dialog-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`gen-dialog-tab ${activeTab === tab.id ? "gen-dialog-tab-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="gen-dialog-content">
            {activeTab === "tweak" && (
              <TweakTab
                maxWords={maxWords}
                onMaxWordsChange={setMaxWords}
                customWords={customWords}
                onCustomWordsChange={setCustomWords}
                showCustom={showCustom}
                onToggleCustom={() => setShowCustom(!showCustom)}
                instructions={instructions}
                onInstructionsChange={setInstructions}
                chapterTitle={chapterTitle}
                previewContext={previewContext}
                beatText={beatText}
              />
            )}
            {activeTab === "preview" && (
              <PlaceholderTab text="Preview — 查看实际发送给 AI 的完整 prompt" />
            )}
            {activeTab === "presets" && (
              <PlaceholderTab text="Presets — 选择保存的 prompt 预设配置" />
            )}
            {activeTab === "edit" && (
              <PlaceholderTab text="Edit — 直接编辑 prompt 模板" />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="gen-dialog-footer">
          <div className="gen-dialog-model-info">
            {modelId || "默认模型"}
          </div>
          <button className="gen-dialog-generate" onClick={handleGenerate}>
            Generate
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TweakTab({
  maxWords,
  onMaxWordsChange,
  customWords,
  onCustomWordsChange,
  showCustom,
  onToggleCustom,
  instructions,
  onInstructionsChange,
  chapterTitle,
  previewContext,
  beatText,
}: {
  maxWords: number;
  onMaxWordsChange: (n: number) => void;
  customWords: string;
  onCustomWordsChange: (s: string) => void;
  showCustom: boolean;
  onToggleCustom: () => void;
  instructions: string;
  onInstructionsChange: (s: string) => void;
  chapterTitle: string;
  previewContext: string;
  beatText: string;
}) {
  return (
    <div className="gen-tweak">
      {/* Words section */}
      <section className="gen-tweak-section">
        <div className="gen-tweak-section-header">
          <div className="gen-tweak-section-label">
            <span className="gen-tweak-required">Words</span>
          </div>
        </div>
        <p className="gen-tweak-description">How many words should the AI write?</p>
        <div className="gen-tweak-word-row">
          {WORD_PRESETS.map((w) => (
            <button
              key={w}
              className={`gen-tweak-word-btn ${maxWords === w ? "gen-tweak-word-btn-active" : ""}`}
              onClick={() => onMaxWordsChange(w)}
            >
              {w}
            </button>
          ))}
          <span className="gen-tweak-or">OR</span>
          {showCustom ? (
            <input
              autoFocus
              type="number"
              className="gen-tweak-custom-input"
              placeholder="e.g. 300"
              value={customWords}
              onChange={(e) => {
                onCustomWordsChange(e.target.value);
                const v = parseInt(e.target.value, 10);
                if (v > 0) onMaxWordsChange(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = parseInt(customWords, 10);
                  if (v > 0) onMaxWordsChange(v);
                }
              }}
            />
          ) : (
            <button className="gen-tweak-custom-trigger" onClick={onToggleCustom}>
              …
            </button>
          )}
        </div>
      </section>

      {/* Instructions section */}
      <section className="gen-tweak-section">
        <div className="gen-tweak-section-header">
          <span className="gen-tweak-section-label">Instructions</span>
        </div>
        <p className="gen-tweak-description">
          Any (optional) additional instructions and roles for the AI
        </p>
        <textarea
          className="gen-tweak-textarea"
          placeholder="Optional: add specific instructions..."
          value={instructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          rows={3}
        />
      </section>

      {/* Additional Context section */}
      <section className="gen-tweak-section">
        <div className="gen-tweak-section-header">
          <span className="gen-tweak-section-label">Additional Context</span>
        </div>
        <p className="gen-tweak-description">
          Any additional information to provide to the AI
        </p>
        <div className="gen-tweak-context-preview">
          <div className="gen-tweak-context-label">Context</div>
          <div className="gen-tweak-context-title">{chapterTitle}</div>
          <div className="gen-tweak-context-text">
            {previewContext || "No chapter content available"}
          </div>
        </div>
        {beatText && (
          <div className="gen-tweak-beat-preview">
            <div className="gen-tweak-context-label">Beat Instruction</div>
            <div className="gen-tweak-context-text">{beatText}</div>
          </div>
        )}
      </section>
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
