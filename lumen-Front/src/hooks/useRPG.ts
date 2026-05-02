/**
 * RPG 状态管理 Hook
 *
 * 从 SSE rpg_state 事件中提取房间状态，维护实体列表和血量。
 * 遵循单向依赖：hook ← api/chat.ts StreamEvent，不直接操作 DOM。
 */
import { useState, useCallback } from 'react';
import { StreamEvent } from '../api/chat';

/** 房间实体 */
export interface RpgEntity {
  id: string;
  name: string;
  hp: number;
  max_hp: number;
}

/** RPG 房间快照 */
export interface RpgRoomState {
  roomId: string;
  roomName: string;
  entities: RpgEntity[];
}

const INITIAL_STATE: RpgRoomState = {
  roomId: '',
  roomName: '',
  entities: [],
};

export function useRPG() {
  const [roomState, setRoomState] = useState<RpgRoomState>(INITIAL_STATE);

  /** 处理 SSE 事件（从 useChat onEvent 回调传入） */
  const handleEvent = useCallback((event: StreamEvent) => {
    if (event.type !== 'rpg_state') return;
    setRoomState({
      roomId: event.room_id || '',
      roomName: event.room_name || '',
      entities: (event.entities || []) as RpgEntity[],
    });
  }, []);

  /** 重置 RPG 状态（切换角色/会话时调用） */
  const resetRpgState = useCallback(() => {
    setRoomState(INITIAL_STATE);
  }, []);

  return {
    roomState,
    handleEvent,
    resetRpgState,
  };
}
