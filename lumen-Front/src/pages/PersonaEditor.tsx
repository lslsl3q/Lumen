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
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
  }, [isEditMode, personaId, name, description, traits, navigate]);

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
      </div>
    </div>
  );
}

export default PersonaEditor;
