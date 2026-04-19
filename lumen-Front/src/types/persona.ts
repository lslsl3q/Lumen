/** Persona 列表项 */
export interface PersonaListItem {
  id: string;
  name: string;
}

/** Persona 详情 */
export interface PersonaCard {
  name: string;
  description: string;
  traits: string[];
  avatar?: string;
}

/** 创建请求 */
export interface PersonaCreatePayload {
  id: string;
  name: string;
  description?: string;
  traits?: string[];
}

/** 更新请求（所有字段可选） */
export interface PersonaUpdatePayload {
  name?: string;
  description?: string;
  traits?: string[];
  avatar?: string;
}

/** 切换请求 */
export interface PersonaSwitchPayload {
  persona_id: string | null;
}

/** 激活状态响应 */
export interface ActivePersonaResponse {
  persona_id: string | null;
  persona: PersonaCard | null;
}
