// История оптимизации (аналог optuna.visualization.plot_optimization_history):
// по одной точке на завершённый трайл (значение цели), поверх — линия
// «лучшее на текущий момент». Pruned/failed трайлы не имеют значения цели
// (BacktestMetrics/values пишутся только при complete — см. Trial в proto),
// поэтому показаны засечками на базовой линии, без y-координаты.

import { useMemo } from "react";
import type * as api from "../../../api/strategysearch";
import { linearScale, niceDomain } from "./chartScales";

const W = 640;
const H = 220;
const PAD = { left: 44, right: 12, top: 12, bottom: 24 };

export function OptimizationHistoryChart({
  trials,
  metric,
  maximize,
}: {
  trials: api.Trial[];
  metric: string;
  maximize: boolean;
}) {
  const { points, bestLine, ticks, yScale, yDomain } = useMemo(() => {
    const sorted = [...trials].sort((a, b) => a.number - b.number);
    const complete = sorted.filter((t) => t.state === "TRIAL_STATE_COMPLETE" && t.values?.[metric] != null);
    const values = complete.map((t) => t.values![metric]);
    const numbers = sorted.map((t) => t.number);
    const xDomain: [number, number] = [0, Math.max(1, ...numbers)];
    const yDomain = niceDomain(values);
    const xScale = linearScale(xDomain, [PAD.left, W - PAD.right]);
    const yScale = linearScale(yDomain, [H - PAD.bottom, PAD.top]);

    const points = complete.map((t) => ({ number: t.number, value: t.values![metric], x: xScale(t.number), y: yScale(t.values![metric]) }));

    let best: number | undefined;
    const bestLine = complete.map((t) => {
      const v = t.values![metric];
      best = best === undefined ? v : maximize ? Math.max(best, v) : Math.min(best, v);
      return `${xScale(t.number)},${yScale(best)}`;
    });

    const ticks = sorted
      .filter((t) => t.state === "TRIAL_STATE_PRUNED" || t.state === "TRIAL_STATE_FAIL")
      .map((t) => ({ number: t.number, x: xScale(t.number), pruned: t.state === "TRIAL_STATE_PRUNED" }));

    return { points, bestLine, ticks, yScale, yDomain };
  }, [trials, metric, maximize]);

  if (points.length === 0 && ticks.length === 0) {
    return <p className="hint">Пока нет данных для графика.</p>;
  }

  const yTicks = [yDomain[0], (yDomain[0] + yDomain[1]) / 2, yDomain[1]];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={`История оптимизации: ${metric}`}>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={yScale(v)} y2={yScale(v)} className="chart-gridline" />
          <text x={PAD.left - 6} y={yScale(v)} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
            {v.toFixed(3)}
          </text>
        </g>
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="chart-axis" />

      {ticks.map((t) => (
        <line
          key={`tick-${t.number}`}
          x1={t.x}
          x2={t.x}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom + 6}
          stroke={t.pruned ? "#e8b56c" : "#e88c8c"}
          strokeWidth={2}
        >
          <title>
            #{t.number} — {t.pruned ? "отсечён" : "ошибка"}
          </title>
        </line>
      ))}

      {bestLine.length > 1 ? <polyline points={bestLine.join(" ")} className="chart-best-line" /> : null}

      {points.map((p) => (
        <circle key={p.number} cx={p.x} cy={p.y} r={3} className="chart-point">
          <title>
            #{p.number}: {p.value.toFixed(4)}
          </title>
        </circle>
      ))}
    </svg>
  );
}
