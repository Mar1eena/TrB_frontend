// Empirical Distribution Function (аналог optuna.visualization.plot_edf):
// эмпирическая функция распределения значений цели по завершённым трайлам —
// какая доля трайлов достигла значения цели не хуже X. Новый тип графика,
// которого не было в ручной SVG-версии: даёт представление о разбросе
// результатов поиска, а не только о лучшем/текущем значении.

import type * as api from "../../../api/strategysearch";
import { axisCommon, COLOR, FONT_FAMILY, tooltipStyle, useECharts } from "./echartsSetup";

export function EdfChart({
  trials,
  metric,
}: {
  trials: api.Trial[];
  metric: string;
}) {
  const values = trials
    .filter((t) => t.state === "TRIAL_STATE_COMPLETE" && t.values?.[metric] != null)
    .map((t) => t.values![metric])
    .sort((a, b) => a - b);
  const n = values.length;
  const data = values.map((v, i) => [v, (i + 1) / n]);

  const wrapRef = useECharts([trials, metric], (chart) => {
    chart.setOption({
      backgroundColor: "transparent",
      textStyle: { color: COLOR.text, fontFamily: FONT_FAMILY },
      grid: { left: 56, right: 24, top: 44, bottom: 44 },
      tooltip: {
        trigger: "axis",
        ...tooltipStyle,
        formatter: (ps: any[]) => {
          const p = ps[0];
          return `${metric} ≤ ${Number(p.value[0]).toFixed(4)}<br/>доля трайлов: ${(p.value[1] * 100).toFixed(1)}%`;
        },
      },
      toolbox: {
        right: 8,
        top: 8,
        iconStyle: { borderColor: COLOR.muted },
        feature: { dataZoom: { yAxisIndex: "none" }, restore: {} },
      },
      dataZoom: [{ type: "inside", xAxisIndex: 0 }],
      xAxis: { type: "value", name: metric, nameLocation: "middle", nameGap: 26, nameTextStyle: { color: COLOR.muted, fontSize: 10 }, scale: true, ...axisCommon },
      yAxis: { type: "value", name: "доля трайлов", min: 0, max: 1, nameTextStyle: { color: COLOR.muted, fontSize: 10 }, axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => `${Math.round(v * 100)}%` }, splitLine: axisCommon.splitLine, axisLine: axisCommon.axisLine },
      series: [
        {
          type: "line",
          step: "end",
          showSymbol: false,
          lineStyle: { color: COLOR.accent, width: 2 },
          areaStyle: { color: COLOR.accentDim },
          data,
        },
      ],
    });
  });

  const empty = n === 0;

  return (
    <div style={{ position: "relative" }}>
      {empty ? <p className="hint">Пока нет завершённых трайлов для этой метрики.</p> : null}
      <div ref={wrapRef} className="chart-echarts" aria-label={`EDF: ${metric}`} style={{ display: empty ? "none" : undefined }} />
    </div>
  );
}
