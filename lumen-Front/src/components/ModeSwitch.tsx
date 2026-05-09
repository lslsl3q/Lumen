/**
 * 胶囊式模式切换器
 *
 * 用于标题栏居中位置，切换 Chat / Base / Writing 等模式。
 */
interface Mode<T extends string = string> {
  key: T;
  label: string;
  available?: boolean;
}

interface ModeSwitchProps<T extends string = string> {
  modes: Mode<T>[];
  activeMode: T;
  onSwitch: (mode: T) => void;
}

function ModeSwitch<T extends string = string>({ modes, activeMode, onSwitch }: ModeSwitchProps<T>) {
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
