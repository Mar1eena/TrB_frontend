// Contour plot (аналог optuna.visualization.plot_contour): тепловая карта
// значения цели по сетке двух выбранных числовых параметров. Optuna строит
// её интерполяцией по сетке (scipy) — здесь то же самое, но проще: обратное
// взвешивание по расстоянию (IDW) по наблюдённым трайлам, нормализованное
// по осям, чтобы разный масштаб параметров не искажал «близость» точек.
// Новый тип графика, которого не было в ручной SVG-версии.

import { useState } from "react";
import type * as api from "../../../api/strategysearch";
import { COLOR, CONTOUR_COLORS, FONT_FAMILY, tooltipStyle, useECharts, wrapAxisName } from "./echartsSetup";

const GRID_N = 26;
const IDW_POWER = 2;

function fmtTick(v: number): string {
  const abs = Math.abs(v);
  return abs !== 0 && (abs < 0.001 || abs >= 10000) ? v.toExponential(1) : v.toFixed(abs < 1 ? 3 : 2);
}

export function ContourChart({
  trials,
  metric,
  paramPaths,
  paramLabels,
}: {
  trials: api.Trial[];
  metric: string;
  paramPaths: string[];
  paramLabels: Map<string, string>;
}) {
  const [xPath, setXPath] = useState(paramPaths[0] ?? "");
  const [yPath, setYPath] = useState(paramPaths[1] ?? paramPaths[0] ?? "");
  const px = paramPaths.includes(xPath) ? xPath : paramPaths[0];
  const py = paramPaths.includes(yPath) && yPath !== px ? yPath : paramPaths.find((p) => p !== px) ?? px;

  const complete = trials.filter(
    (t) => t.state === "TRIAL_STATE_COMPLETE" && t.values?.[metric] != null && t.params?.[px] != null && t.params?.[py] != null,
  );

  const wrapRef = useECharts([trials, metric, px, py, paramLabels], (chart) => {
    if (complete.length === 0 || px === py) {
      chart.clear();
      return;
    }
    const xs = complete.map((t) => t.params![px]);
    const ys = complete.map((t) => t.params![py]);
    const vs = complete.map((t) => t.values![metric]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs) || xMin + 1;
    const yMin = Math.min(...ys), yMax = Math.max(...ys) || yMin + 1;
    const xSpan = xMax - xMin || 1;
    const ySpan = yMax - yMin || 1;

    const xTicks = Array.from({ length: GRID_N }, (_, i) => xMin + (i / (GRID_N - 1)) * xSpan);
    const yTicks = Array.from({ length: GRID_N }, (_, i) => yMin + (i / (GRID_N - 1)) * ySpan);

    const heat: [number, number, number][] = [];
    for (let iy = 0; iy < GRID_N; iy++) {
      for (let ix = 0; ix < GRID_N; ix++) {
        const gx = (xTicks[ix] - xMin) / xSpan;
        const gy = (yTicks[iy] - yMin) / ySpan;
        let wsum = 0;
        let vsum = 0;
        for (let k = 0; k < complete.length; k++) {
          const nx = (xs[k] - xMin) / xSpan;
          const ny = (ys[k] - yMin) / ySpan;
          const d2 = (gx - nx) ** 2 + (gy - ny) ** 2;
          if (d2 < 1e-9) {
            wsum = 1;
            vsum = vs[k];
            break;
          }
          const w = 1 / d2 ** (IDW_POWER / 2);
          wsum += w;
          vsum += w * vs[k];
        }
        heat.push([ix, iy, wsum > 0 ? vsum / wsum : NaN]);
      }
    }

    const points = complete.map((t) => [
      Math.round(((t.params![px] - xMin) / xSpan) * (GRID_N - 1)),
      Math.round(((t.params![py] - yMin) / ySpan) * (GRID_N - 1)),
      t.number,
      t.params![px],
      t.params![py],
      t.values![metric],
    ]);

    chart.setOption(
      {
        backgroundColor: "transparent",
        textStyle: { color: COLOR.text, fontFamily: FONT_FAMILY },
        grid: { left: 100, right: 24, top: 16, bottom: 78 },
        tooltip: {
          ...tooltipStyle,
          formatter: (p: any) => {
            if (p.seriesType === "scatter") {
              const [, , number, xv, yv, v] = p.data;
              return `#${number}<br/>${paramLabels.get(px) ?? px}: ${xv}<br/>${paramLabels.get(py) ?? py}: ${yv}<br/>${metric}: ${v.toFixed(4)}`;
            }
            const v = p.data[2];
            return Number.isFinite(v) ? `${metric} ≈ ${v.toFixed(4)}` : "";
          },
        },
        visualMap: {
          min: Math.min(...vs),
          max: Math.max(...vs),
          right: 4,
          top: "middle",
          itemWidth: 10,
          itemHeight: 100,
          textStyle: { color: COLOR.muted, fontSize: 9 },
          inRange: { color: CONTOUR_COLORS },
        },
        xAxis: {
          type: "category",
          data: xTicks.map((v) => fmtTick(v)),
          // Полное название параметра, перенесённое по словам на несколько
          // строк, — под него заранее зарезервирован фиксированный
          // grid.bottom, поэтому сетка графика не сдвигается от длины текста.
          name: wrapAxisName(paramLabels.get(px) ?? px),
          nameLocation: "middle",
          nameGap: 34,
          nameTextStyle: { color: COLOR.muted, fontSize: 10, lineHeight: 13 },
          axisLabel: { color: COLOR.muted, fontSize: 8, interval: Math.ceil(GRID_N / 8) },
          axisLine: { lineStyle: { color: COLOR.line } },
          splitArea: { show: false },
        },
        yAxis: {
          type: "category",
          data: yTicks.map((v) => fmtTick(v)),
          // Название оси Y развёрнуто на 90° — так оно идёт вдоль высокой
          // (а не узкой) стороны графика и не требует расширения grid.left
          // пропорционально длине текста.
          name: paramLabels.get(py) ?? py,
          nameLocation: "middle",
          nameGap: 46,
          nameRotate: 90,
          nameTextStyle: { color: COLOR.muted, fontSize: 10 },
          axisLabel: { color: COLOR.muted, fontSize: 8, interval: Math.ceil(GRID_N / 8) },
          axisLine: { lineStyle: { color: COLOR.line } },
          splitArea: { show: false },
        },
        series: [
          {
            type: "heatmap",
            data: heat,
            itemStyle: { borderWidth: 0 },
            emphasis: { itemStyle: { borderColor: COLOR.text, borderWidth: 1 } },
          },
          {
            type: "scatter",
            data: points,
            symbolSize: 6,
            itemStyle: { color: COLOR.text, opacity: 0.8, borderColor: "rgba(0,0,0,0.5)", borderWidth: 0.5 },
          },
        ],
      },
      true,
    );
  });

  if (paramPaths.length < 2) {
    return <p className="hint">Нужно минимум 2 числовых параметра для contour-графика.</p>;
  }

  const empty = complete.length === 0 || px === py;

  return (
    <div>
      <div className="chart-axis-select">
        <label className="filter-field chart-param-picker">
          <span>Параметр X</span>
          <select value={px} onChange={(e) => setXPath(e.target.value)}>
            {paramPaths.map((p) => (
              <option key={p} value={p}>
                {paramLabels.get(p) ?? p}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field chart-param-picker">
          <span>Параметр Y</span>
          <select value={py} onChange={(e) => setYPath(e.target.value)}>
            {paramPaths.map((p) => (
              <option key={p} value={p} disabled={p === px}>
                {paramLabels.get(p) ?? p}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ position: "relative" }}>
        {empty ? <p className="hint">Пока нет завершённых трайлов с этими параметрами.</p> : null}
        <div
          ref={wrapRef}
          className="chart-echarts chart-echarts--tall"
          aria-label={`Contour: ${px} / ${py}`}
          style={{ display: empty ? "none" : undefined }}
        />
      </div>
    </div>
  );
}
