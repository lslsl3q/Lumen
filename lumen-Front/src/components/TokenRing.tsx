/**
 * Token 圆形进度指示器
 * 用于输入框驾驶舱，显示当前 token 使用百分比
 * 悬停显示详情
 */
interface TokenRingProps {
  percent: number;
  current: number;
  total: number;
}

function TokenRing({ percent, current, total }: TokenRingProps) {
  const radius = 8;
  const stroke = 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;

  const color = percent > 80 ? '#ef4444' : percent > 50 ? '#CC7C5E' : '#8A8478';

  return (
    <div
      className="relative w-5 h-5 flex items-center justify-center group cursor-pointer"
      title={`${current}/${total} tokens (${percent}%)`}
    >
      <svg width="20" height="20" className="-rotate-90">
        <circle
          cx="10" cy="10" r={radius}
          fill="none" stroke="rgba(74,71,68,0.3)" strokeWidth={stroke}
        />
        <circle
          cx="10" cy="10" r={radius}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      </svg>
      <div className="
        absolute bottom-full mb-2 left-1/2 -translate-x-1/2
        hidden group-hover:block z-50
        bg-slate-900 border border-slate-700/60 rounded px-2 py-1
        text-xs text-slate-400 whitespace-nowrap shadow-lg
      ">
        {current.toLocaleString()} / {total.toLocaleString()} tokens ({percent}%)
      </div>
    </div>
  );
}

export default TokenRing;
