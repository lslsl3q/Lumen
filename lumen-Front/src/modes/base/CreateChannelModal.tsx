// src/modes/base/CreateChannelModal.tsx
import { useState } from 'react';
import { X } from 'lucide-react';
import { useBaseStore } from '../../stores/useBaseStore';
import type { ChannelType } from './types';

interface Props {
  onClose: () => void;
}

const CHANNEL_TYPES: { value: ChannelType; label: string; desc: string }[] = [
  { value: 'chat', label: '聊天频道', desc: '实时消息流' },
  { value: 'rpg', label: '冒险频道', desc: '跑团/副本' },
  { value: 'board', label: '公告板', desc: '非实时帖子' },
  { value: 'manage', label: '管理频道', desc: '审批/设置' },
];

function CreateChannelModal({ onClose }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('chat');
  const [description, setDescription] = useState('');
  const createChannel = useBaseStore((s) => s.createChannel);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createChannel(name.trim(), type, description.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[#1a1a19] border border-[#2a2a28] rounded-xl w-80 p-5
          shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-[#ccc]">创建频道</h3>
          <button onClick={onClose} className="text-[#666] hover:text-[#999] cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] text-[#888] uppercase tracking-wider mb-1">频道名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="新频道"
              autoFocus
              className="w-full bg-[#141413] border border-[#2a2a28] rounded-md px-3 py-2
                text-sm text-[#ccc] placeholder-[#555] outline-none
                focus:border-[#CC7C5E55] transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] text-[#888] uppercase tracking-wider mb-1">频道类型</label>
            <div className="grid grid-cols-2 gap-2">
              {CHANNEL_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  type="button"
                  onClick={() => setType(ct.value)}
                  className={`px-3 py-2 rounded-md border text-left transition-colors cursor-pointer
                    ${type === ct.value
                      ? 'border-[#CC7C5E55] bg-[#CC7C5E15] text-[#CC7C5E]'
                      : 'border-[#2a2a28] text-[#888] hover:border-[#3a3a38]'
                    }`}
                >
                  <div className="text-xs font-medium">{ct.label}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">{ct.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-[#888] uppercase tracking-wider mb-1">描述（选填）</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="频道用途..."
              className="w-full bg-[#141413] border border-[#2a2a28] rounded-md px-3 py-2
                text-sm text-[#ccc] placeholder-[#555] outline-none
                focus:border-[#CC7C5E55] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-2 rounded-md text-sm font-medium transition-colors cursor-pointer
              bg-[#CC7C5E] text-white hover:bg-[#b86a4f]
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            创建
          </button>
        </form>
      </div>
    </div>
  );
}

export default CreateChannelModal;
