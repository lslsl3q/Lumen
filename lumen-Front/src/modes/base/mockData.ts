// src/modes/base/mockData.ts
import type { Channel, ChannelMessage, Member } from './types';

export const DEFAULT_CHANNELS: Channel[] = [
  { id: 'ch-hall', name: '大厅', type: 'chat', locationId: 'loc-hall', description: '公共休息区', order: 1, group: 'base' },
  { id: 'ch-tavern', name: '酒馆', type: 'chat', locationId: 'loc-tavern', description: '饮品与闲谈', order: 2, group: 'base' },
  { id: 'ch-training', name: '训练场', type: 'chat', locationId: 'loc-training', description: '切磋武艺', order: 3, group: 'base' },
  { id: 'ch-library', name: '图书馆', type: 'chat', locationId: 'loc-library', description: '静谧的阅读空间', order: 4, group: 'base' },
];

export const MOCK_MESSAGES: Record<string, ChannelMessage[]> = {
  'ch-hall': [
    { id: 'm1', type: 'system', content: '艾琳 从训练场来到大厅', timestamp: Date.now() - 120000 },
    { id: 'm2', type: 'character', characterId: 'eileen', characterName: '艾琳', characterColor: '#f0a050', content: '今天训练好累…先歇会儿', timestamp: Date.now() - 110000 },
    { id: 'm3', type: 'character', characterId: 'chen', characterName: '老陈', characterColor: '#60a5fa', content: '来杯蜂蜜水？刚从集市带了些回来', timestamp: Date.now() - 100000 },
    { id: 'm4', type: 'character', characterId: 'eileen', characterName: '艾琳', characterColor: '#f0a050', content: '好呀！等我一下，先去图书馆还书', timestamp: Date.now() - 90000 },
    { id: 'm5', type: 'character', characterId: 'ming', characterName: '小明', characterColor: '#a78bfa', content: '什么书？我正想找点东西看', timestamp: Date.now() - 80000 },
  ],
  'ch-tavern': [
    { id: 'm6', type: 'system', content: '老陈 在柜台后面擦拭着酒杯', timestamp: Date.now() - 60000 },
    { id: 'm7', type: 'character', characterId: 'chen', characterName: '老陈', characterColor: '#60a5fa', content: '今天新到了一批蜂蜜酒，谁来尝尝？', timestamp: Date.now() - 50000 },
  ],
  'ch-training': [
    { id: 'm8', type: 'system', content: '训练场里回荡着木剑交击的声音', timestamp: Date.now() - 180000 },
    { id: 'm9', type: 'character', characterId: 'eileen', characterName: '艾琳', characterColor: '#f0a050', content: '再来一组！这次一定能突破', timestamp: Date.now() - 170000 },
  ],
  'ch-library': [
    { id: 'm10', type: 'system', content: '图书馆里安静得只能听到翻书声', timestamp: Date.now() - 300000 },
  ],
};

export const MOCK_MEMBERS: Record<string, Member[]> = {
  'ch-hall': [
    { id: 'eileen', name: '艾琳', color: '#f0a050', online: true },
    { id: 'chen', name: '老陈', color: '#60a5fa', online: true },
    { id: 'ming', name: '小明', color: '#a78bfa', online: true },
    { id: 'lili', name: '莉莉', color: '#f472b6', online: false },
  ],
  'ch-tavern': [
    { id: 'chen', name: '老陈', color: '#60a5fa', online: true },
  ],
  'ch-training': [],
  'ch-library': [
    { id: 'ming', name: '小明', color: '#a78bfa', online: true },
  ],
};
