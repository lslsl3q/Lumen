/**
 * 斜杠命令补全浮窗
 * 输入 / 时显示在输入框上方
 */
import { useState, useEffect } from 'react';
import { getAllCommands, parseCommand } from '../commands/registry';
import type { SlashCommand } from '../commands/registry';

interface CommandPaletteProps {
  input: string;
  onSelect: (command: string) => void;
  visible: boolean;
}

function CommandPalette({ input, onSelect, visible }: CommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const commands = getAllCommands();

  // 根据输入过滤命令
  const parsed = parseCommand(input);
  const filtered = parsed
    ? commands.filter((c) => c.name.startsWith(parsed!.name))
    : commands;

  // 输入变化时重置选中
  useEffect(() => {
    setSelectedIndex(0);
  }, [input]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      className="
        absolute bottom-full left-0 right-0 mb-1
        bg-slate-900 border border-slate-700/60 rounded-lg
        shadow-xl shadow-black/40 overflow-hidden z-50
        max-h-48 overflow-y-auto
      "
    >
      {filtered.map((cmd: SlashCommand, idx: number) => (
        <button
          key={cmd.name}
          onClick={() => onSelect(cmd.name)}
          onMouseEnter={() => setSelectedIndex(idx)}
          className={`
            w-full px-3 py-2 flex items-center gap-2 text-left text-sm
            transition-all duration-75
            ${idx === selectedIndex
              ? 'bg-amber-500/10 text-amber-300'
              : 'text-slate-400 hover:bg-slate-800/60'
            }
          `}
        >
          <span className="font-mono text-xs">/{cmd.name}</span>
          <span className="text-slate-500 text-xs flex-1 truncate">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}

export default CommandPalette;
