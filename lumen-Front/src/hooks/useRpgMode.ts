/**
 * RPG 模式状态管理 Hook
 *
 * 轻量级封装：useChat(rpgMode=true) + useRPG + 进入/退出逻辑。
 * 不复制 useChatMode 的全量逻辑，只管 RPG 特有的部分。
 */
import { useState, useCallback, useEffect } from 'react';
import { useChat } from './useChat';
import { useRPG } from './useRPG';
import { type StreamEvent } from '../api/chat';

export function useRpgMode() {
  const chat = useChat();
  const rpg = useRPG();
  const [round, setRound] = useState(0);

  // 挂载时启用 RPG 模式（useEffect 避免渲染期 setState）
  useEffect(() => {
    if (!chat.rpgMode) {
      chat.setRpgMode(true);
    }
  }, []);

  /** 发送玩家行动 */
  const sendAction = useCallback(async (action: string) => {
    if (!action.trim()) return;

    // 直接调用 useChat.sendMessage，它内部会自动创建会话
    // 不在外面重复创建，避免 stale closure 竞态
    try {
      await chat.sendMessage(action, false, (event: StreamEvent) => {
        if (event.type === 'rpg_state') {
          rpg.handleEvent(event);
        }
      });
      setRound(prev => prev + 1);
    } catch (err) {
      console.error('[RPG] 发送行动失败:', err);
    }
  }, [chat, rpg]);

  /** 中断生成 */
  const abort = useCallback(async () => {
    await chat.abort();
  }, [chat]);

  /** 退出 RPG — 清理状态 */
  const exitRpg = useCallback(() => {
    chat.setRpgMode(false);
    rpg.resetRpgState();
  }, [chat, rpg]);

  return {
    chat,
    rpg,
    round,
    sendAction,
    abort,
    exitRpg,
  };
}
