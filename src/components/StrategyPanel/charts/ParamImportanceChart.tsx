// Важность параметров (аналог optuna.visualization.plot_param_importances):
// горизонтальный bar chart по ParamImportance на ECharts — тултип с точным
// значением, подписи с процентом на конце столбца; высота контейнера растёт
// с числом параметров, чтобы подписи не налезали друг на друга.

import type * as api from "../../../api/strategysearch";
import { axisCommon, COLOR, FONT_FAMILY, tooltipStyle, useECharts } from "./echartsSetup";

export function ParamImportanceChart({
  items,
  paramLabels,
}: {
  items: api.ParamImportance[];
  paramLabels: Map<string, string>;
}) {
  // по возрастанию: у категориальной оси ECharts индекс 0 — внизу, поэтому
  // самый важный параметр (последний в массиве) окажется сверху.
  const rows = [...items].sort((a, b) => a.importance - b.importance).map((i) => ({ ...i, label: paramLabels.get(i.path) ?? i.path }));

  const wrapRef = useECharts([items, paramLabels], (chart) => {
    chart.setOption({
      backgroundColor: "transparent",
      textStyle: { color: COLOR.text, fontFamily: FONT_FAMILY },
      grid: { left: 160, right: 56, top: 12, bottom: 12 },
      tooltip: {
        trigger: "item",
        ...tooltipStyle,
        formatter: (p: any) => `${p.name}: ${(p.value * 100).toFixed(1)}%`,
      },
      xAxis: { type: "value", axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => `${(v * 100).toFixed(0)}%` }, splitLine: axisCommon.splitLine, axisLine: axisCommon.axisLine },
      yAxis: { type: "category", data: rows.map((r) => r.label), axisLabel: axisCommon.axisLabel, axisLine: axisCommon.axisLine, axisTick: { show: false } },
      series: [
        {
          type: "bar",
          data: rows.map((r) => r.importance),
          itemStyle: { color: COLOR.accent, borderRadius: [0, 2, 2, 0] },
          barMaxWidth: 18,
          label: { show: true, position: "right", color: COLOR.muted, fontSize: 10, formatter: (p: any) => `${(p.value * 100).toFixed(1)}%` },
        },
      ],
    });
  });

  const empty = rows.length === 0;

  return (
    <div style={{ position: "relative" }}>
      {empty ? <p className="hint">Недостаточно завершённых трайлов для оценки важности параметров.</p> : null}
      <div
        ref={wrapRef}
        className="chart-echarts"
        aria-label="Важность параметров"
        style={{ display: empty ? "none" : undefined, height: Math.max(260, rows.length * 28) }}
      />
    </div>
  );
}
