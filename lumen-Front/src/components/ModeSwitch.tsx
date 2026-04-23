/**
 * 胶囊式模式切换器
 *
 * 用于标题栏居中位置，切换 Chat / Workbench / RPG 等模式。
 * Phase B: 仅 Chat 可用，其他为占位。
 */
interface Mode {
  key: string;
  label: string;
  available?: boolean;
}

interface ModeSwitchProps {
  modes: Mode[];
  activeMode: string;
  onSwitch: (mode: string) => void;
}

function ModeSwitch({ modes, activeMode, onSwitch }: ModeSwitchProps) {
  return (
    <div className="inline-flex rounded-full bg-slate-800/50 p-0.5 gap-0.5">
      {modes.map(mode => {
        const isActive = mode.key === activeMode;
        const isAvailable = mode.available !== false;

        return (
          <button
            key={mode.key}
            onClick={() => {
              if (isAvailable) {
                onSwitch(mode.key);
              }
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer
              transition-all duration-200
              ${isActive
                ? 'text-amber-400 bg-amber-500/10'
                : isAvailable
                  ? 'text-slate-500 hover:text-slate-300'
                  : 'text-slate-700 cursor-default'
              }`}
            title={!isAvailable ? `${mode.label}（即将推出）` : undefined}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

export default ModeSwitch;
