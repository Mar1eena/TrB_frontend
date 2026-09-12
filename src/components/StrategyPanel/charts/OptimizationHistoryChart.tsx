// История оптимизации (аналог optuna.visualization.plot_optimization_history)
// на ECharts: точка на каждый complete-трайл, линия «лучшее на текущий
// момент», pruned/failed — засечки внизу графика. Pruned/failed трайлы не
// имеют значения цели (BacktestMetrics/values пишутся только при complete —
// см. Trial в proto), поэтому у них нет y-координаты по объективу.
//
// Интерактивность поверх старого SVG-варианта: zoom/pan по оси трайлов
// (колесо + слайдер), тултип со всеми параметрами трайла (не только осевыми
// значениями), toolbox для сброса зума и экспорта в PNG.

import type * as api from "../../../api/strategysearch";
import { axisCommon, COLOR, FONT_FAMILY, tooltipStyle, useECharts } from "./echartsSetup";

export function OptimizationHistoryChart({
  trials,
  metric,
  maximize,
  paramLabels,
}: {
  trials: api.Trial[];
  metric: string;
  maximize: boolean;
  paramLabels: Map<string, string>;
}) {
  const sorted = [...trials].sort((a, b) => a.number - b.number);
  const complete = sorted.filter((t) => t.state === "TRIAL_STATE_COMPLETE" && t.values?.[metric] != null);
  const failedOrPruned = sorted.filter((t) => t.state === "TRIAL_STATE_PRUNED" || t.state === "TRIAL_STATE_FAIL");

  const values = complete.map((t) => t.values![metric]);
  const yMin = values.length ? Math.min(...values) : 0;
  const yMax = values.length ? Math.max(...values) : 1;
  const pad = (yMax - yMin) * 0.08 || 1;
  const floor = yMin - pad;

  let best: number | undefined;
  const bestLine = complete.map((t) => {
    const v = t.values![metric];
    best = best === undefined ? v : maximize ? Math.max(best, v) : Math.min(best, v);
    return [t.number, best];
  });

  const paramLines = (t: api.Trial) =>
    Object.entries(t.params ?? {})
      .map(([k, v]) => `${paramLabels.get(k) ?? k}: ${v}`)
      .join("<br/>");

  const wrapRef = useECharts(
    [trials, metric, maximize, paramLabels],
    (chart) => {
      chart.setOption({
        backgroundColor: "transparent",
        textStyle: { color: COLOR.text, fontFamily: FONT_FAMILY },
        grid: { left: 56, right: 24, top: 44, bottom: 56 },
        tooltip: {
          trigger: "item",
          ...tooltipStyle,
          formatter: (p: any) => {
            if (p.seriesName === "Лучшее") return `лучшее к #${p.value[0]}: ${Number(p.value[1]).toFixed(4)}`;
            const t = p.data.trial as api.Trial;
            const head = t.values?.[metric] != null ? `#${t.number}: ${metric} = ${t.values[metric].toFixed(4)}` : `#${t.number}: ${t.state === "TRIAL_STATE_PRUNED" ? "отсечён" : "ошибка"}`;
            const params = paramLines(t);
            return params ? `${head}<br/>${params}` : head;
          },
        },
        legend: {
          left: 0,
          top: 0,
          textStyle: { color: COLOR.muted, fontSize: 11 },
          data: ["Трайлы", "Лучшее", "Отсечён", "Ошибка"],
        },
        toolbox: {
          right: 8,
          top: 8,
          iconStyle: { borderColor: COLOR.muted },
          feature: { dataZoom: { yAxisIndex: "none" }, restore: {} },
        },
        dataZoom: [
          { type: "inside", xAxisIndex: 0 },
          { type: "slider", xAxisIndex: 0, height: 14, bottom: 8, textStyle: { color: COLOR.muted, fontSize: 9 } },
        ],
        xAxis: { type: "value", name: "trial", nameTextStyle: { color: COLOR.muted }, min: 0, ...axisCommon },
        yAxis: { type: "value", scale: true, ...axisCommon },
        series: [
          {
            name: "Трайлы",
            type: "scatter",
            symbolSize: 7,
            itemStyle: { color: COLOR.accent, opacity: 0.85 },
            data: complete.map((t) => ({ value: [t.number, t.values![metric]], trial: t })),
          },
          {
            name: "Лучшее",
            type: "line",
            showSymbol: false,
            lineStyle: { color: COLOR.bestLine, width: 1.8 },
            data: bestLine,
            z: 3,
          },
          {
            name: "Отсечён",
            type: "scatter",
            symbol: "triangle",
            symbolSize: 8,
            itemStyle: { color: COLOR.pruned },
            data: failedOrPruned
              .filter((t) => t.state === "TRIAL_STATE_PRUNED")
              .map((t) => ({ value: [t.number, floor], trial: t })),
          },
          {
            name: "Ошибка",
            type: "scatter",
            symbol: "triangle",
            symbolSize: 8,
            itemStyle: { color: COLOR.fail },
            data: failedOrPruned
              .filter((t) => t.state === "TRIAL_STATE_FAIL")
              .map((t) => ({ value: [t.number, floor], trial: t })),
          },
        ],
      });
    },
  );

  const empty = complete.length === 0 && failedOrPruned.length === 0;

  // div всегда смонтирован (даже когда данных пока нет), чтобы wrapRef не
  // терял DOM-узел между рендерами — иначе эффект инициализации echarts
  // (запускается один раз на маунт) мог бы навечно остаться с el === null,
  // если на первом рендере компонент показывал только текст-подсказку.
  return (
    <div style={{ position: "relative" }}>
      {empty ? <p className="hint">Пока нет данных для графика.</p> : null}
      <div ref={wrapRef} className="chart-echarts" aria-label={`История оптимизации: ${metric}`} style={{ display: empty ? "none" : undefined }} />
    </div>
  );
}
