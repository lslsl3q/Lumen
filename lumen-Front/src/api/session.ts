/**
 * 会话管理 API 客户端
 *
 * 对接后端 /sessions/* 和 /chat/history 端点
 * 纯 HTTP 请求，不含状态逻辑
 */
import { SessionListItem } from '../types/session';

const API_BASE_URL = 'http://127.0.0.1:8888';

/** POST /sessions/new — 创建新会话 */
export async function createSession(characterId = 'default'): Promise<{
  session_id: string;
  character_id: string;
  message: string;
}> {
  const res = await fetch(`${API_BASE_URL}/sessions/new?character_id=${encodeURIComponent(characterId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`创建会话失败: ${res.status}`);
  return res.json();
}

/** POST /sessions/load — 加载已有会话 */
export async function loadSession(sessionId: string): Promise<{
  message: string;
  session_id: string;
  character_id: string;
}> {
  const res = await fetch(`${API_BASE_URL}/sessions/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`加载会话失败: ${res.status}`);
  return res.json();
}

/** GET /sessions/list — 获取会话列表 */
export async function listSessions(
  limit = 20,
  characterId?: string  // 新增：可选的角色ID过滤参数
): Promise<SessionListItem[]> {
  const url = characterId 
    ? `${API_BASE_URL}/sessions/list?limit=${limit}&character_id=${encodeURIComponent(characterId)}`
    : `${API_BASE_URL}/sessions/list?limit=${limit}`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`获取会话列表失败: ${res.status}`);
  return res.json();
}

/** DELETE /sessions/{session_id} — 删除会话 */
export async function deleteSession(sessionId: string): Promise<{
  message: string;
}> {
  const res = await fetch(`${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`删除会话失败: ${res.status}`);
  return res.json();
}

/** POST /sessions/reset — 重置会话 */
export async function resetSession(sessionId = 'default'): Promise<{
  message: string;
  session_id: string;
  character_id: string;
}> {
  const res = await fetch(`${API_BASE_URL}/sessions/reset?session_id=${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`重置会话失败: ${res.status}`);
  return res.json();
}
