/**
 * RPG 状态面板 — 停靠版（左侧内联）
 *
 * 从浮动 RpgPanel 改造：去掉 portal，改为 flex 子元素内联停靠。
 * 展示当前房间实体列表和血量，通过 rpg_state 事件实时更新。
 * 含认知状态可视化（GM 情绪/目标/注意力）。
 */
import { useState, useMemo } from 'react';
import { RpgRoomState, RpgEntity, CognitiveState } from '../../hooks/useRPG';
import { ChevronDown, ChevronUp, Heart, Swords, Brain, Target, Eye } from 'lucide-react';

// ── 通用组件 ──

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const colorClass =
    pct > 60 ? 'bg-emerald-500' :
    pct > 30 ? 'bg-[var(--color-primary)]' :
    'bg-red-500';

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-slate-500 tabular-nums w-14 text-right">
        {hp}/{maxHp}
      </span>
    </div>
  );
}

function EntityCard({ entity }: { entity: RpgEntity }) {
  const [expanded, setExpanded] = useState(false);
  const hpPct = (entity.hp / entity.max_hp) * 100;
  const statusColor =
    hpPct > 60 ? 'text-emerald-400' :
    hpPct > 30 ? 'text-[var(--color-primary)]' :
    'text-red-400';

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-lg border border-[var(--color-bg-elevated)] overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-bg-elevated)]/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${statusColor} flex-shrink-0`} />
        <span className="text-sm text-slate-300 font-medium flex-1 truncate">
          {entity.name}
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
        )}
      </button>
      <div className="px-3 pb-2">
        <HpBar hp={entity.hp} maxHp={entity.max_hp} />
      </div>
      {expanded && (
        <div className="px-3 pb-2.5 space-y-1 border-t border-[var(--color-bg-elevated)] pt-2">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Heart className="w-3 h-3 text-red-400" />
            <span>生命值</span>
            <span className="text-slate-300 ml-auto">{entity.hp} / {entity.max_hp}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 认知状态组件 ──

/** 已知情绪的颜色映射 — 新增情绪自动回退到灰色 */
const EMOTION_COLORS: Record<string, string> = {
  anger: '#ef4444',
  fear: '#a855f7',
  sadness: '#3b82f6',
  joy: '#22c55e',
  surprise: '#f59e0b',
  disgust: '#6b7280',
  trust: '#06b6d4',
  anticipation: '#ec4899',
};

/** 已知情绪的中文标签 */
const EMOTION_LABELS: Record<string, string> = {
  anger: '愤怒',
  fear: '恐惧',
  sadness: '悲伤',
  joy: '喜悦',
  surprise: '惊讶',
  disgust: '厌恶',
  trust: '信任',
  anticipation: '期待',
};

/** 显示阈值 — 低于此值的情绪不显示 */
const EMOTION_THRESHOLD = 0.1;

function EmotionBar({ name, value }: { name: string; value: number }) {
  const label = EMOTION_LABELS[name] ?? name;
  const color = EMOTION_COLORS[name] ?? '#9ca3af';
  const pct = Math.round(value * 100);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400 w-10 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] tabular-nums w-9 text-right flex-shrink-0" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

interface CognitiveSectionProps {
  cognitiveState: CognitiveState;
}

const CognitiveSection = ({ cognitiveState }: CognitiveSectionProps) => {
  const [expanded, setExpanded] = useState(false);

  // 情绪数据：优先 emotion_scores（语义组精确分数），回退 emotions（LLM 生成）
  const emotions = useMemo(() => {
    const source = cognitiveState.emotion_scores ?? cognitiveState.emotions;
    if (!source) return [];
    return Object.entries(source)
      .filter(([, v]) => v > EMOTION_THRESHOLD)
      .sort(([, a], [, b]) => b - a); // 降序：主导情绪永远在最上方
  }, [cognitiveState.emotion_scores, cognitiveState.emotions]);

  // 判断是否有内容可显示
  const { attention, goals, context_summary } = cognitiveState;
  const hasContent = attention || (goals && goals.length > 0) || emotions.length > 0 || context_summary;

  if (!hasContent) return null;

  return (
    <div className="border-t border-[var(--color-border)]">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-bg-elevated)]/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
        <span className="text-xs font-medium text-slate-400">认知状态</span>
        <span className="text-[10px] text-slate-600 ml-auto">
          {emotions.length > 0 ? `${emotions.length} 维` : ''}
        </span>
        {expanded ? (
          <ChevronUp className="w-3 h-3 text-slate-600" />
        ) : (
          <ChevronDown className="w-3 h-3 text-slate-600" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5">
          {/* 关注焦点 */}
          {attention && (
            <div className="flex items-start gap-1.5">
              <Eye className="w-3 h-3 text-cyan-400 mt-0.5 flex-shrink-0" />
              <span className="text-[11px] text-slate-300 leading-tight">{attention}</span>
            </div>
          )}

          {/* 当前目标 */}
          {goals && goals.length > 0 && (
            <div className="flex items-start gap-1.5">
              <Target className="w-3 h-3 text-[var(--color-primary)] mt-0.5 flex-shrink-0" />
              <div className="flex flex-wrap gap-1">
                {goals.map((g, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-primary)]/30 text-[var(--color-primary)]">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 情绪面板 */}
          {emotions.length > 0 && (
            <div className="space-y-1.5">
              {emotions.map(([name, value]) => (
                <EmotionBar key={name} name={name} value={value} />
              ))}
            </div>
          )}

          {/* 最近印象 */}
          {context_summary && (
            <p className="text-[10px] text-slate-500 italic leading-tight">
              {context_summary}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ── 主面板 ──

interface RpgStatusPanelProps {
  roomState: RpgRoomState;
  playerId?: string;
}

function RpgStatusPanel({ roomState, playerId }: RpgStatusPanelProps) {
  const sorted = [...roomState.entities].sort((a, b) => {
    if (a.id === playerId) return -1;
    if (b.id === playerId) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="w-64 flex flex-col bg-[var(--color-bg-deep)] border-r border-[var(--color-border)] flex-shrink-0">
      {/* 面板头部 */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
        <Swords className="w-3.5 h-3.5 text-[var(--color-primary)] flex-shrink-0" />
        <span className="text-sm font-medium text-slate-300 truncate">
          {roomState.roomName || '等待进入...'}
        </span>
        {roomState.entities.length > 0 && (
          <span className="text-[11px] text-slate-600 ml-auto">
            {roomState.entities.length}
          </span>
        )}
      </div>

      {/* 房间信息 */}
      {!roomState.roomId ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-slate-600">尚未进入冒险</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* 实体列表 */}
          <div className="p-2 space-y-1.5">
            {sorted.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-4">房间内暂无实体</p>
            ) : (
              sorted.map(entity => (
                <EntityCard key={entity.id} entity={entity} />
              ))
            )}
          </div>

          {/* 认知状态 */}
          {roomState.cognitiveState && (
            <CognitiveSection cognitiveState={roomState.cognitiveState} />
          )}
        </div>
      )}
    </div>
  );
}

export default RpgStatusPanel;
