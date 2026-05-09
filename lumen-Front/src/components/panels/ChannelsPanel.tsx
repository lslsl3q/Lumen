/**
 * ChannelsPanel — 频道列表面板（SidePanel 内容）
 *
 * 从 ChannelSidebar 提取，作为 SidePanel 的频道面板使用。
 * 使用 useBaseStore 获取频道数据。
 */
import { useState } from 'react';
import { Plus, Settings, Hash, Trash2 } from 'lucide-react';
import { useBaseStore } from '../../stores/useBaseStore';
import { useModeStore } from '../../stores/useModeStore';
import { CHANNEL_TYPE_ICONS } from '../../modes/base/types';
import type { Channel } from '../../modes/base/types';
import CreateChannelModal from '../../modes/base/CreateChannelModal';

function ChannelsPanel() {
  const { channels, activeChannelId, setActiveChannel, deleteChannel } = useBaseStore();
  const switchMode = useModeStore(s => s.switchMode);
  const [showCreate, setShowCreate] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const groups = channels.reduce<Record<string, Channel[]>>((acc, ch) => {
    (acc[ch.group] ||= []).push(ch);
    return acc;
  }, {});

  const GROUP_LABELS: Record<string, string> = {
    base: '频道',
    adventure: '冒险',
    free: '自由',
    manage: '管理',
  };

  const handleContextMenu = (e: React.MouseEvent, channelId: string) => {
    e.preventDefault();
    setContextMenu({ id: channelId, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  return (
    <div className="h-full flex flex-col" onClick={closeContextMenu}>
      {/* 顶部工具栏 */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#1a1a19]">
        <span className="text-xs font-medium text-[#888] tracking-wide">频道</span>
        <div className="flex gap-1">
          <button
            onClick={() => setShowCreate(true)}
            className="w-6 h-6 flex items-center justify-center rounded
              text-[#666] hover:text-[#CC7C5E] hover:bg-[#CC7C5E15] transition-colors cursor-pointer"
            title="创建频道"
          >
            <Plus size={14} />
          </button>
          <button
            className="w-6 h-6 flex items-center justify-center rounded
              text-[#666] hover:text-[#888] hover:bg-[#ffffff08] transition-colors cursor-pointer"
            title="设置"
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* 频道列表 */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-4">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <div className="px-2 mb-1">
              <span className="text-[9px] font-semibold text-[#555] uppercase tracking-widest">
                {GROUP_LABELS[group] || group}
              </span>
            </div>
            {items.map((channel) => (
              <div
                key={channel.id}
                onClick={() => {
                  setActiveChannel(channel.id);
                  if (channel.type === 'rpg') {
                    switchMode('rpg');
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, channel.id)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer
                  transition-colors duration-150 group
                  ${activeChannelId === channel.id
                    ? 'bg-[#CC7C5E18] text-[#CC7C5E]'
                    : 'text-[#888] hover:bg-[#ffffff06] hover:text-[#bbb]'
                  }`}
              >
                <span className="text-xs w-4 text-center flex-shrink-0">
                  {activeChannelId === channel.id ? (
                    <Hash size={12} />
                  ) : (
                    CHANNEL_TYPE_ICONS[channel.type]
                  )}
                </span>
                <span className="text-sm truncate">{channel.name}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} />
          <div
            className="fixed z-50 bg-[#1a1a19] border border-[#2a2a28] rounded-lg
              shadow-[0_4px_16px_rgba(0,0,0,0.4)] py-1 min-w-[120px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                deleteChannel(contextMenu.id);
                closeContextMenu();
              }}
              disabled={channels.length <= 1}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors
                ${channels.length <= 1
                  ? 'text-[#555] cursor-not-allowed'
                  : 'text-[#888] hover:bg-[#ffffff08] hover:text-[#ef4444] cursor-pointer'
                }`}
            >
              <Trash2 size={12} />
              <span>删除频道</span>
            </button>
          </div>
        </>
      )}

      {showCreate && <CreateChannelModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

export default ChannelsPanel;
