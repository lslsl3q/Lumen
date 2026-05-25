import { useMemo, useState } from "react";
import { useWritingStore } from "../../stores/useWritingStore";

type WordCountView = "scenes" | "chapters";

interface SceneInfo {
  label: string;
  words: number;
  characters: string[];
}

function getSceneData(acts: any[]): { scenes: SceneInfo[]; chapters: { label: string; words: number }[] } {
  const scenes: SceneInfo[] = [];
  const chapters: { label: string; words: number }[] = [];

  for (const act of acts) {
    for (const ch of act.chapters || []) {
      let chWords = 0;
      const chTitle = ch.title || `Chapter ${(ch.sort_order ?? 0) + 1}`;
      for (const sc of ch.scenes || []) {
        const words = sc.word_count || 0;
        const codexEntries: string[] = (sc.codex_entries || []).map(
          (e: any) => e.label || e.name || "Unnamed"
        );
        scenes.push({
          label: `${chTitle} - Scene ${(sc.sort_order ?? 0) + 1}`,
          words,
          characters: codexEntries,
        });
        chWords += words;
      }
      chapters.push({ label: chTitle, words: chWords });
    }
  }
  return { scenes, chapters };
}

/** NC-style vertical SVG bar chart — bars go bottom-to-top, scene labels on X-axis */
function SvgBarChart({ items }: { items: { label: string; value: number }[] }) {
  if (items.length === 0) {
    return <div className="text-[12px] text-zinc-500 italic py-4">暂无数据</div>;
  }

  const maxVal = Math.max(...items.map((d) => d.value), 10);
  const niceMax = Math.ceil(maxVal / 10) * 10 || 10;
  const avg = Math.round(items.reduce((s, d) => s + d.value, 0) / items.length);

  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 24;
  const paddingBottom = 50;
  const chartWidth = 935;
  const chartHeight = 200;
  const svgWidth = paddingLeft + chartWidth + paddingRight;
  const svgHeight = paddingTop + chartHeight + paddingBottom;

  const barAreaWidth = chartWidth / items.length;
  const barWidth = Math.max(barAreaWidth * 0.6, 4);

  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((niceMax / tickCount) * i));

  return (
    <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="text-zinc-400">
      {/* Y-axis grid lines and labels */}
      {ticks.map((tick, i) => {
        const y = paddingTop + chartHeight - (tick / niceMax) * chartHeight;
        return (
          <g key={`tick-${i}`}>
            <text
              x={paddingLeft - 8}
              y={y + 4}
              className="text-[10px] fill-zinc-500"
              textAnchor="end"
            >
              {tick}
            </text>
            <line
              x1={paddingLeft}
              y1={y}
              x2={paddingLeft + chartWidth}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          </g>
        );
      })}

      {/* Average dashed line */}
      {(() => {
        const avgY = paddingTop + chartHeight - (avg / niceMax) * chartHeight;
        return (
          <line
            x1={paddingLeft}
            y1={avgY}
            x2={paddingLeft + chartWidth}
            y2={avgY}
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        );
      })()}

      {/* Bars */}
      {items.map((item, i) => {
        const barX = paddingLeft + i * barAreaWidth + (barAreaWidth - barWidth) / 2;
        const barH = (item.value / niceMax) * chartHeight;
        const barY = paddingTop + chartHeight - barH;
        return (
          <g key={`bar-${i}`}>
            {item.value > 0 && (
              <rect
                x={barX}
                y={barY}
                width={barWidth}
                height={Math.max(barH, 1)}
                rx={2}
                fill="rgb(124, 214, 253)"
                fillOpacity={0.7}
              />
            )}
            {/* Value label on top of bar */}
            {item.value > 0 && (
              <text
                x={barX + barWidth / 2}
                y={barY - 4}
                className="text-[9px] fill-zinc-500 tabular-nums"
                textAnchor="middle"
              >
                {item.value}
              </text>
            )}
            {/* X-axis label */}
            <text
              x={paddingLeft + i * barAreaWidth + barAreaWidth / 2}
              y={paddingTop + chartHeight + 14}
              className="text-[9px] fill-zinc-500"
              textAnchor="middle"
              transform={`rotate(-45, ${paddingLeft + i * barAreaWidth + barAreaWidth / 2}, ${paddingTop + chartHeight + 14})`}
            >
              {item.label.length > 12 ? item.label.slice(0, 11) + "…" : item.label}
            </text>
          </g>
        );
      })}

      {/* Average label */}
      {(() => {
        const avgY = paddingTop + chartHeight - (avg / niceMax) * chartHeight;
        return (
          <text
            x={paddingLeft + chartWidth + 4}
            y={avgY + 4}
            className="text-[9px] fill-zinc-500"
          >
            平均 {avg}
          </text>
        );
      })()}
    </svg>
  );
}

