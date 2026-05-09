/**
 * RPG 状态面板 — 右侧浮动面板
 *
 * 展示当前房间实体列表和血量，通过 SSE rpg_state 事件实时更新。
 * 只在 RPG 模式激活（房间不为空）时显示。
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { RpgRoomState, RpgEntity } from '../hooks/useRPG';
import { ChevronDown, ChevronUp, Heart, Swords } from 'lucide-react';

/* ── HP 血条子组件 ── */

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const colorClass =
    pct > 60 ? 'bg-emerald-500' :
    pct > 30 ? 'bg-primary' :
    'bg-red-500';

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-text-muted tabular-nums w-14 text-right">
        {hp}/{maxHp}
      </span>
    </div>
  );
}

/* ── 实体卡片 ── */

function EntityCard({ entity }: { entity: RpgEntity }) {
  const [expanded, setExpanded] = useState(false);
  const hpPct = (entity.hp / entity.max_hp) * 100;
  const statusColor =
    hpPct > 60 ? 'text-emerald-400' :
    hpPct > 30 ? 'text-primary' :
    'text-red-400';

  return (
    <div className="bg-surface-elevated rounded-lg border border-border-default overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-elevated/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${statusColor} flex-shrink-0`} />
        <span className="text-sm text-text-primary font-medium flex-1 truncate">
          {entity.name}
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-text-muted" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
        )}
      </button>
      <div className="px-3 pb-2">
        <HpBar hp={entity.hp} maxHp={entity.max_hp} />
      </div>
      {expanded && (
        <div className="px-3 pb-2.5 space-y-1 border-t border-border-default pt-2">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Heart className="w-3 h-3 text-red-400" />
            <span>生命值</span>
            <span className="text-text-primary ml-auto">{entity.hp} / {entity.max_hp}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 主面板 ── */

interface RpgPanelProps {
  roomState: RpgRoomState;
  onClose: () => void;
  /** 玩家自己的 agent_id，用于在列表中标记 */
  playerId?: string;
}

function RpgPanel({ roomState, onClose, playerId }: RpgPanelProps) {
  if (!roomState.roomId) return null;

  // 玩家排最前，其余按名字排
  const sorted = [...roomState.entities].sort((a, b) => {
    if (a.id === playerId) return -1;
    if (b.id === playerId) return 1;
    return a.name.localeCompare(b.name);
  });

  return createPortal(
    <div className="fixed right-4 top-14 z-40 w-64 pointer-events-auto">
      {/* 面板主体 */}
      <div className="bg-surface-elevated border border-border-default rounded-xl shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-default">
          <div className="flex items-center gap-2 min-w-0">
            <Swords className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <h3 className="text-sm font-medium text-text-primary truncate">
              {roomState.roomName || '当前房间'}
            </h3>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[11px] text-text-muted">
              {roomState.entities.length} 人
            </span>
            <button
              onClick={onClose}
              className="ml-1 w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-secondary hover:bg-surface-elevated transition-colors text-sm"
            >
              ×
            </button>
          </div>
        </div>

        {/* 实体列表 */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
          {sorted.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">房间内暂无实体</p>
          ) : (
            sorted.map(entity => (
              <EntityCard
                key={entity.id}
                entity={entity}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.getElementById('overlay-root')!,
  );
}

export default RpgPanel;
