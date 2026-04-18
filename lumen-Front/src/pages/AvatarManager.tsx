/**
 * 头像管理页面
 *
 * 职责：显示所有已上传头像，支持上传、删除
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/avatar';
import type { AvatarItem } from '../types/avatar';

function AvatarManager() {
  const navigate = useNavigate();
  const [avatars, setAvatars] = useState<AvatarItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const list = await api.listAvatars();
      setAvatars(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setError(null);

      await api.uploadAvatar(file);
      await loadList(); // 刷新列表
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setIsUploading(false);
      // 清空 input，允许重复上传同一文件
      e.target.value = '';
    }
  };

  const handleDelete = async (avatar: AvatarItem) => {
    if (!confirm(`确定删除头像「${avatar.filename}」吗？`)) return;

    try {
      await api.deleteAvatar(avatar.id);
      await loadList(); // 刷新列表
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* 顶栏 */}
      <div className="flex items-center gap-4 mb-8 px-6 py-4">
        <button
          onClick={() => navigate('/settings/config')}
          className="text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← 返回设置
        </button>
        <h1 className="text-2xl font-bold">头像管理</h1>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 text-red-400 hover:text-red-300"
          >
            ×
          </button>
        </div>
      )}

      {/* 上传区域 */}
      <div className="max-w-6xl mx-auto px-6 mb-8">
        <div className="p-6 rounded-xl bg-slate-900/60 border border-dashed border-amber-500/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-slate-200 mb-1">上传新头像</h3>
              <p className="text-sm text-slate-500">支持 PNG、JPG、GIF、WebP 格式，最大 5MB</p>
            </div>
            <label className="
              px-4 py-2 rounded-lg text-sm font-medium
              bg-amber-500/10 border border-amber-500/30 text-amber-400
              hover:bg-amber-500/20 transition-all
              cursor-pointer
            ">
              {isUploading ? '上传中...' : '选择文件'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 头像列表 */}
      <div className="max-w-6xl mx-auto px-6">
        {isLoading ? (
          <div className="text-center py-16 text-slate-600">加载中...</div>
        ) : avatars.length === 0 ? (
          <div className="text-center py-16 text-slate-600">
            <p className="mb-4">还没有上传头像</p>
            <p className="text-sm">点击上方「选择文件」上传第一个头像</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {avatars.map((avatar) => (
              <div
                key={avatar.id}
                className="group relative p-3 rounded-xl bg-slate-900/60 border border-slate-800/40 hover:border-amber-500/30 transition-all"
              >
                {/* 头像图片 */}
                <div className="aspect-square rounded-lg overflow-hidden bg-slate-800/40 mb-2">
                  <img
                    src={avatar.url}
                    alt={avatar.filename}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* 文件名 */}
                <div className="text-xs text-slate-500 truncate mb-1" title={avatar.filename}>
                  {avatar.filename}
                </div>

                {/* 大小 */}
                <div className="text-[10px] text-slate-600">
                  {(avatar.size / 1024).toFixed(1)} KB
                </div>

                {/* 删除按钮 */}
                <button
                  onClick={() => handleDelete(avatar)}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center"
                  title="删除头像"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AvatarManager;
