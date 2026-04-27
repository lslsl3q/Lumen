/**
 * 缓冲区设置页 — 开关、整理模型、自动清理、统计
 */
import { useState, useEffect, useCallback } from 'react';
import type { SettingsPageProps } from '../types/settings';
import {
  getBufferSettings,
  toggleBuffer,
  updateBufferSettings,
  consolidateBuffer,
  cleanupBuffer,
} from '../api/buffer';
import type { BufferSettings, BufferStats } from '../api/buffer';
import { toast } from '../utils/toast';

function BufferSettingsPage(_props: SettingsPageProps) {
  const [settings, setSettings] = useState<BufferSettings | null>(null);
  const [stats, setStats] = useState<BufferStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);

  /* 加载设置+统计 */
  const loadSettings = useCallback(async () => {
    try {
      const data = await getBufferSettings();
      setSettings(data.settings);
      setStats(data.stats);
    } catch (err) {
      console.error('加载缓冲区设置失败:', err);
      toast('加载缓冲区设置失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  /* 切换开关 */
  const handleToggle = useCallback(async () => {
    if (!settings) return;
    setIsToggling(true);
    try {
      const next = !settings.buffer_enabled;
      await toggleBuffer(next);
      setSettings(prev => prev ? { ...prev, buffer_enabled: next } : prev);
      toast(next ? '缓冲区已开启' : '缓冲区已关闭', 'success');
    } catch (err) {
      console.error('切换失败:', err);
      toast('切换失败', 'error');
    } finally {
      setIsToggling(false);
    }
  }, [settings]);

  /* 保存设置 */
  const handleSave = useCallback(async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateBufferSettings({
        buffer_auto_cleanup: settings.buffer_auto_cleanup,
        buffer_auto_consolidate_threshold: settings.buffer_auto_consolidate_threshold,
        buffer_consolidation_model: settings.buffer_consolidation_model,
      });
      toast('设置已保存', 'success');
    } catch (err) {
      console.error('保存失败:', err);
      toast('保存失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  /* 整理全部 */
  const handleConsolidate = useCallback(async () => {
    setIsConsolidating(true);
    try {
      const result = await consolidateBuffer();
      toast(`整理完成: ${result.confirmed} 条确认, ${result.failed} 条失败`, 'success');
      loadSettings();
    } catch (err) {
      console.error('整理失败:', err);
      toast('整理失败', 'error');
    } finally {
      setIsConsolidating(false);
    }
  }, [loadSettings]);

  /* 清理 */
  const handleCleanup = useCallback(async () => {
    setIsCleaning(true);
    try {
      const result = await cleanupBuffer();
      toast(result.message, 'success');
      loadSettings();
    } catch (err) {
      console.error('清理失败:', err);
      toast('清理失败', 'error');
    } finally {
      setIsCleaning(false);
    }
  }, [loadSettings]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-slate-600">
        加载中...
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-slate-600">
        加载失败
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl">
      <h2 className="text-sm font-medium text-slate-300 mb-1">缓冲区</h2>
      <p className="text-[10px] text-slate-600 mb-6">
        新记忆暂存区 — 小模型向量临时存储，审批后写入正式知识库
      </p>

      {/* 开关 */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-slate-300">启用缓冲区</span>
            <p className="text-[10px] text-slate-600 mt-0.5">
              关闭后新内容直接写入知识库，已有缓冲区数据仍可搜索
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={isToggling}
            className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 cursor-pointer
              ${settings.buffer_enabled ? 'bg-amber-500/80' : 'bg-slate-700'}`}
          >
            <span
              className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform duration-200
                ${settings.buffer_enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
      </div>

      {/* 设置项 */}
      <div className="space-y-4 mb-6 p-4 rounded-lg bg-[#141413] border border-[#2a2926]">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">整理模型</label>
          <input
            type="text"
            value={settings.buffer_consolidation_model}
            onChange={e => setSettings(prev => prev ? { ...prev, buffer_consolidation_model: e.target.value } : prev)}
            placeholder="留空则跟随聊天模型"
            className="w-full px-3 py-2 rounded-lg text-sm
              bg-slate-800/40 border border-slate-700/40
              text-slate-200 placeholder:text-slate-600
              outline-none focus:border-amber-500/40 transition-colors"
          />
          <p className="text-[10px] text-slate-600 mt-1">
            审批时用此模型重新计算向量，空=使用默认聊天模型
          </p>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">自动整理阈值</label>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.buffer_auto_consolidate_threshold}
            onChange={e => setSettings(prev => prev ? { ...prev, buffer_auto_consolidate_threshold: parseInt(e.target.value) || 20 } : prev)}
            className="w-full px-3 py-2 rounded-lg text-sm
              bg-slate-800/40 border border-slate-700/40
              text-slate-200
              outline-none focus:border-amber-500/40 transition-colors"
          />
          <p className="text-[10px] text-slate-600 mt-1">
            待整理条目达到此数量时自动触发（需启用缓冲区）
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400">自动清理已审批记录</span>
            <p className="text-[10px] text-slate-600 mt-0.5">
              整理后自动删除缓冲区中的已确认/已丢弃条目
            </p>
          </div>
          <button
            onClick={() => setSettings(prev => prev ? { ...prev, buffer_auto_cleanup: !prev.buffer_auto_cleanup } : prev)}
            className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 cursor-pointer
              ${settings.buffer_auto_cleanup ? 'bg-amber-500/80' : 'bg-slate-700'}`}
          >
            <span
              className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform duration-200
                ${settings.buffer_auto_cleanup ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="mb-6">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-5 py-2 rounded-lg text-sm font-medium
            bg-amber-500/10 border border-amber-500/30 text-amber-400
            hover:bg-amber-500/20 hover:border-amber-500/50
            disabled:opacity-30 disabled:cursor-not-allowed
            transition-all duration-200 cursor-pointer"
        >
          {isSaving ? '保存中...' : '保存设置'}
        </button>
      </div>

      {/* 统计 + 操作 */}
      {stats && stats.enabled ? (
        <div className="p-4 rounded-lg bg-[#141413] border border-[#2a2926]">
          <h3 className="text-xs font-medium text-slate-400 mb-3">缓冲区统计</h3>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-2 rounded bg-slate-800/30">
              <div className="text-lg text-amber-400 font-mono">{stats.pending ?? 0}</div>
              <div className="text-[10px] text-slate-600">待整理</div>
            </div>
            <div className="text-center p-2 rounded bg-slate-800/30">
              <div className="text-lg text-emerald-400 font-mono">{stats.confirmed ?? 0}</div>
              <div className="text-[10px] text-slate-600">已确认</div>
            </div>
            <div className="text-center p-2 rounded bg-slate-800/30">
              <div className="text-lg text-slate-500 font-mono">{stats.discarded ?? 0}</div>
              <div className="text-[10px] text-slate-600">已丢弃</div>
            </div>
          </div>

          {stats.sources && Object.keys(stats.sources).length > 0 && (
            <div className="mb-4">
              <span className="text-[10px] text-slate-600">来源: </span>
              {Object.entries(stats.sources).map(([src, count]) => (
                <span key={src} className="inline-flex items-center gap-1 mr-2 text-[10px] text-slate-500">
                  {src}
                  <span className="text-slate-700">({count})</span>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleConsolidate}
              disabled={isConsolidating || !stats.pending}
              className="px-3 py-1.5 rounded-lg text-xs cursor-pointer
                bg-amber-500/10 text-amber-400 border border-amber-500/20
                hover:bg-amber-500/20 hover:border-amber-500/40
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-200"
            >
              {isConsolidating ? '整理中...' : `整理全部 (${stats.pending ?? 0})`}
            </button>
            <button
              onClick={handleCleanup}
              disabled={isCleaning || ((stats.confirmed ?? 0) + (stats.discarded ?? 0) === 0)}
              className="px-3 py-1.5 rounded-lg text-xs cursor-pointer
                bg-slate-700/30 text-slate-400 border border-slate-700/40
                hover:bg-slate-700/50 hover:border-slate-700/60
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-200"
            >
              {isCleaning ? '清理中...' : '清理已完成'}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-[#141413] border border-[#2a2926]">
          <p className="text-xs text-slate-600">启用缓冲区后显示统计数据</p>
        </div>
      )}
    </div>
  );
}

export default BufferSettingsPage;
