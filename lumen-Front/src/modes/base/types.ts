// src/modes/base/types.ts

export type ChannelType = 'chat' | 'rpg' | 'board' | 'manage';
export type ChannelGroup = 'base' | 'adventure' | 'free' | 'manage';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  locationId: string | null;
  description?: string;
  order: number;
  group: ChannelGroup;
}

export type MessageType = 'system' | 'character' | 'user';

export interface ChannelMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
  characterId?: string;
  characterName?: string;
  characterColor?: string;
}

export interface Member {
  id: string;
  name: string;
  color: string;
  online: boolean;
  avatar?: string;
}

export const CHANNEL_TYPE_ICONS: Record<ChannelType, string> = {
  chat: '💬',
  rpg: '⚔',
  board: '📋',
  manage: '🔧',
};
