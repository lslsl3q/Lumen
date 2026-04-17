/**
 * 配置管理类型定义
 *
 * 对接后端 /config/* 端点的请求/响应结构
 */

/** 配置项列表中的单条（GET /config/list 返回） */
export interface ConfigItem {
  name: string;        // "env" | "tools" | "workspaces"
  description: string;
  type: 'env' | 'json' | 'text';
  editable: boolean;
}

/** 配置详情（GET /config/{resource} 返回） */
export interface ConfigDetail {
  name: string;
  type: string;
  content: string;                           // 原始文本
  parsed?: Record<string, unknown>;          // JSON 解析后（仅 json 类型）
}

/** 更新配置请求体（POST /config/{resource}） */
export interface ConfigUpdatePayload {
  content: string;
}
