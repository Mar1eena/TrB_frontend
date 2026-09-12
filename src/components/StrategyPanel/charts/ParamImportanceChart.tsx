// Важность параметров (аналог optuna.visualization.plot_param_importances):
// горизонтальный bar chart по ParamImportance, отсортирован по убыванию.

import { useMemo } from "react";
import type * as api from "../../../api/strategysearch";

const ROW_H = 26;
const W = 640;
const LABEL_W = 200;

export function ParamImportanceChart({
  items,
  paramLabels,
}: {
  items: api.ParamImportance[];
  paramLabels: Map<string, string>;
}) {
  const rows = useMemo(() => {
    const max = Math.max(1e-9, ...items.map((i) => i.importance));
    return [...items]
      .sort((a, b) => b.importance - a.importance)
      .map((i) => ({ ...i, label: paramLabels.get(i.path) ?? i.path, frac: i.importance / max }));
  }, [items, paramLabels]);

  if (rows.length === 0) {
    return <p className="hint">Недостаточно завершённых трайлов для оценки важности параметров.</p>;
  }

  const h = rows.length * ROW_H + 8;
  const barW = W - LABEL_W - 60;

  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="chart-svg" role="img" aria-label="Важность параметров">
      {rows.map((r, i) => {
        const y = i * ROW_H + 4;
        return (
          <g key={r.path}>
            <text x={LABEL_W - 8} y={y + ROW_H / 2} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
              {r.label}
            </text>
            <rect x={LABEL_W} y={y + 3} width={Math.max(1, r.frac * barW)} height={ROW_H - 10} className="chart-bar">
              <title>
                {r.label}: {(r.importance * 100).toFixed(1)}%
              </title>
            </rect>
            <text x={LABEL_W + Math.max(1, r.frac * barW) + 6} y={y + ROW_H / 2} className="chart-axis-label" dominantBaseline="middle">
              {(r.importance * 100).toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
