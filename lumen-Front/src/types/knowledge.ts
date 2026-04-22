/**
 * 知识库类型定义
 */

export interface KnowledgeFile {
  id: string;
  source_path: string;
  filename: string;
  file_type: string;
  category: string;
  chunk_count: number;
  char_count: number;
  tags: string[];
  created_at: string;
  updated_at?: string;
}

export interface KnowledgeCreatePayload {
  filename: string;
  content: string;
  category?: string;
  subdir?: string;
}

export interface KnowledgeSearchResult {
  chunk_id: number;
  file_id: string;
  source_path: string;
  filename: string;
  content: string;
  score: number;
  chunk_index: number;
}

export interface KnowledgeSearchResponse {
  query: string;
  results: KnowledgeSearchResult[];
  total: number;
}