/** NC-style table-based heatmap */
function HeatmapTable({ scenes }: { scenes: SceneInfo[] }) {
  const { characters, matrix, totals } = useMemo(() => {
    const charSet = new Set<string>();
    scenes.forEach((s) => s.characters.forEach((c) => charSet.add(c)));
    const chars = Array.from(charSet).sort();
    const matrix = chars.map((char) =>
      scenes.map((s) => (s.characters.includes(char) ? 1 : 0))
    );
    const totals = chars.map((_, ci) => matrix[ci].reduce((a: number, b: number) => a + b, 0));
    return { characters: chars, matrix, totals };
  }, [scenes]);

  if (characters.length === 0) {
    return <div className="text-[12px] text-zinc-500 italic py-4">暂无词条关联到场景</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="w-36 text-left text-[11px] text-zinc-500 font-normal pr-2" />
            <th className="text-[10px] text-zinc-500 font-normal px-0.5 text-center" title="Total">
              Σ
            </th>
            {scenes.map((s, i) => (
              <th
                key={i}
                className="w-6 h-6 text-[9px] text-zinc-600 font-normal text-center"
                title={s.label}
              >
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {characters.map((char, ci) => (
            <tr key={char}>
              <td className="text-[11px] text-zinc-400 truncate pr-2 text-right" title={char}>
                {char}
              </td>
              <td className="text-[10px] text-zinc-500 text-center tabular-nums px-0.5">
                {totals[ci]}
              </td>
              {matrix[ci].map((val, si) => (
                <td key={si} className="px-0.5 py-0.5">
                  <div
                    className={`w-6 h-6 rounded-sm ${
                      val ? "bg-emerald-500/50" : "bg-zinc-800/30"
                    }`}
                    title={`${char} in ${scenes[si].label}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReviewView() {
  const acts = useWritingStore((s) => s.acts);
  const [wordCountView, setWordCountView] = useState<WordCountView>("scenes");

  const totalWords = useMemo(
    () =>
      acts.reduce(
        (sum, act) =>
          sum +
          ((act as any).chapters || []).reduce(
            (cSum: number, ch: any) =>
              cSum + (ch.scenes || []).reduce((sSum: number, sc: any) => sSum + (sc.word_count || 0), 0),
            0
          ),
        0
      ),
    [acts]
  );

  const { scenes, chapters } = useMemo(() => getSceneData(acts), [acts]);

  const wordCountData = useMemo(() => {
    if (wordCountView === "scenes") {
      return scenes.map((s) => ({ label: s.label, value: s.words }));
    }
    return chapters.map((c) => ({ label: c.label, value: c.words }));
  }, [wordCountView, scenes, chapters]);

  const charDistData = useMemo(
    () => scenes.map((s) => ({ label: s.label, value: s.characters.length })),
    [scenes]
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-8 space-y-8">
        {/* Total Word Count */}
        <section className="p-6 rounded-lg border border-zinc-700/50 bg-zinc-800/30">
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            总字数
          </h3>
          <div className="text-[42px] font-bold text-zinc-100 tabular-nums leading-none">
            {totalWords.toLocaleString()}
          </div>
        </section>

        {/* Word Counts by Scene / Chapter */}
        <section className="p-6 rounded-lg border border-zinc-700/50 bg-zinc-800/30">
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            场景字数统计
          </h3>
          <p className="text-[12px] text-zinc-500 mb-4">
            对比不同粒度的字数分布，发现节奏变化。
          </p>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider">视图：</span>
            <button
              onClick={() => setWordCountView("scenes")}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                wordCountView === "scenes"
                  ? "bg-zinc-600 text-zinc-100"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
              type="button"
            >
              场景
            </button>
            <button
              onClick={() => setWordCountView("chapters")}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                wordCountView === "chapters"
                  ? "bg-zinc-600 text-zinc-100"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
              type="button"
            >
              章节
            </button>
          </div>
          <div className="overflow-x-auto">
            <SvgBarChart items={wordCountData} />
          </div>
        </section>

        {/* Character Distribution by Scene */}
        <section className="p-6 rounded-lg border border-zinc-700/50 bg-zinc-800/30">
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            角色出场分布
          </h3>
          <p className="text-[12px] text-zinc-500 mb-4">
            查看每个场景中有多少角色出场，平衡角色戏份。
          </p>
          <div className="overflow-x-auto">
            <SvgBarChart items={charDistData} />
          </div>
        </section>

        {/* Appearance Heatmap */}
        <section className="p-6 rounded-lg border border-zinc-700/50 bg-zinc-800/30">
          <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            角色出场热力图
          </h3>
          <p className="text-[12px] text-zinc-500 mb-4">
            显示词条在每个场景中的出场频率，方便发现聚集点和故事关联。
          </p>
          <HeatmapTable scenes={scenes} />
        </section>
      </div>
    </div>
  );
}
