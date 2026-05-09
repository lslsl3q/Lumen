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
        bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg
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
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
            }
          `}
        >
          <span className="font-mono text-xs">/{cmd.name}</span>
          <span className="text-[var(--color-text-muted)] text-xs flex-1 truncate">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}

export default CommandPalette;
export type { CommandPaletteProps };
