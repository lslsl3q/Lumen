/**
 * 知识库管理页面
 *
 * 职责：文件列表 + 上传/创建 + 语义搜索 + 删除
 * 数据流：useKnowledge hook → API → 后端
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKnowledge } from '../hooks/useKnowledge';
import { searchKnowledge } from '../api/knowledge';
import type { KnowledgeSearchResult } from '../types/knowledge';

function KnowledgeList() {
  const navigate = useNavigate();
  const { files, isLoading, upload, create, remove } = useKnowledge();

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // 创建对话框状态
  const [showCreate, setShowCreate] = useState(false);
  const [createFilename, setCreateFilename] = useState('');
  const [createContent, setCreateContent] = useState('');
  const [creating, setCreating] = useState(false);

  const handleUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.markdown';
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files) return;
      for (const file of Array.from(input.files)) {
        try {
          await upload(file);
        } catch (err) {
          alert(`${file.name}: ${err instanceof Error ? err.message : '上传失败'}`);
        }
      }
    };
    input.click();
  };

  const handleCreate = async () => {
    if (!createFilename.trim() || !createContent.trim()) return;
    setCreating(true);
    try {
      await create(createFilename.trim(), createContent);
      setShowCreate(false);
      setCreateFilename('');
      setCreateContent('');
    } catch (err) {
      alert(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (fileId: string, filename: string) => {
    if (!confirm(`确定删除「${filename}」吗？向量数据也会一并删除。`)) return;
    try {
      await remove(fileId);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchKnowledge(searchQuery.trim());
      setSearchResults(res.results);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '搜索失败');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const formatSize = (chars: number) => {
    if (chars < 1000) return `${chars} 字`;
    return `${(chars / 1000).toFixed(1)}k 字`;
  };

  const formatScore = (score: number) => `${(score * 100).toFixed(0)}%`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* 顶栏 */}
      <div className="flex items-center justify-between mb-6 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            &larr; 返回聊天
          </button>
          <h1 className="text-xl font-light tracking-wide">知识库</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleUpload}
            className="px-4 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-slate-400 hover:bg-slate-800/60 transition-all"
          >
            上传文件
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all"
          >
            + 新建
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 space-y-6">
        {/* 搜索区 */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/40">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="语义搜索知识库..."
              className="flex-1 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors text-sm"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-sm disabled:opacity-50"
            >
              {searching ? '搜索中...' : '搜索'}
            </button>
          </div>

          {/* 搜索结果 */}
          {searchError && (
            <p className="mt-3 text-sm text-red-400">{searchError}</p>
          )}
          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2 max-h-80 overflow-y-auto scrollbar-lumen">
              {searchResults.map((r) => (
                <div
                  key={`${r.file_id}-${r.chunk_index}`}
                  className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/30"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">{r.filename}</span>
                    <span className="text-xs text-amber-400">{formatScore(r.score)}</span>
                  </div>
                  <p className="text-sm text-slate-300 line-clamp-3">{r.content}</p>
                </div>
              ))}
            </div>
          )}
          {searchResults.length === 0 && searchQuery && !searching && !searchError && (
            <p className="mt-3 text-sm text-slate-500">无匹配结果，试试其他关键词</p>
          )}
        </div>

        {/* 文件列表 */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-600">加载中...</div>
        ) : files.length === 0 ? (
          <div className="text-center py-16 text-slate-600">
            <p className="mb-4">知识库为空</p>
            <button onClick={handleUpload} className="text-amber-400 hover:underline">
              上传第一个文件
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((file) => (
              <div
                key={file.id}
                className="group relative p-4 rounded-xl bg-slate-900/60 border border-slate-800/40 hover:border-amber-500/30 hover:bg-slate-900/80 transition-all"
              >
                {/* 删除按钮 */}
                <button
                  onClick={() => handleDelete(file.id, file.filename)}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
                >
                  &times;
                </button>

                {/* 文件信息 */}
                <div className="flex items-center gap-2 mb-2 pr-6">
                  <span className="text-sm text-amber-400">
                    {file.file_type === 'md' ? 'Md' : 'Txt'}
                  </span>
                  <h3 className="text-base text-slate-200 truncate">{file.filename}</h3>
                </div>
                <p className="text-xs text-slate-500 mb-1">
                  {file.source_path}
                </p>
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span>{formatSize(file.char_count)}</span>
                  <span>{file.chunk_count} 片段</span>
                  <span className="text-slate-500">{file.category}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建对话框 */}
      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg p-6 rounded-xl bg-slate-900 border border-slate-700/60 shadow-2xl">
            <h2 className="text-lg font-medium mb-4">新建知识库条目</h2>

            <div className="space-y-3">
              <input
                type="text"
                value={createFilename}
                onChange={(e) => setCreateFilename(e.target.value)}
                placeholder="文件名（如 世界观.md）"
                className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 text-sm"
              />
              <textarea
                value={createContent}
                onChange={(e) => setCreateContent(e.target.value)}
                placeholder="内容..."
                rows={10}
                className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 text-sm resize-y"
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowCreate(false); setCreateFilename(''); setCreateContent(''); }}
                className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 transition-colors text-sm"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createFilename.trim() || !createContent.trim()}
                className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all text-sm disabled:opacity-50"
              >
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default KnowledgeList;
