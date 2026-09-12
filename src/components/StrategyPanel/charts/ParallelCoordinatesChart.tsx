// Parallel coordinate plot (аналог optuna.visualization.plot_parallel_coordinate):
// по одной вертикальной оси на параметр поиска + одна ось цели, трайл —
// ломаная через оси. Цвет линии — по значению цели (зелёный = лучше при
// maximize, инвертировано при minimize). Только complete-трайлы: у
// pruned/failed нет итогового значения цели, разместить их на оси цели нечем.

import { useMemo } from "react";
import type * as api from "../../../api/strategysearch";
import { linearScale, niceDomain } from "./chartScales";

const W = 640;
const H = 260;
const PAD = { top: 20, bottom: 44 };

function lerpColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  // приглушённый фиолетовый (--muted) -> акцентный зелёный (--accent)
  const from = [169, 155, 184];
  const to = [61, 186, 122];
  const rgb = from.map((c, i) => Math.round(c + (to[i] - c) * clamped));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

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
  const { axes, lines } = useMemo(() => {
    const complete = trials.filter(
      (t) => t.state === "TRIAL_STATE_COMPLETE" && t.values?.[metric] != null && paramPaths.every((p) => t.params?.[p] != null),
    );
    const cols = [...paramPaths, `__metric__${metric}`];
    const n = cols.length;
    const axisX = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * (W - 40) + 20);

    const axes = cols.map((c, i) => {
      const isMetric = c.startsWith("__metric__");
      const values = complete.map((t) => (isMetric ? t.values![metric] : t.params![c]));
      const domain = niceDomain(values);
      const scale = linearScale(domain, [H - PAD.bottom, PAD.top]);
      return {
        key: c,
        x: axisX(i),
        label: isMetric ? metric : (paramLabels.get(c) ?? c),
        domain,
        scale,
      };
    });

    const objValues = complete.map((t) => t.values![metric]);
    const objDomain = niceDomain(objValues);

    const lines = complete.map((t) => {
      const objV = t.values![metric];
      const norm = objDomain[1] === objDomain[0] ? 0.5 : (objV - objDomain[0]) / (objDomain[1] - objDomain[0]);
      const colorT = maximize ? norm : 1 - norm;
      const pts = axes.map((a) => {
        const v = a.key.startsWith("__metric__") ? objV : t.params![a.key];
        return `${a.x},${a.scale(v)}`;
      });
      return { number: t.number, points: pts.join(" "), color: lerpColor(colorT) };
    });

    return { axes, lines };
  }, [trials, paramPaths, metric, maximize, paramLabels]);

  if (lines.length === 0) {
    return <p className="hint">Пока нет завершённых трайлов со всеми параметрами.</p>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Parallel coordinates">
      {lines.map((l) => (
        <polyline key={l.number} points={l.points} fill="none" stroke={l.color} strokeWidth={1.3} opacity={0.65}>
          <title>#{l.number}</title>
        </polyline>
      ))}
      {axes.map((a) => (
        <g key={a.key}>
          <line x1={a.x} x2={a.x} y1={PAD.top} y2={H - PAD.bottom} className="chart-axis" />
          <text x={a.x} y={PAD.top - 6} className="chart-axis-label" textAnchor="middle">
            {a.domain[1].toFixed(2)}
          </text>
          <text x={a.x} y={H - PAD.bottom + 14} className="chart-axis-label" textAnchor="middle">
            {a.domain[0].toFixed(2)}
          </text>
          <text x={a.x} y={H - PAD.bottom + 30} className="chart-axis-label chart-axis-title" textAnchor="middle">
            {a.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
