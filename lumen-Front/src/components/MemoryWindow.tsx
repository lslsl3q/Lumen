/**
 * MemoryWindow — 日记/主动记忆管理浮窗
 *
 * 三栏布局：文件树（左）| Markdown 编辑器（中）| 实时预览（右）
 * 暖灰 Soft UI 质感，与 Lumen 主界面一致
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import MarkdownContent from './MarkdownContent';
import * as api from '../api/memories';
import type { MemoryFolder, MemoryItem } from '../api/memories';

/* ── 常量 ── */

const CATEGORY_LABELS: Record<string, string> = {
  preference: '偏好',
  fact: '事实',
  context: '上下文',
  decision: '决策',
};

const CATEGORY_COLORS: Record<string, string> = {
  preference: 'text-amber-400',
  fact: 'text-sky-400',
  context: 'text-slate-400',
  decision: 'text-emerald-400',
};

/* ── 子组件 ── */

/** 文件夹树节点 */
function FolderTree({
  folders,
  selectedPath,
  onSelect,
  onDeleteFolder,
  onOpenInExplorer,
}: {
  folders: MemoryFolder[];
  selectedPath: string | null;
  onSelect: (folderPath: string, fileName: string) => void;
  onDeleteFolder: (name: string) => void;
  onOpenInExplorer: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(folders.map(f => [f.path, true])),
  );
  const [ctxMenu, setCtxMenu] = useState<{ name: string; x: number; y: number } | null>(null);

  // 点击外部关闭右键菜单
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [ctxMenu]);

  return (
    <div className="py-1">
      {folders.map(folder => (
        <div key={folder.path}>
          {/* 文件夹头 */}
          <button
            onClick={() => setExpanded(prev => ({ ...prev, [folder.path]: !prev[folder.path] }))}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu({ name: folder.name, x: e.clientX, y: e.clientY });
            }}
            className="w-full flex items-center gap-1.5 px-3 py-1 cursor-pointer group"
          >
            <svg
              className={`w-3 h-3 text-slate-600 transition-transform duration-150 ${
                expanded[folder.path] ? 'rotate-90' : ''
              }`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <svg className="w-3.5 h-3.5 text-amber-700/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
              {folder.name}
            </span>
            <span className="text-[10px] text-slate-700 ml-auto">{folder.files.length}</span>
          </button>

          {/* 文件列表 */}
          {expanded[folder.path] && folder.files.map(file => {
            const filePath = `${folder.path}/${file.name}`;
            const isActive = selectedPath === filePath;
            return (
              <button
                key={file.name}
                onClick={() => onSelect(folder.path, file.name)}
                className={`w-full flex items-center gap-1.5 pl-8 pr-3 py-1 cursor-pointer transition-colors duration-100
                  ${isActive
                    ? 'bg-[#CC7C5E]/08 text-slate-200'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                  }`}
              >
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span className="text-xs truncate">{file.name.replace(/\.md$/, '')}</span>
              </button>
            );
          })}
        </div>
      ))}

      {/* 右键菜单 */}
      {ctxMenu && (
        <div
          className="fixed z-[200] bg-[#1f1f1c] border border-[#2a2926] rounded-lg shadow-xl
            py-1 min-w-[140px] overflow-hidden"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button
            onClick={() => { onOpenInExplorer(ctxMenu.name); setCtxMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-400
              hover:text-slate-200 hover:bg-slate-700/40 cursor-pointer transition-colors"
          >
            在资源管理器中打开
          </button>
          {folders.find(f => f.name === ctxMenu.name)?.files.length === 0 && (
            <button
              onClick={() => { onDeleteFolder(ctxMenu.name); setCtxMenu(null); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400
                hover:text-red-400 hover:bg-red-400/08 cursor-pointer transition-colors"
            >
              删除空文件夹
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 搜索结果卡片 */
function SearchResult({
  item,
  onDelete,
}: {
  item: MemoryItem;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="group flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-slate-800/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] uppercase tracking-wider ${CATEGORY_COLORS[item.category] || 'text-slate-500'}`}>
            {CATEGORY_LABELS[item.category] || item.category}
          </span>
          {item.importance >= 4 && (
            <span className="text-[10px] text-amber-500">!</span>
          )}
          {item.tags.length > 0 && (
            <span className="text-[10px] text-slate-600">
              {item.tags.slice(0, 3).join(', ')}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
          {item.content}
        </p>
        <p className="text-[10px] text-slate-700 mt-1">
          {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : ''}
        </p>
      </div>
      <button
        onClick={() => onDelete(item.memory_id)}
        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0
          text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100
          transition-all duration-150 cursor-pointer"
        title="删除"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </div>
  );
}

/* ── 主组件 ── */

interface MemoryWindowProps {
  open: boolean;
  onClose: () => void;
}

function MemoryWindow({ open, onClose }: MemoryWindowProps) {
  /* ── 状态 ── */
  const [folders, setFolders] = useState<MemoryFolder[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tab, setTab] = useState<'files' | 'memories'>('files');
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── 加载文件树 ── */
  const loadFiles = useCallback(async () => {
    try {
      const data = await api.listMemoryFiles();
      setFolders(data.folders);
    } catch (err) {
      console.error('加载文件列表失败:', err);
    }
  }, []);

  useEffect(() => {
    if (open) loadFiles();
  }, [open, loadFiles]);

  /* ── 选中文件 → 加载内容 ── */
  const handleSelectFile = useCallback(async (folderPath: string, fileName: string) => {
    const path = `${folderPath}/${fileName}`;
    setSelectedPath(path);
    setShowSearch(false);
    try {
      const data = await api.readMemoryFile(path);
      setEditContent(data.content);
      setSavedContent(data.content);
    } catch (err) {
      console.error('读取文件失败:', err);
    }
  }, []);

  /* ── 保存文件 ── */
  const handleSave = useCallback(async () => {
    if (!selectedPath) return;
    try {
      await api.saveMemoryFile(selectedPath, editContent);
      setSavedContent(editContent);
    } catch (err) {
      console.error('保存失败:', err);
    }
  }, [selectedPath, editContent]);

  /* ── Ctrl+S ── */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, handleSave]);

  /* ── 搜索 ── */
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setShowSearch(true);
    try {
      const data = await api.searchMemories(searchQuery);
      setSearchResults(data.results);
    } catch (err) {
      console.error('搜索失败:', err);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  /* ── 删除记忆 ── */
  const handleDelete = useCallback((memoryId: string) => {
    setConfirmDialog({
      message: '确定删除这条日记？',
      onConfirm: async () => {
        try {
          await api.deleteMemory(memoryId);
          setSearchResults(prev => prev.filter(m => m.memory_id !== memoryId));
          loadFiles();
        } catch (err) {
          console.error('删除失败:', err);
        }
      },
    });
  }, [loadFiles]);

  /* ── 删除文件 ── */
  const handleDeleteFile = useCallback(() => {
    if (!selectedPath) return;
    setConfirmDialog({
      message: '确定删除这个文件？',
      onConfirm: async () => {
        try {
          const match = selectedPath.match(/(dn[a-z0-9]+)/);
          if (match) {
            await api.deleteMemory(match[1]);
          }
          setSelectedPath(null);
          setEditContent('');
          setSavedContent('');
          loadFiles();
        } catch (err) {
          console.error('删除文件失败:', err);
        }
      },
    });
  }, [selectedPath, loadFiles]);

  /* ── 新建文件夹 ── */
  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await api.createFolder(name);
      setNewFolderName('');
      setIsCreatingFolder(false);
      loadFiles();
    } catch (err) {
      console.error('创建文件夹失败:', err);
    }
  }, [newFolderName, loadFiles]);

  /* ── 删除空文件夹 ── */
  const handleDeleteFolder = useCallback((name: string) => {
    setConfirmDialog({
      message: `确定删除空文件夹「${name}」？`,
      onConfirm: async () => {
        try {
          await api.deleteFolder(name);
          loadFiles();
        } catch (err) {
          console.error('删除文件夹失败:', err);
        }
      },
    });
  }, [loadFiles]);

  /* ── 在资源管理器中打开 ── */
  const handleOpenInExplorer = useCallback(async (folderName: string) => {
    try {
      await api.openFolder(folderName);
    } catch { /* 非关键功能 */ }
  }, []);

  const hasChanges = editContent !== savedContent;

  if (!open) return null;

  /* ── 渲染 ── */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-[#141413]/80 backdrop-blur-sm animate-overlay-fade-in" />

      {/* 主面板 — 暖灰底色 + 赤陶棕点缀 */}
      <div
        className={`relative flex flex-col overflow-hidden
          bg-[#1a1a18] border border-[#2a2926]
          shadow-[0_24px_64px_rgba(0,0,0,0.5),0_0_0_1px_rgba(204,124,94,0.05)]
          animate-modal-in transition-all duration-200
          ${isFullscreen ? 'rounded-none' : 'rounded-xl'}`}
        style={isFullscreen ? { width: '100%', height: '100%' } : { width: 900, height: 600 }}
      >
        {/* ── 标题栏 ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#2a2926]
          bg-[#1f1f1c]">
          {/* 标签切换 */}
          <div className="flex gap-0.5 bg-[#141413] rounded-lg p-0.5">
            {(['files', 'memories'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setShowSearch(false); }}
                className={`px-3 py-1 rounded-md text-xs transition-all duration-150 cursor-pointer
                  ${tab === t
                    ? 'bg-[#2a2926] text-slate-200'
                    : 'text-slate-600 hover:text-slate-400'
                  }`}
              >
                {t === 'files' ? '文件' : '记忆'}
              </button>
            ))}
          </div>

          {/* 搜索框 */}
          <div className="flex-1 flex items-center gap-2 max-w-xs ml-4">
            <div className="flex-1 relative">
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="搜索日记..."
                className="w-full text-xs bg-[#141413] border border-[#2a2926] rounded-lg
                  px-3 py-1.5 text-slate-300 placeholder:text-slate-700
                  outline-none focus:border-[#CC7C5E]/30 transition-colors"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-2.5 py-1.5 rounded-lg text-xs cursor-pointer
                bg-[#2a2926] text-slate-400 hover:text-slate-200
                disabled:opacity-50 transition-colors"
            >
              {isSearching ? '...' : '搜索'}
            </button>
          </div>

          {/* 保存状态 + 操作 */}
          <div className="flex items-center gap-2 ml-auto">
            {hasChanges && (
              <button
                onClick={handleSave}
                className="px-3 py-1 rounded-lg text-xs cursor-pointer
                  bg-[#CC7C5E]/15 text-[#CC7C5E] hover:bg-[#CC7C5E]/25
                  transition-colors"
              >
                保存
              </button>
            )}
            {selectedPath && tab === 'files' && (
              <button
                onClick={handleDeleteFile}
                className="px-2 py-1 rounded-lg text-xs cursor-pointer
                  text-slate-600 hover:text-red-400 hover:bg-red-400/10
                  transition-colors"
              >
                删除
              </button>
            )}
            <button
              onClick={() => setIsFullscreen(v => !v)}
              className="w-6 h-6 rounded flex items-center justify-center cursor-pointer
                text-slate-600 hover:text-slate-300 hover:bg-[#2a2926]
                transition-colors"
              title={isFullscreen ? '还原' : '全屏'}
            >
              {isFullscreen ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor">
                  <rect x="4" y="1" width="11" height="11" rx="1" strokeWidth="1.2" />
                  <rect x="1" y="4" width="11" height="11" rx="1" strokeWidth="1.2" strokeOpacity="0.5" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor">
                  <rect x="2" y="2" width="12" height="12" rx="1" strokeWidth="1.2" />
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded flex items-center justify-center cursor-pointer
                text-slate-600 hover:text-red-400 hover:bg-red-400/10
                transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── 内容区 ── */}
        <div className="flex flex-1 min-h-0">
          {tab === 'files' && !showSearch ? (
            <>
              {/* 左栏：文件树 */}
              <div className="w-48 flex-shrink-0 border-r border-[#2a2926] bg-[#171715]
                overflow-y-auto scrollbar-lumen">
                <div className="px-3 py-2 border-b border-[#2a2926] flex items-center">
                  <span className="text-[10px] uppercase tracking-widest text-slate-600">
                    文件夹
                  </span>
                  <button
                    onClick={() => setIsCreatingFolder(true)}
                    className="ml-auto w-4 h-4 flex items-center justify-center rounded
                      text-slate-700 hover:text-slate-400 hover:bg-slate-700/40
                      transition-all duration-150 cursor-pointer"
                    title="新建文件夹"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                </div>
                <FolderTree
                  folders={folders}
                  selectedPath={selectedPath}
                  onSelect={handleSelectFile}
                  onDeleteFolder={handleDeleteFolder}
                  onOpenInExplorer={handleOpenInExplorer}
                />
                {/* 新建文件夹内联输入 */}
                {isCreatingFolder && (
                  <div className="flex items-center gap-1 px-3 py-1 border-t border-[#2a2926]">
                    <input
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateFolder();
                        if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); }
                      }}
                      placeholder="文件夹名"
                      className="flex-1 text-xs bg-[#141413] border border-[#2a2926] rounded
                        px-2 py-1 text-slate-300 placeholder:text-slate-700
                        outline-none focus:border-[#CC7C5E]/30"
                      autoFocus
                    />
                    <button
                      onClick={handleCreateFolder}
                      className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer"
                    >OK</button>
                  </div>
                )}
              </div>

              {/* 中栏：编辑器 */}
              <div className="flex-1 flex flex-col min-w-0 border-r border-[#2a2926]">
                <div className="px-3 py-1.5 border-b border-[#2a2926] bg-[#1c1c1a]">
                  <span className="text-[10px] uppercase tracking-widest text-slate-600">
                    {selectedPath ? selectedPath.split('/').pop()?.replace(/\.md$/, '') : '编辑器'}
                  </span>
                  {hasChanges && (
                    <span className="ml-2 text-[10px] text-amber-600">未保存</span>
                  )}
                </div>
                {selectedPath ? (
                  <textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="flex-1 w-full p-4 bg-transparent text-slate-300 text-sm
                      leading-relaxed resize-none outline-none
                      font-[Fira_Code,Cascadia_Code,JetBrains_Mono,monospace]
                      placeholder:text-slate-700"
                    placeholder="选择左侧文件开始编辑..."
                    spellCheck={false}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <svg className="w-8 h-8 mx-auto mb-3 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <p className="text-xs text-slate-500">选择文件开始编辑</p>
                      <p className="text-[10px] text-slate-800 mt-1">Ctrl+S 保存</p>
                    </div>
                  </div>
                )}
              </div>

              {/* 右栏：预览 */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="px-3 py-1.5 border-b border-[#2a2926] bg-[#1c1c1a]">
                  <span className="text-[10px] uppercase tracking-widest text-slate-600">
                    预览
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-lumen p-4">
                  {selectedPath && editContent ? (
                    <MarkdownContent content={editContent} />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-xs text-slate-600">实时预览区域</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* 搜索/记忆列表视图 */
            <div className="flex-1 overflow-y-auto scrollbar-lumen">
              <div className="max-w-2xl mx-auto py-4">
                {searchResults.length > 0 ? (
                  <div className="space-y-1">
                    {searchResults.map(item => (
                      <SearchResult
                        key={item.memory_id}
                        item={item}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                ) : showSearch ? (
                  <div className="text-center py-16">
                    <p className="text-xs text-slate-600">
                      {isSearching ? '搜索中...' : '没有找到匹配的日记'}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <p className="text-xs text-slate-600">输入关键词搜索日记</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 自定义确认弹窗 */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setConfirmDialog(null)}
          />
          <div className="relative bg-[#1f1f1c] border border-[#2a2926] rounded-xl
            shadow-[0_16px_48px_rgba(0,0,0,0.5)] p-5 min-w-[280px]">
            <p className="text-sm text-slate-300 mb-5">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-1.5 rounded-lg text-xs cursor-pointer
                  text-slate-500 hover:text-slate-300 hover:bg-slate-700/40
                  transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  fn();
                }}
                className="px-4 py-1.5 rounded-lg text-xs cursor-pointer
                  bg-red-500/15 text-red-400 border border-red-500/20
                  hover:bg-red-500/25 hover:border-red-500/40
                  transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.getElementById('overlay-root')!,
  );
}

export default MemoryWindow;
