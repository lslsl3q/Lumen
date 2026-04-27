/**
 * MemoryWindow — 记忆管理浮窗
 *
 * 顶层：编辑器模式切换（文件/图谱）+ TDB 标签页
 * daily_note 标签：文件树 + 编辑器 + 预览（保持原有行为）
 * buffer 标签：审批列表 + 详情编辑 + 操作按钮
 * 其他 TDB 标签：预留
 */
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import GraphEditor from './GraphEditor';
import RichTextEditor from './editors/RichTextEditor';
import * as memoriesApi from '../api/memories';
import type { MemoryFolder, MemoryItem } from '../api/memories';
import {
  listBufferItems,
  listTdbs,
  updateBufferItem,
  confirmBufferItem,
  discardBufferItem,
  consolidateBuffer,
  getBufferStats,
} from '../api/buffer';
import type { BufferItem, BufferStats, TdbInfo } from '../api/buffer';
import { listTdbEntries, updateTdbEntry, deleteTdbEntry, getTdbFileTree, importTdbFile, getTdbStats } from '../api/tdb';
import type { TdbEntry, TdbFileFolder, TdbStats } from '../api/tdb';
import { toast } from '../utils/toast';

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
   子组件：缓冲区条目行
   ══════════════════════════════════════════ */

function BufferItemRow({
  item,
  isSelected,
  isChecked,
  onSelect,
  onToggleCheck,
}: {
  item: BufferItem;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onToggleCheck: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors duration-100 text-left
        ${isSelected
          ? 'bg-[#CC7C5E]/08 text-slate-200'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
        }`}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onClick={onToggleCheck}
        onChange={() => {}}
        className="mt-0.5 rounded border-slate-600 accent-amber-500 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[10px] uppercase tracking-wider ${CATEGORY_COLORS[item.category] || 'text-slate-500'}`}>
            {CATEGORY_LABELS[item.category] || item.category}
          </span>
          {item.importance >= 4 && (
            <span className="text-[10px] text-amber-500">!</span>
          )}
        </div>
        <p className="text-xs leading-relaxed line-clamp-2">{item.content}</p>
      </div>
    </button>
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
  const [editorMode, setEditorMode] = useState<'file' | 'graph'>('file');
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

  /* ── 缓冲区状态 ── */
  const [bufferItems, setBufferItems] = useState<BufferItem[]>([]);
  const [bufferStats, setBufferStats] = useState<BufferStats | null>(null);
  const [selectedBufferId, setSelectedBufferId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [bufferStatusFilter, setBufferStatusFilter] = useState<'pending' | 'confirmed' | 'discarded'>('pending');

  /* 缓冲区详情编辑 */
  const [editBufferItem, setEditBufferItem] = useState<BufferItem | null>(null);
  const [isSavingBuffer, setIsSavingBuffer] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

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

  /* ── 加载缓冲区 ── */
  const loadBuffer = useCallback(async () => {
    try {
      const [itemsData, statsData] = await Promise.all([
        listBufferItems({ status: bufferStatusFilter, limit: 100 }),
        getBufferStats(),
      ]);
      setBufferItems(itemsData.items);
      setBufferStats(statsData);
    } catch (err) {
      console.error('加载缓冲区失败:', err);
    }
  }, [bufferStatusFilter]);

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

  /* ── 切换 TDB 时加载对应数据 ── */
  useEffect(() => {
    if (!open) return;
    if (activeTdb === 'daily_note') {
      loadFiles();
    } else if (activeTdb === 'buffer') {
      loadBuffer();
    } else if (activeTdb === 'knowledge' || activeTdb === 'memory') {
      loadTdbEntries();
      loadFileTree();
    }
  }, [open, activeTdb, loadFiles, loadBuffer, loadTdbEntries]);

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
        else if (activeTdb === 'buffer' && editBufferItem) handleSaveBufferEdit();
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

  /* ═══ 缓冲区操作 ═══ */

  /* 选中缓冲区条目 */
  const handleSelectBufferItem = useCallback((item: BufferItem) => {
    setSelectedBufferId(item.id);
    setEditBufferItem({ ...item });
  }, []);

  /* 复选框切换 */
  const handleToggleCheck = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* 全选/取消 */
  const handleToggleAll = useCallback(() => {
    const pendingIds = bufferItems.filter(i => i.status === 'pending').map(i => i.id);
    if (checkedIds.size === pendingIds.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(pendingIds));
    }
  }, [bufferItems, checkedIds]);

  /* 保存缓冲区编辑 */
  const handleSaveBufferEdit = useCallback(async () => {
    if (!editBufferItem) return;
    setIsSavingBuffer(true);
    try {
      await updateBufferItem(editBufferItem.id, {
        content: editBufferItem.content,
        category: editBufferItem.category,
        tags: editBufferItem.keywords,
        importance: editBufferItem.importance,
      });
      toast('已保存修改', 'success');
      loadBuffer();
    } catch (err) {
      console.error('保存失败:', err);
      toast('保存失败', 'error');
    } finally {
      setIsSavingBuffer(false);
    }
  }, [editBufferItem, loadBuffer]);

  /* 审批通过（勾选的条目） */
  const handleApprove = useCallback(async () => {
    if (checkedIds.size === 0) return;
    setIsApproving(true);
    try {
      const ids = Array.from(checkedIds);
      // 逐条确认（后端逐条重算大模型向量）
      let ok = 0;
      for (const id of ids) {
        try {
          await confirmBufferItem(id);
          ok++;
        } catch { /* skip */ }
      }
      toast(`已审批 ${ok} 条`, 'success');
      setCheckedIds(new Set());
      setSelectedBufferId(null);
      setEditBufferItem(null);
      loadBuffer();
    } catch (err) {
      console.error('审批失败:', err);
      toast('审批失败', 'error');
    } finally {
      setIsApproving(false);
    }
  }, [checkedIds, loadBuffer]);

  /* 丢弃单条 */
  const handleDiscardBuffer = useCallback(async (id: number) => {
    try {
      await discardBufferItem(id);
      if (selectedBufferId === id) {
        setSelectedBufferId(null);
        setEditBufferItem(null);
      }
      setCheckedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      loadBuffer();
    } catch (err) {
      console.error('丢弃失败:', err);
      toast('丢弃失败', 'error');
    }
  }, [selectedBufferId, loadBuffer]);

  /* 整理全部 pending */
  const handleConsolidateAll = useCallback(async () => {
    setIsApproving(true);
    try {
      const result = await consolidateBuffer();
      toast(`整理完成: ${result.confirmed} 条确认, ${result.failed} 条失败`, 'success');
      loadBuffer();
    } catch (err) {
      console.error('整理失败:', err);
      toast('整理失败', 'error');
    } finally {
      setIsApproving(false);
    }
  }, [loadBuffer]);

  /* ── 派生状态 ── */
  const hasFileChanges = editContent !== savedContent;

  if (!open) return null;

  /* ── 渲染 TDB 标签页 ── */
  const renderTdbTabs = () => (
    <div className="flex items-center gap-0.5 px-2 overflow-x-auto scrollbar-none">
      {tdbs
        .map(tdb => {
          const isActive = activeTdb === tdb.name;
          const label = tdb.name === 'buffer' && bufferStats && bufferStats.pending > 0
            ? `buffer(${bufferStats.pending})`
            : tdb.name;
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
                className="flex-1 text-xs bg-[#141413] border border-[#2a2926] rounded
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

  /* ── 渲染 buffer 内容 ── */
  const renderBufferContent = () => {
    const pendingItems = bufferItems.filter(i => i.status === 'pending');

    return (
      <>
        {/* 左栏：缓冲区列表 */}
        <div className="w-56 flex-shrink-0 border-r border-[#2a2926] bg-[#171715] flex flex-col">
          {/* 状态过滤 */}
          <div className="px-2 py-2 border-b border-[#2a2926] flex gap-0.5">
            {(['pending', 'confirmed', 'discarded'] as const).map(s => (
              <button
                key={s}
                onClick={() => setBufferStatusFilter(s)}
                className={`flex-1 py-1 rounded text-[10px] transition-colors cursor-pointer
                  ${bufferStatusFilter === s
                    ? 'bg-[#2a2926] text-slate-300'
                    : 'text-slate-600 hover:text-slate-400'
                  }`}
              >
                {s === 'pending' ? `待整理 (${bufferStats?.pending ?? 0})` :
                 s === 'confirmed' ? `已确认 (${bufferStats?.confirmed ?? 0})` :
                 `已丢弃 (${bufferStats?.discarded ?? 0})`}
              </button>
            ))}
          </div>

          {/* 全选 + 操作栏 */}
          {bufferStatusFilter === 'pending' && pendingItems.length > 0 && (
            <div className="px-3 py-1.5 border-b border-[#2a2926] flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkedIds.size === pendingItems.length && pendingItems.length > 0}
                  onChange={handleToggleAll}
                  className="rounded border-slate-600 accent-amber-500"
                />
                <span className="text-[10px] text-slate-500">全选</span>
              </label>
              <button
                onClick={handleApprove}
                disabled={checkedIds.size === 0 || isApproving}
                className="ml-auto px-2 py-0.5 rounded text-[10px] cursor-pointer
                  bg-amber-500/10 text-amber-400 border border-amber-500/20
                  hover:bg-amber-500/20
                  disabled:opacity-30 disabled:cursor-not-allowed
                  transition-colors"
              >
                {isApproving ? '审批中...' : `审批 (${checkedIds.size})`}
              </button>
            </div>
          )}

          {/* 条目列表 */}
          <div className="flex-1 overflow-y-auto scrollbar-lumen">
            {bufferItems.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-slate-700">
                  {bufferStatusFilter === 'pending' ? '暂无待整理条目' :
                   bufferStatusFilter === 'confirmed' ? '暂无已确认条目' : '暂无已丢弃条目'}
                </p>
              </div>
            ) : (
              bufferItems.map(item => (
                <BufferItemRow
                  key={item.id}
                  item={item}
                  isSelected={item.id === selectedBufferId}
                  isChecked={checkedIds.has(item.id)}
                  onSelect={() => handleSelectBufferItem(item)}
                  onToggleCheck={(e) => handleToggleCheck(item.id, e)}
                />
              ))
            )}
          </div>
        </div>

        {/* 中栏：详情编辑 */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[#2a2926]">
          {editBufferItem ? (
            <>
              <div className="px-4 py-2 border-b border-[#2a2926] bg-[#1c1c1a] flex items-center gap-3">
                {/* 分类选择 */}
                <select
                  value={editBufferItem.category}
                  onChange={e => setEditBufferItem(prev => prev ? { ...prev, category: e.target.value } : prev)}
                  className="text-xs bg-[#141413] border border-[#2a2926] rounded px-2 py-1
                    text-slate-300 outline-none cursor-pointer"
                >
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                  ))}
                </select>

                {/* 重要度 */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-600">重要度</span>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setEditBufferItem(prev => prev ? { ...prev, importance: n } : prev)}
                      className={`w-4 h-4 rounded text-[10px] cursor-pointer transition-colors
                        ${n <= editBufferItem.importance ? 'text-amber-400' : 'text-slate-700'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                {/* 来源 + 时间 */}
                <span className="text-[10px] text-slate-600 ml-auto">
                  {editBufferItem.source} · {editBufferItem.created_at?.slice(0, 16)}
                </span>
              </div>

              {/* 内容编辑 */}
              <textarea
                value={editBufferItem.content}
                onChange={e => setEditBufferItem(prev => prev ? { ...prev, content: e.target.value } : prev)}
                className="flex-1 w-full p-4 bg-transparent text-slate-300 text-sm
                  leading-relaxed resize-none outline-none font-mono
                  placeholder:text-slate-700"
                spellCheck={false}
              />

              {/* 操作栏 */}
              <div className="px-4 py-2 border-t border-[#2a2926] flex items-center gap-2">
                <button
                  onClick={handleSaveBufferEdit}
                  disabled={isSavingBuffer}
                  className="px-3 py-1 rounded-lg text-xs cursor-pointer
                    bg-[#CC7C5E]/15 text-[#CC7C5E] hover:bg-[#CC7C5E]/25
                    disabled:opacity-50 transition-colors"
                >
                  {isSavingBuffer ? '保存中...' : '保存修改'}
                </button>
                <button
                  onClick={() => handleDiscardBuffer(editBufferItem.id)}
                  className="px-3 py-1 rounded-lg text-xs cursor-pointer
                    text-slate-600 hover:text-red-400 hover:bg-red-400/10
                    transition-colors"
                >
                  丢弃
                </button>
                {editBufferItem.status === 'pending' && (
                  <button
                    onClick={async () => {
                      setIsApproving(true);
                      try {
                        await confirmBufferItem(editBufferItem.id);
                        toast('已审批通过', 'success');
                        setSelectedBufferId(null);
                        setEditBufferItem(null);
                        loadBuffer();
                      } catch (err) {
                        toast('审批失败', 'error');
                      } finally {
                        setIsApproving(false);
                      }
                    }}
                    disabled={isApproving}
                    className="ml-auto px-3 py-1 rounded-lg text-xs cursor-pointer
                      bg-amber-500/10 text-amber-400 border border-amber-500/20
                      hover:bg-amber-500/20
                      disabled:opacity-50 transition-colors"
                  >
                    审批通过
                  </button>
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
                <p className="text-xs text-slate-500">选择条目查看详情</p>
              </div>
            </div>
          )}
        </div>

        {/* 右栏：标签 + 元信息 */}
        <div className="w-52 flex-shrink-0 flex flex-col">
          <div className="px-3 py-1.5 border-b border-[#2a2926] bg-[#1c1c1a]">
            <span className="text-[10px] uppercase tracking-widest text-slate-600">标签</span>
          </div>
          <div className="flex-1 p-3 overflow-y-auto scrollbar-lumen">
            {editBufferItem ? (
              <>
                {/* 标签编辑 */}
                <div className="mb-3">
                  <input
                    value={editBufferItem.keywords.join(', ')}
                    onChange={e => setEditBufferItem(prev => prev
                      ? { ...prev, keywords: e.target.value.split(/[,，]\s*/).filter(Boolean) }
                      : prev
                    )}
                    placeholder="标签（逗号分隔）"
                    className="w-full text-xs bg-transparent border-b border-[#2a2926]
                      px-1 py-1 text-slate-300 placeholder:text-slate-700
                      outline-none focus:border-[#CC7C5E]/30"
                  />
                </div>

                {/* 元信息 */}
                <div className="space-y-2 text-[10px] text-slate-600">
                  <div className="flex justify-between">
                    <span>来源</span>
                    <span className="text-slate-400">{editBufferItem.source}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>状态</span>
                    <span className={
                      editBufferItem.status === 'pending' ? 'text-amber-400' :
                      editBufferItem.status === 'confirmed' ? 'text-emerald-400' :
                      'text-slate-500'
                    }>
                      {editBufferItem.status === 'pending' ? '待整理' :
                       editBufferItem.status === 'confirmed' ? '已确认' : '已丢弃'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>创建时间</span>
                    <span className="text-slate-400">{editBufferItem.created_at?.slice(0, 16)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ID</span>
                    <span className="text-slate-500 font-mono">{editBufferItem.id}</span>
                  </div>
                </div>

                {/* 批量操作 */}
                {bufferStatusFilter === 'pending' && bufferStats && bufferStats.pending > 0 && (
                  <div className="mt-6 pt-3 border-t border-[#2a2926]">
                    <button
                      onClick={handleConsolidateAll}
                      disabled={isApproving}
                      className="w-full py-1.5 rounded-lg text-xs cursor-pointer
                        bg-slate-700/30 text-slate-400 border border-slate-700/40
                        hover:bg-slate-700/50
                        disabled:opacity-50 transition-colors"
                    >
                      {isApproving ? '整理中...' : `整理全部 (${bufferStats.pending})`}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-700">选择条目查看标签和元信息</p>
            )}
          </div>
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
        {/* 左栏：条目/文件切换 */}
        <div className="w-56 flex-shrink-0 border-r border-[#2a2926] bg-[#171715] flex flex-col">
          {/* 视图切换 + 过滤 */}
          <div className="px-2 py-2 border-b border-[#2a2926]">
            <div className="flex items-center gap-1.5">
              {fileFolders.length > 0 && (
                <div className="flex gap-0.5 bg-[#141413] rounded p-0.5">
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
                      className="ml-auto text-[10px] bg-[#141413] border border-[#2a2926] rounded px-1.5 py-0.5
                        text-slate-400 outline-none cursor-pointer"
                    >
                      <option value="">全部来源</option>
                      {tdbStats && Object.keys(tdbStats.sources).map(src => (
                        <option key={src} value={src}>
                          {src === 'daily_note' ? '日记' : src === 'chat' ? '聊天' : src === 'upload' ? '上传' : src === 'manual' ? '手动导入' : src === 'buffer' ? '缓冲区' : src}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
              {tdbViewMode === 'files' && (
                <span className="text-[10px] text-slate-600">{fileFolders.reduce((s, f) => s + f.files.length, 0)} 文件</span>
              )}
            </div>
          </div>

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
              fileFolders.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-slate-700">无源文件</p>
                </div>
              ) : (
                fileFolders.map(folder => (
                  <div key={folder.path || folder.name}>
                    {folder.path && (
                      <div className="flex items-center gap-1.5 px-3 py-1">
                        <svg className="w-3 h-3 text-amber-700/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                        </svg>
                        <span className="text-xs text-slate-400">{folder.name}</span>
                        <span className="text-[10px] text-slate-700 ml-auto">{folder.files.length}</span>
                      </div>
                    )}
                    {folder.files.map(file => {
                      const isActive = selectedFilePath === file.path;
                      const chunkCount = tdbEntries.filter(e =>
                        e.source_path === file.path || e.source_path?.endsWith('/' + file.path)
                      ).length;
                      return (
                        <div
                          key={file.path}
                          className={`w-full flex items-center gap-1.5 px-3 py-1 cursor-pointer transition-colors duration-100
                            ${folder.path ? 'pl-7' : 'pl-3'}
                            ${isActive
                              ? 'bg-[#CC7C5E]/08 text-slate-200'
                              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                          onClick={() => {
                            setSelectedFilePath(file.path);
                            setSelectedEntryId(null);
                          }}
                        >
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0-1.125-.504-1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          <span className="text-xs truncate">{file.name}</span>
                          {chunkCount === 0 ? (
                            <span className="text-[9px] text-amber-500/80 ml-auto mr-1">未导入</span>
                          ) : (
                            <span className="text-[10px] text-slate-700 ml-auto">{chunkCount}段</span>
                          )}
                          {(chunkCount === 0) && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const result = await importTdbFile(activeTdb, file.path);
                                  toast(`导入成功，${result.chunks} 个片段`, 'success');
                                  loadTdbEntries();
                                  loadFileTree();
                                } catch (err: any) {
                                  if (err.message?.includes('409')) {
                                    toast('该文件已在向量库中', 'info');
                                  } else {
                                    toast(err.message || '导入失败', 'error');
                                  }
                                }
                              }}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400
                                hover:bg-amber-500/25 transition-colors flex-shrink-0 cursor-pointer"
                            >
                              导入
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )
            )}
          </div>
        </div>

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
                <button
                  onClick={async () => {
                    if (!displayEntry?.id) return;
                    const tdbName = activeTdb as 'knowledge' | 'memory';
                    try {
                      await deleteTdbEntry(tdbName, displayEntry!.id!);
                      toast('已删除', 'success');
                      setSelectedEntryId(null);
                      loadTdbEntries();
                    } catch (err) {
                      toast('删除失败', 'error');
                    }
                  }}
                  className="px-3 py-1 rounded-lg text-xs cursor-pointer
                    text-slate-600 hover:text-red-400 hover:bg-red-400/08 transition-colors ml-auto"
                >
                  删除
                </button>
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
                      className="w-full mt-1 text-[10px] bg-[#141413] border border-[#2a2926] rounded px-1.5 py-0.5
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
                      className="w-full mt-1 text-[10px] bg-[#141413] border border-[#2a2926] rounded px-1.5 py-0.5
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
      <div className="absolute inset-0 bg-[#141413]/80 backdrop-blur-sm animate-overlay-fade-in" />

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
          {/* 编辑器模式切换 */}
          <div className="flex gap-0.5 bg-[#141413] rounded-lg p-0.5">
            <button
              onClick={() => setEditorMode('file')}
              className={`px-2.5 py-1 rounded-md text-[11px] transition-all duration-150 cursor-pointer
                ${editorMode === 'file'
                  ? 'bg-[#2a2926] text-slate-200'
                  : 'text-slate-600 hover:text-slate-400'
                }`}
            >
              文件编辑器
            </button>
            <button
              onClick={() => setEditorMode('graph')}
              className={`px-2.5 py-1 rounded-md text-[11px] transition-all duration-150 cursor-pointer
                ${editorMode === 'graph'
                  ? 'bg-[#2a2926] text-slate-200'
                  : 'text-slate-600 hover:text-slate-400'
                }`}
            >
              图谱编辑器
            </button>
          </div>

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
                  className="w-32 text-[11px] bg-[#141413] border border-[#2a2926] rounded-lg
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
          {editorMode === 'file' ? (
            activeTdb === 'daily_note' ? renderDailyNoteContent() :
            activeTdb === 'buffer' ? renderBufferContent() :
            (activeTdb === 'knowledge' || activeTdb === 'memory') ? renderTdbBrowser() :
            renderDailyNoteContent()
          ) : (
            /* 图谱编辑器模式 */
            activeTdb === 'daily_note' ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto mb-3 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <p className="text-xs text-slate-500">日记无图谱数据</p>
                  <p className="text-[10px] text-slate-700 mt-1">切换到其他 TDB 标签查看图谱</p>
                </div>
              </div>
            ) : (
              <GraphEditor tdb={activeTdb} />
            )
          )}
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
