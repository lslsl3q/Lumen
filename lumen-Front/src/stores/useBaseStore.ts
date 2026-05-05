// src/stores/useBaseStore.ts
import { create } from 'zustand';
import type { Channel, ChannelMessage, ChannelGroup } from '../modes/base/types';
import { listChannels, createChannel as createChannelAPI, deleteChannel as deleteChannelAPI } from '../api/channel';

interface BaseState {
  channels: Channel[];
  activeChannelId: string;
  messages: Record<string, ChannelMessage[]>;
  members: Record<string, import('../modes/base/types').Member[]>;
  isLoaded: boolean;

  initializeFromBackend: () => Promise<void>;
  setActiveChannel: (id: string) => void;
  createChannel: (name: string, type: Channel['type'], description?: string) => void;
  deleteChannel: (id: string) => void;
  sendMessage: (channelId: string, content: string) => void;
}

function apiChannelToChannel(api: { id: string; name: string; type: string; description: string; order: number; group: string }): Channel {
  const type = api.type as Channel['type'];
  const group = api.group as ChannelGroup;
  return {
    id: api.id,
    name: api.name,
    type,
    description: api.description,
    order: api.order,
    group,
    locationId: group === 'base' ? `loc-${api.id}` : null,
  };
}

export const useBaseStore = create<BaseState>((set, get) => ({
  channels: [],
  activeChannelId: '',
  messages: {},
  members: {},
  isLoaded: false,

  initializeFromBackend: async () => {
    if (get().isLoaded) return;
    try {
      const channels = await listChannels();
      const mapped: Channel[] = channels.map(apiChannelToChannel);
      const messages: Record<string, ChannelMessage[]> = {};
      const members: Record<string, import('../modes/base/types').Member[]> = {};
      for (const ch of mapped) {
        messages[ch.id] = [];
        members[ch.id] = [];
      }
      set({
        channels: mapped,
        activeChannelId: mapped.length > 0 ? mapped[0].id : '',
        messages,
        members,
        isLoaded: true,
      });
    } catch (err) {
      console.error('加载频道列表失败:', err);
    }
  },

  setActiveChannel: (id) => {
    set({ activeChannelId: id });
  },

  createChannel: async (name, type, description) => {
    const group: ChannelGroup = type === 'rpg' ? 'adventure' : type === 'manage' ? 'manage' : type === 'board' ? 'free' : 'base';
    try {
      const result = await createChannelAPI(name, type, description || '', group);
      const newChannel: Channel = {
        id: result.channel_id,
        name,
        type,
        description,
        order: get().channels.length + 1,
        group,
        locationId: group === 'base' ? `loc-${result.channel_id}` : null,
      };
      set({
        channels: [...get().channels, newChannel],
        messages: { ...get().messages, [result.channel_id]: [] },
        members: { ...get().members, [result.channel_id]: [] },
        activeChannelId: result.channel_id,
      });
    } catch (err) {
      console.error('创建频道失败:', err);
    }
  },

  deleteChannel: async (id) => {
    const { channels, activeChannelId, messages, members } = get();
    if (channels.length <= 1) return;
    try {
      await deleteChannelAPI(id);
      const remaining = channels.filter((c) => c.id !== id);
      const newMessages = { ...messages };
      delete newMessages[id];
      const newMembers = { ...members };
      delete newMembers[id];
      set({
        channels: remaining,
        activeChannelId: activeChannelId === id ? remaining[0].id : activeChannelId,
        messages: newMessages,
        members: newMembers,
      });
    } catch (err) {
      console.error('删除频道失败:', err);
    }
  },

  sendMessage: (channelId, content) => {
    const { messages } = get();
    const newMsg: ChannelMessage = {
      id: `m-${Date.now()}`,
      type: 'user',
      content,
      timestamp: Date.now(),
    };
    set({
      messages: {
        ...messages,
        [channelId]: [...(messages[channelId] || []), newMsg],
      },
    });
  },
}));
