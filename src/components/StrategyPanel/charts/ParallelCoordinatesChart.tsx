// Parallel coordinate plot (аналог optuna.visualization.plot_parallel_coordinate):
// по одной вертикальной оси на параметр поиска + одна ось цели, трайл —
// ломаная через оси. Цвет линии — по значению цели (визуально лучше у
// accent-цвета). Только complete-трайлы: у pruned/failed нет итогового
// значения цели, разместить их на оси цели нечем.
//
// ECharts parallel chart даёт из коробки то, чего не было в ручном SVG:
// перетаскивание по оси выделяет/фильтрует линии в заданном диапазоне
// (coordinate-range brushing), что для разбора гиперпараметров существенно
// удобнее статичной картинки.

import type * as api from "../../../api/strategysearch";
import { COLOR, FONT_FAMILY, PARALLEL_COLORS, tooltipStyle, useECharts } from "./echartsSetup";

export function ParallelCoordinatesChart({
  trials,
  paramPaths,
  metric,
  maximize,
  paramLabels,
}: {
  trials: api.Trial[];
  paramPaths: string[];
  metric: string;
  maximize: boolean;
  paramLabels: Map<string, string>;
}) {
  const complete = trials.filter(
    (t) => t.state === "TRIAL_STATE_COMPLETE" && t.values?.[metric] != null && paramPaths.every((p) => t.params?.[p] != null),
  );
  const cols = [...paramPaths, metric];
  const objValues = complete.map((t) => t.values![metric]);
  const objMin = objValues.length ? Math.min(...objValues) : 0;
  const objMax = objValues.length ? Math.max(...objValues) : 1;

  const wrapRef = useECharts([trials, paramPaths, metric, maximize, paramLabels], (chart) => {
    chart.setOption({
      backgroundColor: "transparent",
      textStyle: { color: COLOR.text, fontFamily: FONT_FAMILY },
      tooltip: {
        ...tooltipStyle,
        formatter: (p: any) => {
          const lines = cols.map((c, i) => `${i === cols.length - 1 ? metric : paramLabels.get(c) ?? c}: ${Number(p.value[i]).toFixed(4)}`);
          return `#${p.data.number}<br/>${lines.join("<br/>")}`;
        },
      },
      visualMap: {
        show: objValues.length > 1,
        dimension: cols.length - 1,
        min: objMin,
        max: objMax,
        right: 4,
        top: "middle",
        itemWidth: 10,
        itemHeight: 80,
        text: maximize ? ["лучше", "хуже"] : ["хуже", "лучше"],
        textStyle: { color: COLOR.muted, fontSize: 9 },
        inRange: { color: maximize ? PARALLEL_COLORS : [...PARALLEL_COLORS].reverse() },
      },
      toolbox: {
        right: 8,
        top: 8,
        iconStyle: { borderColor: COLOR.muted },
        feature: { restore: {} },
      },
      parallelAxis: cols.map((c, i) => ({
        dim: i,
        name: i === cols.length - 1 ? metric : paramLabels.get(c) ?? c,
        nameTextStyle: { color: COLOR.text, fontSize: 10 },
        axisLine: { lineStyle: { color: COLOR.line } },
        axisLabel: { color: COLOR.muted, fontSize: 9 },
        axisTick: { lineStyle: { color: COLOR.line } },
      })),
      parallel: { left: 48, right: 56, top: 44, bottom: 24, parallelAxisDefault: { areaSelectStyle: { color: COLOR.accent, opacity: 0.3 } } },
      series: [
        {
          type: "parallel",
          lineStyle: { width: 1.2, opacity: 0.55 },
          emphasis: { lineStyle: { width: 2.5, opacity: 1 } },
          data: complete.map((t) => ({
            value: [...paramPaths.map((p) => t.params![p]), t.values![metric]],
            number: t.number,
          })),
        },
      ],
    });
  });

  const empty = complete.length === 0;

  return (
    <div style={{ position: "relative" }}>
      {empty ? <p className="hint">Пока нет завершённых трайлов со всеми параметрами.</p> : null}
      <div ref={wrapRef} className="chart-echarts chart-echarts--tall" aria-label="Parallel coordinates" style={{ display: empty ? "none" : undefined }} />
    </div>
  );
}
