// src/stores/useBaseStore.ts
import { create } from 'zustand';
import type { Channel, ChannelMessage, ChannelGroup } from '../modes/base/types';
import { DEFAULT_CHANNELS, MOCK_MESSAGES, MOCK_MEMBERS } from '../modes/base/mockData';

interface BaseState {
  channels: Channel[];
  activeChannelId: string;
  messages: Record<string, ChannelMessage[]>;
  members: Record<string, import('../modes/base/types').Member[]>;

  setActiveChannel: (id: string) => void;
  createChannel: (name: string, type: Channel['type'], description?: string) => void;
  deleteChannel: (id: string) => void;
  sendMessage: (channelId: string, content: string) => void;
}

export const useBaseStore = create<BaseState>((set, get) => ({
  channels: DEFAULT_CHANNELS,
  activeChannelId: DEFAULT_CHANNELS[0].id,
  messages: MOCK_MESSAGES,
  members: MOCK_MEMBERS,

  setActiveChannel: (id) => {
    set({ activeChannelId: id });
  },

  createChannel: (name, type, description) => {
    const channels = get().channels;
    const id = `ch-${Date.now()}`;
    const group: ChannelGroup = type === 'rpg' ? 'adventure' : type === 'manage' ? 'manage' : type === 'board' ? 'free' : 'base';
    const newChannel: Channel = {
      id,
      name,
      type,
      locationId: group === 'base' ? `loc-${id}` : null,
      description,
      order: channels.length + 1,
      group,
    };
    const mockCurrentUser: import('../modes/base/types').Member = {
      id: 'user_self',
      name: '我',
      color: '#CC7C5E',
      online: true,
    };
    set({
      channels: [...channels, newChannel],
      messages: { ...get().messages, [id]: [] },
      members: { ...get().members, [id]: [mockCurrentUser] },
      activeChannelId: id,
    });
  },

  deleteChannel: (id) => {
    const { channels, activeChannelId, messages, members } = get();
    if (channels.length <= 1) return;
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
