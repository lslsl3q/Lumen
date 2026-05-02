/**
 * 模型选择下拉组件（Shadcn Combobox）
 *
 * 从后端 API 拉取可用模型列表，支持搜索过滤和自定义输入。
 * API 失败时降级为纯文本输入。
 */
import { useState, useEffect } from 'react';
import { listModels, ModelInfo } from '../api/models';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';

interface ModelSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}

function ModelSelect({ value, onChange, placeholder = '选择或输入模型名', allowEmpty = true }: ModelSelectProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadError, setLoadError] = useState(false);

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

  if (loadError) {
    return (
      <div>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-input/30 border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-hidden focus:border-ring"
        />
        <p className="text-xs text-primary/60 mt-1">无法获取模型列表，请手动输入</p>
      </div>
    );
  }

  return (
    <Combobox
      value={value}
      onValueChange={(v) => onChange(v ?? '')}
    >
      <ComboboxInput
        placeholder={placeholder}
        disabled={models.length === 0}
        className="w-full"
      />
      <ComboboxContent className="min-w-[320px]">
        <ComboboxList>
          {allowEmpty && (
            <ComboboxItem value="">（留空使用全局默认）</ComboboxItem>
          )}
          {models.map(model => (
            <ComboboxItem key={model.id} value={model.id}>
              <span className="font-mono text-sm">{model.id}</span>
              {model.owned_by && (
                <span className="text-muted-foreground ml-2 text-xs">{model.owned_by}</span>
              )}
            </ComboboxItem>
          ))}
          <ComboboxEmpty>
            {models.length === 0 ? '加载中...' : '没有匹配的模型'}
          </ComboboxEmpty>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export default ModelSelect;
