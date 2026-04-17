/**
 * WebSocket 推送客户端
 *
 * 连接后端 ws://127.0.0.1:8888/ws/push
 * 处理自动重连、心跳监控、事件分发。
 * 不替代 HTTP+SSE 聊天 — 只用于 AI 主动推送。
 *
 * 使用方式：
 *   const client = getPushClient();
 *   client.on('ai_message', (event) => { ... });
 *   client.connect();
 */

import { PushEvent } from '../types/push';

const WS_URL = 'ws://127.0.0.1:8888/ws/push';

type EventHandler<T extends PushEvent = PushEvent> = (event: T) => void;

class PushClient {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;          // 初始 1s
  private maxReconnectDelay = 30000;      // 最大 30s
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimeout = 90000;       // 3x 服务端心跳间隔（30s * 3）
  private isIntentionalClose = false;

  // 事件处理器
  private handlers: Map<string, EventHandler[]> = new Map();
  private genericHandlers: EventHandler[] = [];

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.isIntentionalClose = false;

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[WS] 推送通道已连接');
        this.reconnectDelay = 1000;  // 连接成功，重置退避
        this.startHeartbeatMonitor();
      };

      this.ws.onmessage = (event) => {
        this.resetHeartbeatMonitor();
        try {
          const data: PushEvent = JSON.parse(event.data);
          this.dispatch(data);
        } catch {
          // 忽略格式错误的消息
        }
      };

      this.ws.onclose = () => {
        console.log('[WS] 推送通道断开');
        this.stopHeartbeatMonitor();
        if (!this.isIntentionalClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // onclose 会紧接着触发，在那里处理重连
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.isIntentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeatMonitor();
    this.ws?.close();
    this.ws = null;
  }

  /** 注册特定事件类型的处理器，返回取消注册函数 */
  on<T extends PushEvent>(type: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler as EventHandler);
    return () => {
      const list = this.handlers.get(type);
      if (list) {
        const idx = list.indexOf(handler as EventHandler);
        if (idx !== -1) list.splice(idx, 1);
      }
    };
  }

  /** 注册全局事件处理器（所有事件），返回取消注册函数 */
  onAny(handler: EventHandler): () => void {
    this.genericHandlers.push(handler);
    return () => {
      const idx = this.genericHandlers.indexOf(handler);
      if (idx !== -1) this.genericHandlers.splice(idx, 1);
    };
  }

  private dispatch(event: PushEvent): void {
    // 类型特定处理器
    const handlers = this.handlers.get(event.type) || [];
    for (const h of handlers) h(event);
    // 全局处理器
    for (const h of this.genericHandlers) h(event);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    console.log(`[WS] ${this.reconnectDelay / 1000}秒后重连...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    // 指数退避
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  private startHeartbeatMonitor(): void {
    this.heartbeatTimer = setTimeout(() => {
      console.log('[WS] 心跳超时，重新连接...');
      this.ws?.close();
    }, this.heartbeatTimeout);
  }

  private resetHeartbeatMonitor(): void {
    this.stopHeartbeatMonitor();
    this.startHeartbeatMonitor();
  }

  private stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// ── 模块级单例 ──

let _instance: PushClient | null = null;

export function getPushClient(): PushClient {
  if (!_instance) {
    _instance = new PushClient();
  }
  return _instance;
}
