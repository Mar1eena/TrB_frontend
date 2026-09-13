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

import { useEffect, useState } from "react";
import type * as api from "../../../api/strategysearch";
import { COLOR, FONT_FAMILY, PARALLEL_COLORS, tooltipStyle, useECharts } from "./echartsSetup";
import { ParamChecklist, topByImportance } from "./ParamChecklist";

/** По умолчанию показываем не больше стольких осей — при 8-10+ параметрах
 * поиска все оси сразу превращают parallel coordinates в нечитаемую кашу. */
const DEFAULT_AXES = 6;

export function ParallelCoordinatesChart({
  trials,
  paramPaths,
  metric,
  maximize,
  paramLabels,
  importances,
}: {
  trials: api.Trial[];
  paramPaths: string[];
  metric: string;
  maximize: boolean;
  paramLabels: Map<string, string>;
  importances: api.ParamImportance[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(topByImportance(paramPaths, importances, DEFAULT_AXES)),
  );

  // Пересобираем выбор при смене набора параметров (другой запуск поиска) —
  // сохраняя пересечение с уже выбранными, чтобы не сбрасывать выбор
  // пользователя лишний раз, когда важности ещё не подгрузились.
  useEffect(() => {
    setSelected((prev) => {
      const kept = paramPaths.filter((p) => prev.has(p));
      if (kept.length > 0) return new Set(kept);
      return new Set(topByImportance(paramPaths, importances, DEFAULT_AXES));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramPaths.join(",")]);

  const axes = paramPaths.filter((p) => selected.has(p));

  const complete = trials.filter(
    (t) => t.state === "TRIAL_STATE_COMPLETE" && t.values?.[metric] != null && axes.every((p) => t.params?.[p] != null),
  );
  const cols = [...axes, metric];
  const objValues = complete.map((t) => t.values![metric]);
  const objMin = objValues.length ? Math.min(...objValues) : 0;
  const objMax = objValues.length ? Math.max(...objValues) : 1;

  const wrapRef = useECharts([trials, axes.join(","), metric, maximize, paramLabels], (chart) => {
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
        feature: { saveAsImage: {}, restore: {} },
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
            value: [...axes.map((p) => t.params![p]), t.values![metric]],
            number: t.number,
          })),
        },
      ],
    });
  });

  const noAxes = axes.length === 0;
  const empty = !noAxes && complete.length === 0;

  return (
    <div>
      <ParamChecklist
        paths={paramPaths}
        paramLabels={paramLabels}
        selected={selected}
        onToggle={(p) =>
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(p)) next.delete(p);
            else next.add(p);
            return next;
          })
        }
        onAll={() => setSelected(new Set(paramPaths))}
        onNone={() => setSelected(new Set())}
      />
      <div style={{ position: "relative" }}>
        {noAxes ? <p className="hint">Выберите хотя бы один параметр.</p> : null}
        {empty ? <p className="hint">Пока нет завершённых трайлов со всеми выбранными параметрами.</p> : null}
        <div
          ref={wrapRef}
          className="chart-echarts chart-echarts--tall"
          aria-label="Parallel coordinates"
          style={{ display: noAxes || empty ? "none" : undefined }}
        />
      </div>
    </div>
  );
}
