/**
 * WebSocket 连接管理 Hook（T26: 全面替代 SSE）
 *
 * 单例模式：整个 app 只有一个 WS 连接。
 * 负责：连接/重连/频道订阅/消息收发。
 */

import { useEffect, useCallback, useState } from 'react';
import type { StreamEvent } from '../api/chat';

const WS_URL = 'ws://127.0.0.1:8888/ws';

type MessageHandler = (event: StreamEvent) => void;

/** 模块级单例 */
let _ws: WebSocket | null = null;
let _handlers: Set<MessageHandler> = new Set();
let _reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _intentionalClose = false;
let _connectionId = 0;

/** 断线重连补拉用：记录最后收到的消息 ID */
let _lastMsgId = 0;

export function setLastMsgId(id: number) {
  if (id > _lastMsgId) _lastMsgId = id;
}

function notifyHandlers(event: StreamEvent) {
  // 更新 lastMsgId（msg_saved 事件携带 db_id）
  if (event.type === 'msg_saved' && event.db_id) {
    setLastMsgId(event.db_id);
  }
  _handlers.forEach((h) => h(event));
}

function connect() {
  if (_ws?.readyState === WebSocket.OPEN || _ws?.readyState === WebSocket.CONNECTING) return;
  _intentionalClose = false;

  try {
    _ws = new WebSocket(WS_URL);

    _ws.onopen = () => {
      _connectionId++;
      _reconnectDelay = 1000;
      console.log('[WS] 已连接');
    };

    _ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'heartbeat') return;
        notifyHandlers(data as StreamEvent);
      } catch {
        // 忽略格式错误
      }
    };

    _ws.onclose = () => {
      console.log('[WS] 断开');
      if (!_intentionalClose) scheduleReconnect();
    };

    _ws.onerror = () => {
      // onclose 会紧接着触发
    };
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (_reconnectTimer) return;
  console.log(`[WS] ${_reconnectDelay / 1000}s 后重连...`);
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    connect();
  }, _reconnectDelay);
  _reconnectDelay = Math.min(_reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

function disconnect() {
  _intentionalClose = true;
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  _ws?.close();
  _ws = null;
  _reconnectDelay = 1000;
}

function send(msg: Record<string, unknown>) {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  } else {
    console.warn('[WS] 未连接，消息发送失败');
  }
}

function subscribe(channelId: string) {
  send({ type: 'subscribe', channel_id: channelId });
}

function unsubscribe(channelId: string) {
  send({ type: 'unsubscribe', channel_id: channelId });
}

/**
 * WebSocket Hook —— 注册消息处理器并管理连接生命周期
 *
 * 用法：
 *   const { sendMessage, isConnected } = useWebSocket((event) => { ... });
 *   sendMessage({ type: 'chat', content: '你好' });
 */
export function useWebSocket(onMessage: MessageHandler) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // 注册处理器
    _handlers.add(onMessage);

    // 首次连接
    if (!_ws || _ws.readyState === WebSocket.CLOSED) {
      connect();
    } else if (_ws.readyState === WebSocket.OPEN) {
      setIsConnected(true);
    }

    // 监听连接状态
    const interval = setInterval(() => {
      const connected = _ws?.readyState === WebSocket.OPEN;
      setIsConnected(connected);
    }, 1000);

    return () => {
      _handlers.delete(onMessage);
      clearInterval(interval);
      // 不在此处断连 — 单例由 app 生命周期管理
    };
  }, []);

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    if (_ws?.readyState !== WebSocket.OPEN) {
      connect();
    }
    send(msg);
  }, []);

  const subscribeChannel = useCallback((channelId: string) => {
    subscribe(channelId);
  }, []);

  const unsubscribeChannel = useCallback((channelId: string) => {
    unsubscribe(channelId);
  }, []);

  return {
    sendMessage,
    isConnected,
    subscribeChannel,
    unsubscribeChannel,
    connectionId: _connectionId,
  };
}

/** 断线重连后调用：补拉频道消息 */
export async function pullMissedMessages(channelId: string): Promise<void> {
  if (!_lastMsgId) return;
  try {
    const url = `http://127.0.0.1:8888/channels/${channelId}/messages?since_id=${_lastMsgId}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const messages = await res.json();
    if (messages.length > 0) {
      console.log(`[WS] 补拉 ${messages.length} 条断线消息`);
      // 将补拉的消息作为 stream event 通知
      for (const msg of messages) {
        if (msg.db_id) setLastMsgId(msg.db_id);
      }
    }
  } catch (e) {
    console.warn('[WS] 补拉失败:', e);
  }
}

/** 模块级 disconnect（app 卸载时调用） */
export function disconnectWebSocket() {
  disconnect();
}
