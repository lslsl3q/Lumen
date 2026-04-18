/**
 * 模型管理 API 客户端
 *
 * 对接后端 /models/* 端点
 */

const API_BASE_URL = 'http://127.0.0.1:8888';

/** 单个模型信息 */
export interface ModelInfo {
  id: string;
  owned_by: string;
}

/** GET /models/list — 获取可用模型列表 */
export async function listModels(): Promise<{ models: ModelInfo[] }> {
  const res = await fetch(`${API_BASE_URL}/models/list`);
  if (!res.ok) {
    throw new Error(`获取模型列表失败: ${res.status}`);
  }
  return res.json();
}
