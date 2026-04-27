/**
 * 斜杠命令补全浮窗
 * 输入 / 时显示在输入框上方
 * 键盘导航由父组件 ChatPanel 通过 props 驱动
 */
import { getAllCommands, parseCommand } from '../commands/registry';
import type { SlashCommand } from '../commands/registry';

interface CommandPaletteProps {
  input: string;
  visible: boolean;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (index: number) => void;
}

function CommandPalette({ input, visible, selectedIndex, onSelect, onHover }: CommandPaletteProps) {
  const commands = getAllCommands();

  const parsed = parseCommand(input);
  const filtered = parsed
    ? commands.filter((c) => c.name.startsWith(parsed!.name))
    : commands;

  if (!visible || filtered.length === 0) return null;

  const safeIndex = Math.min(selectedIndex, filtered.length - 1);

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
          onClick={() => onSelect(cmd)}
          onMouseEnter={() => onHover(idx)}
          className={`
            w-full px-3 py-2 flex items-center gap-2 text-left text-sm
            transition-all duration-75
            ${idx === safeIndex
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
export type { CommandPaletteProps };
