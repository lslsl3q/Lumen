/**
 * Debug 监控相关类型
 */

/** 单层提示词 token 信息 */
export interface MemoryDebugLayer {
  name: string;
  tokens: number;
  content: string;
}

/** 完整记忆调试数据 */
export interface MemoryDebugInfo {
  layers: MemoryDebugLayer[];
  totalTokens: number;
  contextSize: number;
}
