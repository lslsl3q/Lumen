/**
 * WebSocket 推送事件类型
 * 镜像后端 lumen/types/ws_events.py
 */

export interface AIMessageEvent {
  type: 'ai_message';
  session_id: string;
  content: string;
  character_id: string;
  timestamp: string;
}

export interface HeartbeatEvent {
  type: 'heartbeat';
  timestamp: string;
}

export interface NotificationEvent {
  type: 'notification';
  title: string;
  body: string;
  level: 'info' | 'warning' | 'success' | 'error';
  timestamp: string;
  data?: unknown;
}

export interface SystemEvent {
  type: 'system';
  status: string;
  message: string;
  timestamp: string;
}

export type PushEvent = AIMessageEvent | HeartbeatEvent | NotificationEvent | SystemEvent;
