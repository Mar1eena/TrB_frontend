// Slice plot (аналог optuna.visualization.plot_slice): значение цели в
// зависимости от одного параметра поиска, с выбором параметра над графиком.
// Params в Trial — всегда числа (proto Trial.params: map<string,double>),
// категориальные значения на этот график не попадают.

import { useMemo, useState } from "react";
import type * as api from "../../../api/strategysearch";
import { linearScale, niceDomain } from "./chartScales";

const W = 640;
const H = 220;
const PAD = { left: 56, right: 12, top: 12, bottom: 30 };

export function SliceChart({
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
  const [selected, setSelected] = useState(paramPaths[0] ?? "");
  const path = paramPaths.includes(selected) ? selected : paramPaths[0];

  const { points, xScale, yScale, xDomain, yDomain } = useMemo(() => {
    const complete = trials.filter(
      (t) => t.state === "TRIAL_STATE_COMPLETE" && t.values?.[metric] != null && t.params?.[path] != null,
    );
    const xs = complete.map((t) => t.params![path]);
    const ys = complete.map((t) => t.values![metric]);
    const xDomain = niceDomain(xs);
    const yDomain = niceDomain(ys);
    const xScale = linearScale(xDomain, [PAD.left, W - PAD.right]);
    const yScale = linearScale(yDomain, [H - PAD.bottom, PAD.top]);
    const points = complete.map((t) => ({
      number: t.number,
      x: xScale(t.params![path]),
      y: yScale(t.values![metric]),
      xv: t.params![path],
      yv: t.values![metric],
    }));
    return { points, xScale, yScale, xDomain, yDomain };
  }, [trials, metric, path]);

  if (paramPaths.length === 0) {
    return <p className="hint">Нет числовых параметров для среза.</p>;
  }

  const xTicks = [xDomain[0], (xDomain[0] + xDomain[1]) / 2, xDomain[1]];
  const yTicks = [yDomain[0], (yDomain[0] + yDomain[1]) / 2, yDomain[1]];

  return (
    <div>
      <label className="filter-field chart-param-picker">
        <span>Параметр</span>
        <select value={path} onChange={(e) => setSelected(e.target.value)}>
          {paramPaths.map((p) => (
            <option key={p} value={p}>
              {paramLabels.get(p) ?? p}
            </option>
          ))}
        </select>
      </label>
      {points.length === 0 ? (
        <p className="hint">Пока нет завершённых трайлов с этим параметром.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={`Срез по параметру ${path}`}>
          {yTicks.map((v, i) => (
            <g key={`y${i}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yScale(v)} y2={yScale(v)} className="chart-gridline" />
              <text x={PAD.left - 6} y={yScale(v)} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
                {v.toFixed(3)}
              </text>
            </g>
          ))}
          {xTicks.map((v, i) => (
            <text key={`x${i}`} x={xScale(v)} y={H - PAD.bottom + 16} className="chart-axis-label" textAnchor="middle">
              {v.toFixed(3)}
            </text>
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="chart-axis" />
          <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} className="chart-axis" />
          {points.map((p) => (
            <circle key={p.number} cx={p.x} cy={p.y} r={3} className="chart-point">
              <title>
                #{p.number}: {(paramLabels.get(path) ?? path)} = {p.xv.toFixed(4)}, {metric} = {p.yv.toFixed(4)}
              </title>
            </circle>
          ))}
        </svg>
      )}
    </div>
  );
}
