/**
 * MemoryWindow — 记忆管理浮窗
 *
 * 顶层：编辑器模式切换（文件/图谱）+ TDB 标签页
 * daily_note 标签：文件树 + 编辑器 + 预览（保持原有行为）
 * knowledge / memory 标签：条目浏览 + 源文件管理
 */
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import RichTextEditor from './editors/RichTextEditor';
import * as memoriesApi from '../api/memories';
import type { MemoryFolder, MemoryItem } from '../api/memories';
import { listTdbs, listTdbEntries, updateTdbEntry, getTdbFileTree, importTdbFile, getTdbStats } from '../api/tdb';
import { uploadKnowledgeFile, deleteKnowledgeFile, listKnowledgeFiles, scanKnowledge, applyScanChanges } from '../api/knowledge';
import type { TdbInfo, TdbEntry, TdbFileFolder, TdbStats } from '../api/tdb';
import TdbFileTree from './TdbFileTree';
import ResizablePanel from './ResizablePanel';
import { toast } from '../utils/toast';
import { RefreshCw } from 'lucide-react';

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

const CATEGORY_OPTIONS = ['context', 'fact', 'preference', 'decision'];

/* ══════════════════════════════════════════
   子组件：文件树（daily_note 用）
   ══════════════════════════════════════════ */

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ctxMenu, setCtxMenu] = useState<{ name: string; x: number; y: number } | null>(null);

  useEffect(() => {
    setExpanded(prev => {
      const next = { ...prev };
      let changed = false;
      for (const f of folders) {
        if (!(f.path in next)) {
          next[f.path] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [folders]);

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

/* ══════════════════════════════════════════
   子组件：搜索结果卡片
   ══════════════════════════════════════════ */

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
        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">{item.content}</p>
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

/* ══════════════════════════════════════════
   主组件
   ══════════════════════════════════════════ */

interface MemoryWindowProps {
  open: boolean;
  onClose: () => void;
}

function MemoryWindow({ open, onClose }: MemoryWindowProps) {
  /* ── 全局状态 ── */
  const [tdbs, setTdbs] = useState<TdbInfo[]>([]);
  const [activeTdb, setActiveTdb] = useState<string>('knowledge');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  /* ── daily_note 文件状态 ── */
  const [folders, setFolders] = useState<MemoryFolder[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  /* ── TDB 浏览状态（knowledge / memory） ── */
  const [tdbEntries, setTdbEntries] = useState<TdbEntry[]>([]);
  const [tdbTotal, setTdbTotal] = useState(0);
  const [tdbStats, setTdbStats] = useState<TdbStats | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [tdbSourceFilter, setTdbSourceFilter] = useState('');
  const [isEditingTdb, setIsEditingTdb] = useState(false);
  const [editTdbContent, setEditTdbContent] = useState('');
  const [editTdbCategory, setEditTdbCategory] = useState('');
  const [editTdbTags, setEditTdbTags] = useState('');
  const [editTdbImportance, setEditTdbImportance] = useState(3);
  const [isSavingTdb, setIsSavingTdb] = useState(false);
  /* 源文件视图 */
  const [tdbViewMode, setTdbViewMode] = useState<'entries' | 'files'>('entries');
  const [fileFolders, setFileFolders] = useState<TdbFileFolder[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  /* 知识库 registry 视图 */
  const [knowledgeFiles, setKnowledgeFiles] = useState<Array<{id:string; filename:string; source_path:string; category:string; chunk_count:number; char_count:number; created_at:string}>>([]);
  const [isDeletingFile, setIsDeletingFile] = useState<string | null>(null);
  const [importingPaths, setImportingPaths] = useState<Set<string>>(new Set());
  /* 知识库扫描状态 */
  const [scanResult, setScanResult] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showScanPanel, setShowScanPanel] = useState(false);

  /* ── 加载 TDB 列表 ── */
  useEffect(() => {
    if (!open) return;
    listTdbs().then(data => setTdbs(data.tdbs)).catch(console.error);
  }, [open]);

  /* ── 加载文件树 ── */
  const loadFiles = useCallback(async () => {
    try {
      const data = await memoriesApi.listMemoryFiles();
      setFolders(data.folders);
    } catch (err) {
      console.error('加载文件列表失败:', err);
    }
  }, []);

  /* ── 加载 TDB 条目（knowledge / memory） ── */
  const loadTdbEntries = useCallback(async () => {
    if (activeTdb !== 'knowledge' && activeTdb !== 'memory') return;
    try {
      const [data, stats] = await Promise.all([
        listTdbEntries({ name: activeTdb, limit: 100 }),
        getTdbStats(activeTdb),
      ]);
      setTdbEntries(data.entries);
      setTdbTotal(data.total);
      setTdbStats(stats);
    } catch (err) {
      console.error('加载 TDB 条目失败:', err);
    }
  }, [activeTdb]);

  /* ── 加载源文件目录树 ── */
  const loadFileTree = useCallback(async () => {
    if (activeTdb !== 'knowledge' && activeTdb !== 'memory') return;
    try {
      const data = await getTdbFileTree(activeTdb);
      setFileFolders(data.folders);
    } catch (err) {
      console.error('加载文件树失败:', err);
    }
  }, [activeTdb]);

  /* ── 加载知识库 registry 文件列表 ── */
  const loadKnowledgeFiles = useCallback(async () => {
    try {
      const data = await listKnowledgeFiles();
      setKnowledgeFiles(data);
    } catch (err) {
      console.error('加载知识库文件列表失败:', err);
    }
  }, []);

  // source_path → file_id 映射（用于文件视图中定位 registry 条目）
  const pathToFileId = Object.fromEntries(
    knowledgeFiles.map(f => [f.source_path, f.id])
  );

  /* ── 切换 TDB 时重置状态 + 加载对应数据 ── */
  useEffect(() => {
    if (!open) return;
    // 重置选中/编辑状态，防止跨 TDB 数据泄漏
    setSelectedEntryId(null);
    setSelectedFilePath(null);
    setTdbSourceFilter('');
    setIsEditingTdb(false);
    setTdbViewMode('entries');

    if (activeTdb === 'daily_note') {
      loadFiles();
    } else if (activeTdb === 'knowledge' || activeTdb === 'memory') {
      loadTdbEntries();
      loadFileTree();
      if (activeTdb === 'knowledge') loadKnowledgeFiles();
    }
  }, [open, activeTdb, loadFiles, loadTdbEntries, loadFileTree, loadKnowledgeFiles]);

  /* ── 选中文件 ── */
  const handleSelectFile = useCallback(async (folderPath: string, fileName: string) => {
    const path = `${folderPath}/${fileName}`;
    setSelectedPath(path);
    setShowSearch(false);
    try {
      const data = await memoriesApi.readMemoryFile(path);
      setEditContent(data.content);
      setSavedContent(data.content);
    } catch (err) {
      console.error('读取文件失败:', err);
      toast('读取文件失败', 'error');
    }
  }, []);

  /* ── 保存文件 ── */
  const handleSaveFile = useCallback(async () => {
    if (!selectedPath) return;
    try {
      await memoriesApi.saveMemoryFile(selectedPath, editContent);
      setSavedContent(editContent);
      toast('保存成功', 'success');
    } catch (err) {
      console.error('保存失败:', err);
      toast('保存失败', 'error');
    }
  }, [selectedPath, editContent]);

  /* ── Ctrl+S ── */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeTdb === 'daily_note') handleSaveFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, activeTdb, handleSaveFile]);

  /* ── 搜索日记 ── */
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setShowSearch(true);
    try {
      const data = await memoriesApi.searchMemories(searchQuery);
      setSearchResults(data.results);
    } catch (err) {
      console.error('搜索失败:', err);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  /* ── 删除文件 ── */
  const handleDeleteFile = useCallback(() => {
    if (!selectedPath) return;
    setConfirmDialog({
      message: '确定删除这个文件？',
      onConfirm: async () => {
        try {
          const match = selectedPath.match(/(dn[a-z0-9]+)/);
          if (match) await memoriesApi.deleteMemory(match[1]);
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
      await memoriesApi.createFolder(name);
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
          await memoriesApi.deleteFolder(name);
          loadFiles();
        } catch (err) {
          console.error('删除文件夹失败:', err);
        }
      },
    });
  }, [loadFiles]);

  /* ── 在资源管理器中打开 ── */
  const handleOpenInExplorer = useCallback(async (folderName: string) => {
    try { await memoriesApi.openFolder(folderName); } catch { /* */ }
  }, []);

  /* ── 删除记忆 ── */
  const handleDeleteMemory = useCallback((memoryId: string) => {
    setConfirmDialog({
      message: '确定删除这条日记？',
      onConfirm: async () => {
        try {
          await memoriesApi.deleteMemory(memoryId);
          setSearchResults(prev => prev.filter(m => m.memory_id !== memoryId));
          loadFiles();
        } catch (err) {
          console.error('删除失败:', err);
        }
      },
    });
  }, [loadFiles]);

  /* ── 派生状态 ── */
  const hasFileChanges = editContent !== savedContent;

  if (!open) return null;

  /* ── 渲染 TDB 标签页 ── */
  const renderTdbTabs = () => (
    <div className="flex items-center gap-0.5 px-2 overflow-x-auto scrollbar-none">
      {tdbs
        .map(tdb => {
          const isActive = activeTdb === tdb.name;
          const label = tdb.name;
          return (
            <button
              key={tdb.name}
              onClick={() => { setActiveTdb(tdb.name); setShowSearch(false); }}
              className={`px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap transition-all duration-150 cursor-pointer
                ${isActive
                  ? 'bg-[#2a2926] text-slate-200'
                  : 'text-slate-600 hover:text-slate-400'
                }`}
            >
              {label}
            </button>
          );
        })}
    </div>
  );

  /* ── 渲染 daily_note 内容 ── */
  const renderDailyNoteContent = () => {
    if (showSearch) {
      return (
        <div className="flex-1 overflow-y-auto scrollbar-lumen">
          <div className="max-w-2xl mx-auto py-4">
            {searchResults.length > 0 ? (
              <div className="space-y-1">
                {searchResults.map(item => (
                  <SearchResult key={item.memory_id} item={item} onDelete={handleDeleteMemory} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-xs text-slate-600">
                  {isSearching ? '搜索中...' : '没有找到匹配的日记'}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <>
        {/* 左栏：文件树 */}
        <div className="w-48 flex-shrink-0 border-r border-[#2a2926] bg-[#171715] overflow-y-auto scrollbar-lumen">
          <div className="px-3 py-2 border-b border-[#2a2926] flex items-center">
            <span className="text-[10px] uppercase tracking-widest text-slate-600">文件夹</span>
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
                className="flex-1 text-xs bg-[#1C1B19] border border-[#2a2926] rounded
                  px-2 py-1 text-slate-300 placeholder:text-slate-700
                  outline-none focus:border-[#CC7C5E]/30"
                autoFocus
              />
              <button onClick={handleCreateFolder} className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer">OK</button>
            </div>
          )}
        </div>

        {/* 中栏：富文本编辑器（替代原 textarea + 预览栏） */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="px-3 py-1.5 border-b border-[#2a2926] bg-[#1c1c1a]">
            <span className="text-[10px] uppercase tracking-widest text-slate-600">
              {selectedPath ? selectedPath.split('/').pop()?.replace(/\.md$/, '') : '编辑器'}
            </span>
            {hasFileChanges && <span className="ml-2 text-[10px] text-amber-600">未保存</span>}
          </div>
          {selectedPath ? (
            <RichTextEditor
              value={editContent}
              onChange={setEditContent}
              onSave={handleSaveFile}
              placeholder="开始写作…"
              className="flex-1 min-h-0"
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
      </>
    );
  };

  /* ── 渲染通用 TDB 浏览器（knowledge / memory） ── */
  const renderTdbBrowser = () => {
    // 前端来源过滤（只影响条目列表显示，不影响文件视图和详情选中）
    const filteredEntries = tdbSourceFilter
      ? tdbEntries.filter(e => e.source === tdbSourceFilter)
      : tdbEntries;
    // 选中的条目从全量数据查找（确保文件视图下 chunk 切换正常）
    const selectedEntry = tdbEntries.find(e => e.id === selectedEntryId);
    // 文件模式下：过滤出选中文件的 chunks
    const fileChunks = selectedFilePath
      ? tdbEntries.filter(e => e.source_path === selectedFilePath || e.source_path?.endsWith('/' + selectedFilePath))
      : [];
    // 当前显示的条目（文件模式取第一个 chunk，或全部 chunks 的预览）
    const displayEntry = selectedEntry || (fileChunks.length > 0 ? fileChunks[0] : null);

    return (
      <>
        {/* 左栏：条目/文件切换（可拖拽调宽） */}
        <ResizablePanel
          defaultWidth={256}
          minWidth={180}
          maxWidth={400}
          storageKey="lumen_knowledge_sidebar_width"
          className="border-r border-[#2a2926] bg-[#171715] flex flex-col"
        >
          {/* 视图切换 + 过滤 */}
          <div className="px-2 py-2 border-b border-[#2a2926]">
            <div className="flex items-center gap-1.5">
              {fileFolders.length > 0 && (
                <div className="flex gap-0.5 bg-[#1C1B19] rounded p-0.5">
                  <button
                    onClick={() => setTdbViewMode('entries')}
                    className={`px-1.5 py-0.5 rounded text-[9px] cursor-pointer transition-colors
                      ${tdbViewMode === 'entries' ? 'bg-[#2a2926] text-slate-200' : 'text-slate-600 hover:text-slate-400'}`}
                  >条目</button>
                  <button
                    onClick={() => setTdbViewMode('files')}
                    className={`px-1.5 py-0.5 rounded text-[9px] cursor-pointer transition-colors
                      ${tdbViewMode === 'files' ? 'bg-[#2a2926] text-slate-200' : 'text-slate-600 hover:text-slate-400'}`}
                  >文件</button>
                </div>
              )}
              {tdbViewMode === 'entries' && (
                <>
                  <span className="text-[10px] text-slate-600">{tdbTotal} 条</span>
                  {activeTdb === 'knowledge' && (
                    <select
                      value={tdbSourceFilter}
                      onChange={e => setTdbSourceFilter(e.target.value)}
                      className="ml-auto text-[10px] bg-[#1C1B19] border border-[#2a2926] rounded px-1.5 py-0.5
                        text-slate-400 outline-none cursor-pointer"
                    >
                      <option value="">全部来源</option>
                      {tdbStats && Object.keys(tdbStats.sources).map(src => (
                        <option key={src} value={src}>
                          {src === 'daily_note' ? '日记' : src === 'chat' ? '聊天' : src === 'upload' ? '上传' : src === 'manual' ? '手动导入' : src}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
              {tdbViewMode === 'files' && (
                <span className="text-[10px] text-slate-600">{fileFolders.reduce((s, f) => s + f.files.length, 0)} 文件</span>
              )}
              {activeTdb === 'knowledge' && (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={async () => {
                      setIsScanning(true);
                      try {
                        const result = await scanKnowledge();
                        setScanResult(result);
                        setShowScanPanel(true);
                      } catch (err) {
                        toast('扫描失败', 'error');
                      }
                      setIsScanning(false);
                    }}
                    className="p-1 rounded text-slate-600 hover:text-sky-400 hover:bg-sky-500/10
                      transition-colors cursor-pointer"
                    title="扫描知识库变更"
                    disabled={isScanning}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.txt,.md,.markdown';
                      input.multiple = true;
                      input.onchange = async () => {
                        if (!input.files) return;
                        for (const file of Array.from(input.files)) {
                          try {
                            await uploadKnowledgeFile(file, 'lumen_docs');
                            toast(`${file.name} 上传成功`, 'success');
                          } catch (err) {
                            toast(`${file.name}: ${err instanceof Error ? err.message : '上传失败'}`, 'error');
                          }
                        }
                        loadTdbEntries();
                        loadFileTree();
                      };
                      input.click();
                    }}
                    className="p-1 rounded text-slate-600 hover:text-amber-400 hover:bg-amber-500/10
                      transition-colors cursor-pointer"
                    title="上传文件到知识库"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* T23 扫描结果面板 */}
          {showScanPanel && scanResult && (
            <div className="border-b border-[#2a2926] p-3 bg-[#1C1B19]/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">扫描结果</span>
                <button
                  onClick={() => { setShowScanPanel(false); setScanResult(null); }}
                  className="text-slate-700 hover:text-slate-400 cursor-pointer"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {scanResult.new_kbs?.length > 0 && (
                <div className="mb-2">
                  <div className="text-[9px] text-emerald-500 mb-1">新知识库</div>
                  {scanResult.new_kbs.map((kb: string) => (
                    <div key={kb} className="text-[10px] text-slate-400 pl-2">{kb}/</div>
                  ))}
                </div>
              )}

              {scanResult.added?.length > 0 && (
                <div className="mb-2">
                  <div className="text-[9px] text-sky-400 mb-1">新增文件 ({scanResult.added.length})</div>
                  {scanResult.added.map((f: any, i: number) => (
                    <div key={i} className="text-[10px] text-slate-400 pl-2">{f.path}</div>
                  ))}
                </div>
              )}

              {scanResult.modified?.length > 0 && (
                <div className="mb-2">
                  <div className="text-[9px] text-amber-400 mb-1">已修改 ({scanResult.modified.length})</div>
                  {scanResult.modified.map((f: any, i: number) => (
                    <div key={i} className="text-[10px] text-slate-400 pl-2">{f.path}</div>
                  ))}
                </div>
              )}

              {scanResult.deleted?.length > 0 && (
                <div className="mb-2">
                  <div className="text-[9px] text-red-400 mb-1">已删除 ({scanResult.deleted.length})</div>
                  {scanResult.deleted.map((f: any, i: number) => (
                    <div key={i} className="text-[10px] text-slate-400 pl-2">{f.path}</div>
                  ))}
                </div>
              )}

              {(!scanResult.new_kbs?.length && !scanResult.added?.length && !scanResult.modified?.length && !scanResult.deleted?.length) && (
                <p className="text-[10px] text-slate-600">未发现变更</p>
              )}

              {(scanResult.new_kbs?.length || scanResult.added?.length || scanResult.modified?.length || scanResult.deleted?.length) && (
                <button
                  onClick={async () => {
                    try {
                      const result = await applyScanChanges({
                        register_kbs: scanResult.new_kbs || [],
                        added: scanResult.added || [],
                        modified: scanResult.modified || [],
                        deleted: scanResult.deleted || [],
                      });
                      toast(`处理完成: ${result.results?.length ?? 0} 项`, 'success');
                      setShowScanPanel(false);
                      setScanResult(null);
                      loadTdbEntries();
                      loadFileTree();
                    } catch (err) {
                      toast('处理变更失败', 'error');
                    }
                  }}
                  className="mt-2 w-full py-1 rounded text-[10px] font-medium cursor-pointer
                    bg-sky-600/20 text-sky-400 hover:bg-sky-600/30 transition-colors"
                >
                  确认处理
                </button>
              )}
            </div>
          )}

          {/* 条目列表 or 文件树 */}
          <div className="flex-1 overflow-y-auto scrollbar-lumen">
            {tdbViewMode === 'entries' ? (
              /* 条目视图 */
              filteredEntries.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-slate-700">暂无数据</p>
                </div>
              ) : (
                filteredEntries.map(entry => {
                  const isActive = entry.id === selectedEntryId;
                  return (
                    <button
                      key={entry.id}
                      onClick={() => { setSelectedEntryId(entry.id); setSelectedFilePath(null); }}
                      className={`w-full flex flex-col gap-0.5 px-3 py-2 cursor-pointer transition-colors duration-100 text-left
                        ${isActive
                          ? 'bg-[#CC7C5E]/08 text-slate-200'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] uppercase tracking-wider ${CATEGORY_COLORS[entry.category] || 'text-slate-500'}`}>
                          {CATEGORY_LABELS[entry.category] || entry.category || '—'}
                        </span>
                        {entry.source && (
                          <span className="text-[10px] text-slate-700">{entry.source}</span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed line-clamp-2">{entry.content}</p>
                      <span className="text-[10px] text-slate-700">{entry.created_at?.slice(0, 16)}</span>
                    </button>
                  );
                })
              )
            ) : (
              /* 源文件视图：目录树 */
              <TdbFileTree
                folders={fileFolders}
                selectedPath={selectedFilePath}
                onSelect={(path) => { setSelectedFilePath(path); setSelectedEntryId(null); }}
                renderFileActions={(file) => {
                  const chunkCount = tdbEntries.filter(e =>
                    e.source_path === file.path || e.source_path?.endsWith('/' + file.path)
                  ).length;
                  if (chunkCount === 0) {
                    return (<>
                      <span className="text-[9px] text-amber-500/80 mr-1">未导入</span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (importingPaths.has(file.path)) return;
                          setImportingPaths(prev => new Set(prev).add(file.path));
                          try {
                            const result = await importTdbFile(activeTdb, file.path);
                            toast(`导入成功，${result.chunks} 个片段`, 'success');
                            loadTdbEntries();
                            loadFileTree();
                            loadKnowledgeFiles();
                          } catch (err: any) {
                            toast(err.message || '导入失败', 'error');
                          } finally {
                            setImportingPaths(prev => { const n = new Set(prev); n.delete(file.path); return n; });
                          }
                        }}
                        disabled={importingPaths.has(file.path)}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400
                          hover:bg-amber-500/25 transition-colors flex-shrink-0 cursor-pointer
                          disabled:opacity-40 disabled:cursor-wait"
                      >
                        {importingPaths.has(file.path) ? '导入中...' : '导入'}
                      </button>
                    </>);
                  }
                  return (<>
                    <span className="text-[10px] text-slate-700 mr-0.5">{chunkCount}段</span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (importingPaths.has(file.path)) return;
                        if (!confirm(`「${file.name}」已导入，重新导入将清空旧数据并重新切分向量化。确定继续？`)) return;
                        setImportingPaths(prev => new Set(prev).add(file.path));
                        try {
                          const result = await importTdbFile(activeTdb, file.path);
                          toast(`重新导入成功，${result.chunks} 个片段`, 'success');
                          loadTdbEntries();
                          loadFileTree();
                          loadKnowledgeFiles();
                        } catch (err: any) {
                          toast(err.message || '导入失败', 'error');
                        } finally {
                          setImportingPaths(prev => { const n = new Set(prev); n.delete(file.path); return n; });
                        }
                      }}
                      disabled={importingPaths.has(file.path)}
                      className="text-[9px] px-1.5 py-0.5 rounded text-slate-600 hover:text-amber-400 hover:bg-amber-500/10
                        transition-colors flex-shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-wait"
                      title="重新导入"
                    >
                      {importingPaths.has(file.path) ? '...' : '重导'}
                    </button>
                    {pathToFileId[file.path] && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const fileId = pathToFileId[file.path];
                          if (!confirm(`确定删除「${file.name}」吗？\n向量数据、源文件和索引都会一并删除。`)) return;
                          setIsDeletingFile(fileId);
                          try {
                            await deleteKnowledgeFile(fileId);
                            toast(`已删除: ${file.name}`, 'success');
                            loadTdbEntries();
                            loadFileTree();
                            loadKnowledgeFiles();
                          } catch (err) {
                            toast(err instanceof Error ? err.message : '删除失败', 'error');
                          } finally {
                            setIsDeletingFile(null);
                          }
                        }}
                        disabled={isDeletingFile === pathToFileId[file.path]}
                        className="text-[9px] px-1.5 py-0.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10
                          transition-colors flex-shrink-0 cursor-pointer disabled:opacity-30"
                      >
                        {isDeletingFile === pathToFileId[file.path] ? '...' : '删'}
                      </button>
                    )}
                  </>);
                }}
                footer={
                  /* orphan 条目：registry 里有但磁盘上找不到源文件 */
                  (() => {
                    const filePaths = new Set<string>();
                    for (const folder of fileFolders) {
                      for (const f of folder.files) {
                        filePaths.add(f.path);
                      }
                    }
                    const orphans = knowledgeFiles.filter(f => !filePaths.has(f.source_path));
                    if (orphans.length === 0) return null;
                    return (
                      <div className="border-t border-[#2a2926] mt-1">
                        <details className="group">
                          <summary className="px-3 py-2 text-[10px] text-amber-500/70 cursor-pointer hover:text-amber-400 transition-colors">
                            孤立条目 ({orphans.length})
                          </summary>
                          <div className="pb-1">
                            {orphans.map(file => (
                              <div key={file.id} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-800/20">
                                <span className="text-[10px] text-slate-500 truncate flex-1">{file.filename}</span>
                                <span className="text-[9px] text-slate-600">{file.chunk_count}段</span>
                                <button
                                  onClick={async () => {
                                    if (!confirm(`确定清理孤立条目「${file.filename}」吗？`)) return;
                                    try {
                                      await deleteKnowledgeFile(file.id);
                                      toast(`已清理: ${file.filename}`, 'success');
                                      loadKnowledgeFiles();
                                      loadTdbEntries();
                                      loadFileTree();
                                    } catch (err) {
                                      toast(err instanceof Error ? err.message : '清理失败', 'error');
                                    }
                                  }}
                                  className="text-[9px] px-1.5 py-0.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10
                                    transition-colors flex-shrink-0 cursor-pointer"
                                >清理</button>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    );
                  })()
                }
              />
            )}
          </div>
        </ResizablePanel>

        {/* 中栏：内容详情（只读） */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[#2a2926]">
          {displayEntry ? (
            <>
              <div className="px-4 py-2 border-b border-[#2a2926] bg-[#1c1c1a] flex items-center gap-3">
                <span className={`text-[10px] uppercase tracking-wider ${CATEGORY_COLORS[displayEntry.category] || 'text-slate-500'}`}>
                  {CATEGORY_LABELS[displayEntry.category] || displayEntry.category || '—'}
                </span>
                {displayEntry.source && (
                  <span className="text-[10px] text-slate-600">来源: {displayEntry.source}</span>
                )}
                {displayEntry.source_path && (
                  <span className="text-[10px] text-slate-600 truncate">{displayEntry.source_path}</span>
                )}
                <span className="text-[10px] text-slate-700 ml-auto">ID: {displayEntry.id}</span>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-lumen">
                {/* 文件模式下：显示 chunk 列表 */}
                {fileChunks.length > 1 && (
                  <div className="border-b border-[#2a2926]">
                    <div className="px-4 py-1.5 bg-[#1c1c1a]">
                      <span className="text-[10px] text-slate-600">{fileChunks.length} 个片段</span>
                    </div>
                    {fileChunks.map((chunk, idx) => (
                      <button
                        key={chunk.id}
                        onClick={() => setSelectedEntryId(chunk.id)}
                        className={`w-full text-left px-4 py-2 border-b border-[#2a2926]/50
                          text-xs hover:text-slate-300 hover:bg-slate-800/30
                          cursor-pointer transition-colors
                          ${chunk.id === selectedEntryId ? 'bg-[#CC7C5E]/08 text-slate-200' : 'text-slate-500'}
                        `}
                      >
                        <span className="text-[10px] text-slate-700">#{idx + 1}</span>
                        <p className="line-clamp-2 mt-0.5">{chunk.content}</p>
                      </button>
                    ))}
                  </div>
                )}
                {/* 内容显示 */}
                <div className="p-4">
                  {activeTdb === 'knowledge' && isEditingTdb ? (
                    <textarea
                      value={editTdbContent}
                      onChange={e => setEditTdbContent(e.target.value)}
                      className="w-full min-h-[200px] rounded-lg px-3 py-2 bg-slate-800/60 border border-amber-500/20
                        text-slate-200 text-sm leading-relaxed resize-none outline-none
                        focus:border-amber-500/40"
                    />
                  ) : (
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{displayEntry.content}</p>
                  )}
                </div>
              </div>
              {/* 操作按钮 */}
              <div className="px-4 py-2 border-t border-[#2a2926] flex items-center gap-2">
                {activeTdb === 'knowledge' && (
                  <>
                    {isEditingTdb ? (
                      <>
                        <button
                          onClick={async () => {
                            if (!displayEntry?.id) return;
                            setIsSavingTdb(true);
                            try {
                              const tags = editTdbTags.split(',').map(t => t.trim()).filter(Boolean);
                              await updateTdbEntry('knowledge', displayEntry!.id!, {
                                content: editTdbContent,
                                category: editTdbCategory || undefined,
                                tags: tags.length > 0 ? tags : undefined,
                                importance: editTdbImportance,
                                reindex: true,
                              });
                              toast('保存成功（已重向量化）', 'success');
                              setIsEditingTdb(false);
                              loadTdbEntries();
                            } catch (err) {
                              toast('保存失败', 'error');
                            } finally {
                              setIsSavingTdb(false);
                            }
                          }}
                          disabled={isSavingTdb}
                          className="px-3 py-1 rounded-lg text-xs cursor-pointer
                            bg-amber-500/20 text-amber-300 hover:bg-amber-500/30
                            disabled:opacity-50 transition-colors"
                        >
                          {isSavingTdb ? '保存中...' : '保存修改'}
                        </button>
                        <button
                          onClick={() => setIsEditingTdb(false)}
                          className="px-3 py-1 rounded-lg text-xs cursor-pointer
                            text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setIsEditingTdb(true);
                          setEditTdbContent(displayEntry.content);
                          setEditTdbCategory(displayEntry.category);
                          setEditTdbTags(displayEntry.keywords?.join(', ') || '');
                          setEditTdbImportance(displayEntry.importance || 3);
                        }}
                        className="px-3 py-1 rounded-lg text-xs cursor-pointer
                          text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
                      >
                        编辑
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-8 h-8 mx-auto mb-3 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-xs text-slate-500">选择条目查看内容</p>
              </div>
            </div>
          )}
        </div>

        {/* 右栏：元信息 */}
        <div className="w-48 flex-shrink-0 flex flex-col">
          <div className="px-3 py-1.5 border-b border-[#2a2926] bg-[#1c1c1a]">
            <span className="text-[10px] uppercase tracking-widest text-slate-600">元信息</span>
          </div>
          <div className="flex-1 p-3 overflow-y-auto scrollbar-lumen">
            {displayEntry ? (
              <div className="space-y-2 text-[10px] text-slate-600">
                <div className="flex justify-between">
                  <span>来源</span>
                  <span className="text-slate-400">{displayEntry.source || '—'}</span>
                </div>
                {/* 分类：编辑模式下可修改 */}
                <div>
                  <span>分类</span>
                  {activeTdb === 'knowledge' && isEditingTdb ? (
                    <select
                      value={editTdbCategory}
                      onChange={e => setEditTdbCategory(e.target.value)}
                      className="w-full mt-1 text-[10px] bg-[#1C1B19] border border-[#2a2926] rounded px-1.5 py-0.5
                        text-slate-400 outline-none cursor-pointer"
                    >
                      {CATEGORY_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{CATEGORY_LABELS[opt] || opt}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`ml-2 ${CATEGORY_COLORS[displayEntry.category] || 'text-slate-400'}`}>
                      {CATEGORY_LABELS[displayEntry.category] || displayEntry.category || '—'}
                    </span>
                  )}
                </div>
                {/* 重要度：编辑模式下可修改 */}
                <div>
                  <span>重要度</span>
                  {activeTdb === 'knowledge' && isEditingTdb ? (
                    <input
                      type="range" min={1} max={5}
                      value={editTdbImportance}
                      onChange={e => setEditTdbImportance(Number(e.target.value))}
                      className="w-full mt-1 accent-amber-500"
                    />
                  ) : (
                    <span className="text-slate-400 ml-2">{displayEntry.importance || '—'}</span>
                  )}
                </div>
                {/* 标签：编辑模式下可修改 */}
                <div>
                  <span>标签</span>
                  {activeTdb === 'knowledge' && isEditingTdb ? (
                    <input
                      value={editTdbTags}
                      onChange={e => setEditTdbTags(e.target.value)}
                      placeholder="标签1, 标签2"
                      className="w-full mt-1 text-[10px] bg-[#1C1B19] border border-[#2a2926] rounded px-1.5 py-0.5
                        text-slate-400 outline-none"
                    />
                  ) : displayEntry.keywords?.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {displayEntry.keywords.map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-slate-800/40 text-slate-500">{kw}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex justify-between">
                  <span>会话</span>
                  <span className="text-slate-500 font-mono">{displayEntry.session_id?.slice(0, 8) || '—'}</span>
                </div>
                {displayEntry.role && (
                  <div className="flex justify-between">
                    <span>角色</span>
                    <span className="text-slate-400">{displayEntry.role}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>创建时间</span>
                  <span className="text-slate-400">{displayEntry.created_at?.slice(0, 16) || '—'}</span>
                </div>
                {displayEntry.source_path && (
                  <div>
                    <span>源文件</span>
                    <p className="text-slate-500 mt-0.5 break-all">{displayEntry.source_path}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-700">选择条目查看元信息</p>
            )}
          </div>
        </div>
      </>
    );
  };

  /* ══════════════════════════════════════════
     渲染主体
     ══════════════════════════════════════════ */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-[#1C1B19]/80 backdrop-blur-sm animate-overlay-fade-in" />

      <div
        className={`relative flex flex-col overflow-hidden
          bg-[#1a1a18] border border-[#2a2926]
          shadow-[0_24px_64px_rgba(0,0,0,0.5),0_0_0_1px_rgba(204,124,94,0.05)]
          animate-modal-in transition-all duration-200
          ${isFullscreen ? 'rounded-none' : 'rounded-xl'}`}
        style={isFullscreen ? { width: '100%', height: '100%' } : { width: 1152, height: 768 }}
      >
        {/* ── 标题栏 ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#2a2926] bg-[#1f1f1c]">
          {/* TDB 标签页 */}
          {renderTdbTabs()}

          {/* 搜索框（仅 daily_note） */}
          {activeTdb === 'daily_note' && (
            <div className="flex items-center gap-2 ml-2">
              <div className="relative">
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="搜索日记..."
                  className="w-32 text-[11px] bg-[#1C1B19] border border-[#2a2926] rounded-lg
                    px-2.5 py-1 text-slate-300 placeholder:text-slate-700
                    outline-none focus:border-[#CC7C5E]/30 transition-colors"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="px-2 py-1 rounded-lg text-[10px] cursor-pointer
                  bg-[#2a2926] text-slate-400 hover:text-slate-200
                  disabled:opacity-50 transition-colors"
              >
                {isSearching ? '...' : '搜索'}
              </button>
            </div>
          )}

          {/* 右侧操作 */}
          <div className="flex items-center gap-2 ml-auto">
            {activeTdb === 'daily_note' && hasFileChanges && (
              <button
                onClick={handleSaveFile}
                className="px-3 py-1 rounded-lg text-xs cursor-pointer
                  bg-[#CC7C5E]/15 text-[#CC7C5E] hover:bg-[#CC7C5E]/25 transition-colors"
              >
                保存
              </button>
            )}
            {activeTdb === 'daily_note' && selectedPath && !showSearch && (
              <button
                onClick={handleDeleteFile}
                className="px-2 py-1 rounded-lg text-xs cursor-pointer
                  text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                删除
              </button>
            )}
            <button
              onClick={() => setIsFullscreen(v => !v)}
              className="w-6 h-6 rounded flex items-center justify-center cursor-pointer
                text-slate-600 hover:text-slate-300 hover:bg-[#2a2926] transition-colors"
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
                text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── 内容区 ── */}
        <div className="flex flex-1 min-h-0">
          {activeTdb === 'daily_note' ? renderDailyNoteContent() :
           (activeTdb === 'knowledge' || activeTdb === 'memory') ? renderTdbBrowser() :
           renderDailyNoteContent()}
        </div>
      </div>

      {/* 确认弹窗 */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDialog(null)} />
          <div className="relative bg-[#1f1f1c] border border-[#2a2926] rounded-xl
            shadow-[0_16px_48px_rgba(0,0,0,0.5)] p-5 min-w-[280px]">
            <p className="text-sm text-slate-300 mb-5">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-1.5 rounded-lg text-xs cursor-pointer
                  text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 transition-colors"
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
                  hover:bg-red-500/25 hover:border-red-500/40 transition-colors"
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
