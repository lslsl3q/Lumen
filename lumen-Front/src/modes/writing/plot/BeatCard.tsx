import { useState, useCallback, useRef, useEffect } from "react";
import { GripVertical, X } from "lucide-react";
import { PLOT_BEAT_KIND_LABELS, PLOT_BEAT_KIND_COLORS, type PlotBeat, type PlotBeatKind } from "../../../api/writing";

const KIND_OPTIONS = Object.entries(PLOT_BEAT_KIND_LABELS) as [PlotBeatKind, string][];

interface BeatCardProps {
  beat: PlotBeat;
  onUpdate: (id: string, data: Partial<Pick<PlotBeat, "kind" | "summary">>) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: Record<string, unknown>;
}

export function BeatCard({ beat, onUpdate, onDelete, dragHandleProps }: BeatCardProps) {
  const [summary, setSummary] = useState(beat.summary);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync when beat changes externally
  useEffect(() => { setSummary(beat.summary); }, [beat.summary]);

  const handleSummaryBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (summary !== beat.summary) onUpdate(beat.id, { summary });
  }, [summary, beat.summary, beat.id, onUpdate]);

  const handleSummaryChange = useCallback((val: string) => {
    setSummary(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val !== beat.summary) onUpdate(beat.id, { summary: val });
    }, 600);
  }, [beat.summary, beat.id, onUpdate]);

  const color = PLOT_BEAT_KIND_COLORS[beat.kind] || "#6b7280";

  return (
    <div className="nr-beat-card" style={{ "--beat-color": color } as React.CSSProperties}>
      <span className="nr-beat-grip" {...dragHandleProps}>
        <GripVertical className="w-3.5 h-3.5" />
      </span>

      <select
        className="nr-beat-kind-select"
        value={beat.kind}
        onChange={(e) => onUpdate(beat.id, { kind: e.target.value as PlotBeatKind })}
      >
        {KIND_OPTIONS.map(([k, label]) => (
          <option key={k} value={k}>{label}</option>
        ))}
      </select>

      <input
        className="nr-beat-summary"
        type="text"
        value={summary}
        placeholder="情节描述..."
        onChange={(e) => handleSummaryChange(e.target.value)}
        onBlur={handleSummaryBlur}
      />

      <button className="nr-beat-delete" onClick={() => onDelete(beat.id)} title="删除">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
