import { useState, useCallback } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "../../../components/ui/popover";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PLOT_LINE_TYPE_LABELS, type PlotLineType, type PlotNode } from "../../../api/writing";

// ── Types ──

interface TrackInfo {
  key: string;         // "__main__" | "__subplot__" | dark groupKey
  label: string;       // display name
  type: PlotLineType;
  color: string;
  allNodes: PlotNode[]; // merged from all arcs
}

interface AddNodeMenuProps {
  tracks: TrackInfo[];
  defaultStartCh: number;
  totalChapters: number;
  onCreate: (trackKey: string, startCh: number, length: number) => void;
}

// ── Auto-trim logic ──

interface RangeResult {
  endCh: number;
  effectiveLength: number;
  trimmed: boolean;
  blocked: boolean;
  blockerName?: string;
}

function computeEffectiveRange(
  startCh: number, length: number, nodes: PlotNode[]
): RangeResult {
  const existing = (nodes || [])
    .map(n => ({ s: n.start_ch || 1, e: n.end_ch || ((n.start_ch || 1) + 1), title: n.title }))
    .sort((a, b) => a.s - b.s);

  // Check if startCh falls inside an existing node
  const blocker = existing.find(n => startCh >= n.s && startCh <= n.e);
  if (blocker) {
    return { endCh: startCh, effectiveLength: 0, trimmed: false, blocked: true, blockerName: blocker.title || "未命名" };
  }

  const rawEnd = startCh + length - 1;

  // Find the next node after startCh
  const nextNode = existing.find(n => n.s > startCh);
  if (nextNode && rawEnd >= nextNode.s) {
    const maxLen = nextNode.s - startCh;
    if (maxLen <= 0) {
      return { endCh: startCh, effectiveLength: 0, trimmed: false, blocked: true, blockerName: nextNode.title || "未命名" };
    }
    return { endCh: startCh + maxLen - 1, effectiveLength: maxLen, trimmed: true, blocked: false };
  }

  return { endCh: rawEnd, effectiveLength: length, trimmed: false, blocked: false };
}

// ── Component ──

export function AddNodeMenu({ tracks, defaultStartCh, totalChapters, onCreate }: AddNodeMenuProps) {
  const [phase, setPhase] = useState<"tracks" | "config">("tracks");
  const [selectedTrack, setSelectedTrack] = useState<TrackInfo | null>(null);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPhase("tracks");
      setSelectedTrack(null);
    }
  }, []);

  const handleSelectTrack = useCallback((track: TrackInfo) => {
    setSelectedTrack(track);
    setPhase("config");
  }, []);

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger className="nr-zoom-add" title="新建 Node">
        ＋
      </PopoverTrigger>
      <PopoverContent align="center" side="bottom" sideOffset={4} className="nr-add-popover">
        {phase === "tracks" ? (
          <TrackListView tracks={tracks} onSelect={handleSelectTrack} />
        ) : (
          <ConfigView
            track={selectedTrack!}
            defaultStartCh={defaultStartCh}
            totalChapters={totalChapters}
            onBack={() => { setPhase("tracks"); setSelectedTrack(null); }}
            onCreate={onCreate}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Track List View ──

function TrackListView({ tracks, onSelect }: { tracks: TrackInfo[]; onSelect: (t: TrackInfo) => void }) {
  return (
    <div className="nr-add-lines">
      <div className="nr-add-title">选择剧情线</div>
      {tracks.map(track => (
        <button
          key={track.key}
          className="nr-add-line-btn"
          onClick={() => onSelect(track)}
        >
          <span className="nr-add-dot" style={{ background: track.color }} />
          <span className="nr-add-line-name">{track.label}</span>
          <span className="nr-add-line-type">{PLOT_LINE_TYPE_LABELS[track.type]}</span>
        </button>
      ))}
    </div>
  );
}

// ── Config View ──

function ConfigView({
  track, defaultStartCh, totalChapters, onBack, onCreate,
}: {
  track: TrackInfo;
  defaultStartCh: number;
  totalChapters: number;
  onBack: () => void;
  onCreate: (trackKey: string, startCh: number, length: number) => void;
}) {
  const [startCh, setStartCh] = useState(() => Math.max(1, defaultStartCh));
  const [length, setLength] = useState(1);

  const range = computeEffectiveRange(startCh, length, track.allNodes);

  const handleCreate = useCallback(() => {
    if (range.blocked) return;
    onCreate(track.key, startCh, range.effectiveLength);
  }, [range, track.key, startCh, onCreate]);

  return (
    <div className="nr-add-config">
      <div className="nr-add-config-header">
        <button className="nr-add-back" onClick={onBack}>
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <span className="nr-add-title">新建 Node · {track.label}</span>
      </div>

      <div className="nr-add-fields">
        <label className="nr-add-field">
          <span>起始章</span>
          <Input
            type="number"
            min={1}
            max={totalChapters}
            value={startCh}
            onChange={e => setStartCh(Math.max(1, parseInt(e.target.value) || 1))}
            className="nr-add-input"
          />
        </label>
        <label className="nr-add-field">
          <span>章节长度</span>
          <Input
            type="number"
            min={1}
            value={length}
            onChange={e => setLength(Math.max(1, parseInt(e.target.value) || 1))}
            className="nr-add-input"
          />
        </label>
      </div>

      <div className="nr-add-range">
        → ch {startCh} ~ ch {range.blocked ? "?" : range.endCh}
      </div>

      {range.blocked && (
        <div className="nr-add-hint nr-add-hint-blocked">
          此位置已被「{range.blockerName}」占用
        </div>
      )}
      {range.trimmed && !range.blocked && (
        <div className="nr-add-hint nr-add-hint-trim">
          已裁切至可用间隙（{range.effectiveLength} 章）
        </div>
      )}

      <div className="nr-add-actions">
        <Button variant="ghost" size="sm" onClick={onBack}>取消</Button>
        <Button
          size="sm"
          disabled={range.blocked || range.effectiveLength <= 0}
          onClick={handleCreate}
        >
          创建
        </Button>
      </div>
    </div>
  );
}
