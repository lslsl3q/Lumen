/**
 * 环境变量表单编辑器
 *
 * 职责：将 .env 文本解析为键值对表单，用户编辑后序列化回 .env 格式
 * 纯渲染组件，数据来自 props
 */
import { useState, useMemo } from 'react';

/** 字段元信息：哪些字段需要特殊处理 */
const FIELD_META: Record<string, { label: string; type: 'text' | 'password'; placeholder: string }> = {
  API_URL: { label: 'API 地址', type: 'text', placeholder: 'http://127.0.0.1:4000/v1' },
  API_KEY: { label: 'API 密钥', type: 'password', placeholder: 'sk-...' },
  MODEL: { label: '默认模型', type: 'text', placeholder: 'deepseek-chat' },
  SUMMARY_MODEL: { label: '摘要模型', type: 'text', placeholder: '留空则跟随默认模型（用于上下文压缩）' },
  SEARCH_PROXY: { label: '搜索代理', type: 'text', placeholder: 'http://127.0.0.1:7897' },
  FETCH_PROXY: { label: '抓取代理', type: 'text', placeholder: 'http://127.0.0.1:7897' },
  LLM_TIMEOUT: { label: 'LLM 超时（秒）', type: 'text', placeholder: '60' },
  MAX_TOOL_ITERATIONS: { label: '工具最大轮次', type: 'text', placeholder: '10' },
};

/** 解析 .env 文本 → {注释行列表, 键值对} */
function parseEnv(content: string): { lines: EnvLine[]; values: Record<string, string> } {
  const lines: EnvLine[] = [];
  const values: Record<string, string> = {};

  for (const raw of content.split('\n')) {
    const trimmed = raw.trim();
    // 注释行或空行
    if (trimmed === '' || trimmed.startsWith('#')) {
      lines.push({ type: 'comment', text: raw });
      continue;
    }
    // 键值对
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      lines.push({ type: 'kv', key });
      values[key] = value;
    } else {
      lines.push({ type: 'comment', text: raw });
    }
  }
  return { lines, values };
}

/** 序列化回 .env 文本 */
function serializeEnv(lines: EnvLine[], values: Record<string, string>): string {
  return lines
    .map(line => {
      if (line.type === 'comment') return line.text;
      return `${line.key}=${values[line.key] ?? ''}`;
    })
    .join('\n');
}

type EnvLine = { type: 'comment'; text: string } | { type: 'kv'; key: string };

interface EnvFormProps {
  content: string;
  onSave: (content: string) => Promise<void>;
  isSaving: boolean;
}

function EnvForm({ content, onSave, isSaving }: EnvFormProps) {
  // 解析 .env 内容
  const parsed = useMemo(() => parseEnv(content), [content]);
  const [values, setValues] = useState<Record<string, string>>(parsed.values);
  const [showKey, setShowKey] = useState(false);

  // 提取所有键值对行
  const kvLines = parsed.lines.filter((l): l is EnvLine & { type: 'kv' } => l.type === 'kv');

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const newContent = serializeEnv(parsed.lines, values);
    await onSave(newContent);
  };

  // 检查是否有修改
  const hasChanges = Object.keys(values).some(k => values[k] !== parsed.values[k]);

  return (
    <div className="space-y-4">
      {kvLines.map(({ key }) => {
        const meta = FIELD_META[key] || { label: key, type: 'text' as const, placeholder: '' };
        const isPassword = meta.type === 'password';

        return (
          <div key={key}>
            <label className="block text-sm text-slate-400 mb-1.5">{meta.label}</label>
            <div className="relative">
              <input
                type={isPassword && !showKey ? 'password' : 'text'}
                value={values[key] ?? ''}
                onChange={e => handleChange(key, e.target.value)}
                placeholder={meta.placeholder}
                className="
                  w-full px-4 py-2.5 rounded-lg text-sm
                  bg-slate-800/40 border border-slate-700/40
                  text-slate-200 placeholder-slate-600
                  focus:outline-none focus:border-teal-500/40
                  transition-all duration-200
                "
              />
            </div>
          </div>
        );
      })}

      {/* 显示/隐藏密钥 */}
      {values['API_KEY'] && (
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showKey}
            onChange={e => setShowKey(e.target.checked)}
            className="rounded border-slate-600"
          />
          显示密钥
        </label>
      )}

      {/* 保存按钮 */}
      <div className="flex justify-end pt-4 border-t border-slate-800/40">
        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="
            px-5 py-2.5 rounded-lg text-sm font-medium
            bg-teal-500/10 border border-teal-500/30 text-teal-400
            hover:bg-teal-500/20 hover:border-teal-500/50
            disabled:opacity-30 disabled:cursor-not-allowed
            transition-all duration-200
          "
        >
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}

export default EnvForm;
