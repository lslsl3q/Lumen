// src/modes/base/InfoPanel.tsx
import { Users } from 'lucide-react';
import { useBaseStore } from '../../stores/useBaseStore';

function InfoPanel() {
  const { members, activeChannelId } = useBaseStore();
  const channelMembers = members[activeChannelId] || [];
  const online = channelMembers.filter((m) => m.online);
  const offline = channelMembers.filter((m) => !m.online);

  return (
    <div className="w-48 flex flex-col bg-surface-deep border-l border-border-default">
      {/* 标题 */}
      <div className="h-10 flex items-center gap-2 px-3 border-b border-border-default">
        <Users size={13} className="text-text-dim" />
        <span className="text-[10px] font-semibold text-text-dim uppercase tracking-widest">
          在线 — {online.length}
        </span>
      </div>

      {/* 成员列表 */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {online.length === 0 && offline.length === 0 ? (
          <div className="flex items-center justify-center h-24">
            <p className="text-[10px] text-text-dim">暂无成员</p>
          </div>
        ) : (
          <>
            {online.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md
                  hover:bg-hover-surface cursor-pointer transition-colors"
              >
                <div className="relative">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium"
                    style={{ background: `${member.color}22`, color: member.color }}
                  >
                    {member.name[0]}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full
                    bg-emerald-400 border-2 border-surface-deep" />
                </div>
                <span className="text-xs text-text-muted">{member.name}</span>
              </div>
            ))}

            {offline.length > 0 && (
              <>
                <div className="px-2 mt-3 mb-1">
                  <span className="text-[9px] text-text-dim uppercase tracking-wider">离线 — {offline.length}</span>
                </div>
                {offline.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md opacity-40"
                  >
                    <div className="relative">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium"
                        style={{ background: `${member.color}22`, color: member.color }}
                      >
                        {member.name[0]}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full
                        bg-[#555] border-2 border-surface-deep" />
                    </div>
                    <span className="text-xs text-text-dim">{member.name}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default InfoPanel;