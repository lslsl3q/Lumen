/**
 * 模型选择下拉组件（Combobox）
 *
 * 功能：
 * - 从后端 API 拉取可用模型列表
 * - 支持搜索过滤
 * - 支持手动输入自定义模型名
 * - API 失败时降级为纯文本输入
 */
import { useState, useEffect, useRef } from 'react';
import { listModels, ModelInfo } from '../api/models';

interface ModelSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}

function ModelSelect({ value, onChange, placeholder = '选择或输入模型名', allowEmpty = true }: ModelSelectProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 加载模型列表
  useEffect(() => {
    let cancelled = false;
    listModels()
      .then(data => {
        if (!cancelled) setModels(data.models);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => { cancelled = true; };
  }, []);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // API 失败：降级为纯文本输入
  if (loadError) {
    return (
      <div>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="
            w-full bg-slate-900/60 border border-slate-700/60 rounded-lg
            px-3 py-2 text-sm text-slate-300 placeholder-slate-600
            focus:outline-none focus:border-amber-500/50
          "
        />
        <p className="text-xs text-amber-500/60 mt-1">无法获取模型列表，请手动输入</p>
      </div>
    );
  }

  // 过滤模型
  const filtered = filter
    ? models.filter(m => m.id.toLowerCase().includes(filter.toLowerCase()))
    : models;

  const handleSelect = (modelId: string) => {
    onChange(modelId);
    setFilter('');
    setIsOpen(false);
  };

  const handleInputChange = (text: string) => {
    onChange(text);
    setFilter(text);
    if (!isOpen) setIsOpen(true);
  };

  const handleFocus = () => {
    setIsOpen(true);
    setFilter(value);
  };

  const inputClass = `
    w-full bg-slate-900/60 border rounded-lg
    px-3 py-2 text-sm text-slate-300 placeholder-slate-600
    focus:outline-none focus:border-amber-500/50
    ${isOpen ? 'border-amber-500/50' : 'border-slate-700/60'}
  `;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        placeholder={placeholder}
        className={inputClass}
      />

      {/* 下拉列表 */}
      {isOpen && (
        <div className="
          absolute z-50 top-full left-0 right-0 mt-1
          bg-slate-900 border border-slate-700/60 rounded-lg
          shadow-xl shadow-black/40 max-h-60 overflow-y-auto
          scrollbar-lumen
        ">
          {/* 留空选项 */}
          {allowEmpty && (
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`
                w-full text-left px-3 py-2 text-sm
                hover:bg-amber-500/10 transition-colors
                ${!value ? 'text-amber-400' : 'text-slate-400'}
              `}
            >
              （留空使用全局默认）
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-600">
              {models.length === 0 ? '加载中...' : '没有匹配的模型'}
            </div>
          ) : (
            filtered.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => handleSelect(model.id)}
                className={`
                  w-full text-left px-3 py-2 text-sm transition-colors
                  hover:bg-amber-500/10
                  ${value === model.id ? 'text-amber-400 bg-amber-500/5' : 'text-slate-300'}
                `}
              >
                <span className="font-mono">{model.id}</span>
                {model.owned_by && (
                  <span className="text-slate-600 ml-2 text-xs">{model.owned_by}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default ModelSelect;
