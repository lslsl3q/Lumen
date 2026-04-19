/**
 * Persona 编辑器 — 创建/编辑 Persona
 *
 * 路由：
 *   /settings/personas/new?id=xxx&name=xxx  → 新建模式（从列表页传参）
 *   /settings/personas/:id                  → 编辑模式
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getPersona,
  createPersona as apiCreate,
  updatePersona as apiUpdate,
} from '../api/persona';
import * as avatarApi from '../api/avatar';
import type { AvatarItem } from '../types/avatar';

function PersonaEditor() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEditMode = !!id;

  // 表单状态
  const [personaId, setPersonaId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [traits, setTraits] = useState<string[]>([]);
  const [newTrait, setNewTrait] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [availableAvatars, setAvailableAvatars] = useState<AvatarItem[]>([]);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 加载头像列表
  useEffect(() => {
    (async () => {
      try {
        const avatars = await avatarApi.listAvatars();
        setAvailableAvatars(avatars);
      } catch (err) {
        console.error('加载头像列表失败:', err);
      }
    })();
  }, []);

  // 加载已有数据（编辑模式）
  useEffect(() => {
    if (!isEditMode) {
      // 新建模式：从 URL 参数获取初始值
      setPersonaId(searchParams.get('id') || '');
      setName(searchParams.get('name') || '');
      return;
    }

    (async () => {
      try {
        setIsLoading(true);
        const data = await getPersona(id!);
        setPersonaId(id!);
        setName(data.name);
        setDescription(data.description);
        setTraits(data.traits || []);
        setAvatar(data.avatar || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id, isEditMode, searchParams]);

  /** 添加特征标签 */
  const handleAddTrait = useCallback(() => {
    const t = newTrait.trim();
    if (t && !traits.includes(t)) {
      setTraits(prev => [...prev, t]);
      setNewTrait('');
    }
  }, [newTrait, traits]);

  /** 删除特征标签 */
  const handleRemoveTrait = useCallback((index: number) => {
    setTraits(prev => prev.filter((_, i) => i !== index));
  }, []);

  /** 保存 */
  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('名称不能为空');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      if (isEditMode) {
        await apiUpdate(personaId, {
          name: trimmedName,
          description: description.trim(),
          traits,
          avatar: avatar ?? undefined,
        });
      } else {
        const trimmedId = personaId.trim();
        if (!trimmedId) {
          setError('ID 不能为空');
          return;
        }
        await apiCreate({
          id: trimmedId,
          name: trimmedName,
          description: description.trim(),
          traits,
        });
      }

      setSuccessMsg('保存成功');
      setTimeout(() => {
        navigate('/settings/personas');
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }, [isEditMode, personaId, name, description, traits, avatar, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-deep flex items-center justify-center text-slate-600">
        加载中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-deep text-slate-200">
      <div className="max-w-2xl mx-auto px-6 py-6">
        {/* 顶栏 */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/settings/personas')}
            className="
              px-3 py-1.5 rounded-lg text-sm text-slate-400
              hover:text-slate-200 hover:bg-slate-800/60
              transition-all duration-150
            "
          >
            &larr; 返回列表
          </button>
          <h1 className="text-xl font-light tracking-wide">
            {isEditMode ? '编辑 Persona' : '新建 Persona'}
          </h1>
        </div>

        {/* 错误 / 成功 */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            {successMsg}
          </div>
        )}

        {/* 表单 */}
        <div className="space-y-6">
          {/* ID（仅新建模式可编辑） */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">ID</label>
            <input
              value={personaId}
              onChange={e => !isEditMode && setPersonaId(e.target.value)}
              disabled={isEditMode}
              placeholder="英文，用于文件名（如 developer）"
              className="
                w-full px-3 py-2 rounded-lg text-sm bg-slate-800/60
                border border-slate-700/60 text-slate-200
                placeholder:text-slate-600 disabled:opacity-50
                focus:border-indigo-500/40 focus:outline-none
                transition-all duration-150
              "
            />
          </div>

          {/* 名称 */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">名称</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="你的身份名称（如：张三、剑无名）"
              className="
                w-full px-3 py-2 rounded-lg text-sm bg-slate-800/60
                border border-slate-700/60 text-slate-200
                placeholder:text-slate-600
                focus:border-indigo-500/40 focus:outline-none
                transition-all duration-150
              "
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">描述</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="描述你的身份（如：一个 Python 后端开发者，主要用 FastAPI）"
              rows={4}
              className="
                w-full px-3 py-2 rounded-lg text-sm bg-slate-800/60
                border border-slate-700/60 text-slate-200
                placeholder:text-slate-600 resize-y
                focus:border-indigo-500/40 focus:outline-none
                transition-all duration-150
              "
            />
          </div>

          {/* 头像选择 */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">头像</label>
            {avatar ? (
              <div className="flex items-center gap-4 mb-3">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-800/40 border border-slate-700/60">
                  <img
                    src={avatar}
                    alt="当前头像"
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  onClick={() => setAvatar(null)}
                  className="
                    px-3 py-1.5 rounded-lg text-sm
                    bg-red-500/10 text-red-400 border border-red-500/20
                    hover:bg-red-500/20
                    transition-all duration-150
                  "
                >
                  移除头像
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAvatarPicker(true)}
                className="
                  w-full px-3 py-8 rounded-lg text-sm
                  bg-slate-800/60 border border-dashed border-slate-700/60
                  text-slate-500 hover:text-slate-400 hover:border-slate-600/60
                  transition-all duration-150
                "
              >
                + 选择头像
              </button>
            )}
          </div>

          {/* 特征标签 */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">特征标签</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {traits.map((trait, i) => (
                <span
                  key={i}
                  className="
                    px-3 py-1 rounded-full text-sm
                    bg-indigo-500/10 text-indigo-300 border border-indigo-500/20
                    flex items-center gap-1.5
                  "
                >
                  {trait}
                  <button
                    onClick={() => handleRemoveTrait(i)}
                    className="text-indigo-400/60 hover:text-indigo-300 transition-colors"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newTrait}
                onChange={e => setNewTrait(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTrait())}
                placeholder="添加特征（如：喜欢简洁代码）"
                className="
                  flex-1 px-3 py-2 rounded-lg text-sm bg-slate-800/60
                  border border-slate-700/60 text-slate-200
                  placeholder:text-slate-600
                  focus:border-indigo-500/40 focus:outline-none
                  transition-all duration-150
                "
              />
              <button
                onClick={handleAddTrait}
                disabled={!newTrait.trim()}
                className="
                  px-4 py-2 rounded-lg text-sm
                  bg-indigo-500/10 text-indigo-400 border border-indigo-500/20
                  hover:bg-indigo-500/20 disabled:opacity-40
                  transition-all duration-150
                "
              >
                添加
              </button>
            </div>
          </div>

          {/* 保存按钮 */}
          <div className="pt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="
                px-6 py-2.5 rounded-lg text-sm font-medium
                bg-indigo-500/20 text-indigo-300 border border-indigo-500/30
                hover:bg-indigo-500/30 disabled:opacity-40
                transition-all duration-150
              "
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        {/* 头像选择器弹窗 */}
        {showAvatarPicker && (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => setShowAvatarPicker(false)}
          >
            <div
              className="bg-slate-900 rounded-xl border border-slate-700/60 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* 弹窗标题 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
                <h3 className="text-lg text-slate-200">选择头像</h3>
                <button
                  onClick={() => setShowAvatarPicker(false)}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ×
                </button>
              </div>

              {/* 头像网格 */}
              <div className="flex-1 overflow-y-auto p-6">
                {availableAvatars.length === 0 ? (
                  <div className="text-center py-12 text-slate-600">
                    <p className="mb-2">暂无头像</p>
                    <p className="text-sm">请先在设置中上传头像</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
                    {availableAvatars.map(av => (
                      <button
                        key={av.id}
                        onClick={() => {
                          setAvatar(av.url);
                          setShowAvatarPicker(false);
                        }}
                        className={`
                          aspect-square rounded-lg overflow-hidden border-2 transition-all
                          ${avatar === av.url
                            ? 'border-amber-500 ring-2 ring-amber-500/30'
                            : 'border-slate-700/60 hover:border-slate-600'
                          }
                        `}
                      >
                        <img
                          src={av.url}
                          alt={av.filename}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 底部按钮 */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700/60">
                <button
                  onClick={() => navigate('/settings/avatars')}
                  className="
                    px-4 py-2 rounded-lg text-sm
                    bg-slate-800/60 text-slate-400 border border-slate-700/60
                    hover:bg-slate-800/80 hover:text-slate-300
                    transition-all duration-150
                  "
                >
                  上传新头像
                </button>
                <button
                  onClick={() => setShowAvatarPicker(false)}
                  className="
                    px-4 py-2 rounded-lg text-sm
                    bg-indigo-500/20 text-indigo-300 border border-indigo-500/30
                    hover:bg-indigo-500/30
                    transition-all duration-150
                  "
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PersonaEditor;
