/**
 * 推送通知状态管理 Hook
 *
 * 职责：管理 WebSocket 连接生命周期、收集推送通知、管理通知栈
 * 数据流：hook → api/ws.ts（不直接操作 DOM 或 WebSocket）
 */

import { useState, useEffect, useCallback } from 'react';
import { getPushClient } from '../api/ws';
import { PushEvent, AIMessageEvent, NotificationEvent } from '../types/push';

/** 推送通知条目 */
export interface PushNotification {
  id: string;
  type: 'ai_message' | 'notification' | 'system';
  title: string;
  body: string;
  level: 'info' | 'warning' | 'success' | 'error';
  timestamp: string;
  data?: unknown;
}

export function usePush() {
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  // 连接 WebSocket 并注册事件处理器
  useEffect(() => {
    const client = getPushClient();

    // 心跳 → 标记已连接
    const unsubHeartbeat = client.on('heartbeat', () => {
      setConnectionStatus('connected');
    });

    // AI 主动消息 → 通知 + 标记已连接
    const unsubAI = client.on<AIMessageEvent>('ai_message', (event) => {
      setConnectionStatus('connected');
      addNotification({
        type: 'ai_message',
        title: 'AI 消息',
        body: event.content.slice(0, 100),
        level: 'info',
        timestamp: event.timestamp,
        data: event,
      });
    });

    // 任务通知
    const unsubNotif = client.on<NotificationEvent>('notification', (event) => {
      addNotification({
        type: 'notification',
        title: event.title,
        body: event.body,
        level: event.level,
        timestamp: event.timestamp,
        data: event.data,
      });
    });

    // 启动连接
    setConnectionStatus('connecting');
    client.connect();

    return () => {
      unsubHeartbeat();
      unsubAI();
      unsubNotif();
      client.disconnect();
      setConnectionStatus('disconnected');
    };
  }, []);

  /** 添加通知（5 秒后自动消失） */
  const addNotification = useCallback((n: Omit<PushNotification, 'id'>) => {
    const notification: PushNotification = {
      ...n,
      id: `push_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
    setNotifications(prev => [...prev, notification]);

    // 5 秒后自动移除
    setTimeout(() => {
      setNotifications(prev => prev.filter(item => item.id !== notification.id));
    }, 5000);
  }, []);

  /** 手动关闭通知 */
  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return {
    notifications,
    connectionStatus,
    dismissNotification,
  };
}
