// Slice plot (аналог optuna.visualization.plot_slice): значение цели в
// зависимости от параметра(ов) поиска — режим «несколько срезов» рисует
// small-multiples сетку по всем выбранным параметрам сразу, чтобы сравнивать
// их не переключая один <select>. Params в Trial — всегда числа (proto
// Trial.params: map<string,double>), категориальные значения на этот график
// не попадают.
//
// На ECharts добавлена цветовая шкала по номеру трайла (как в оригинальном
// optuna plot_slice) — видно, смещался ли поиск в сторону лучших значений
// параметра по ходу оптимизации, плюс zoom/pan по обеим осям.

import { useEffect, useState } from "react";
import type * as api from "../../../api/strategysearch";
import { axisCommon, COLOR, FONT_FAMILY, SLICE_COLORS, tooltipStyle, useECharts } from "./echartsSetup";
import { ParamChecklist } from "./ParamChecklist";

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
  const [selected, setSelected] = useState<Set<string>>(() => new Set(paramPaths[0] ? [paramPaths[0]] : []));

  // Смена набора параметров (другой запуск поиска) — сохраняем пересечение,
  // а если ничего не осталось, снова выбираем первый параметр по умолчанию.
  useEffect(() => {
    setSelected((prev) => {
      const kept = paramPaths.filter((p) => prev.has(p));
      if (kept.length > 0) return new Set(kept);
      return new Set(paramPaths[0] ? [paramPaths[0]] : []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramPaths.join(",")]);

  const chosen = paramPaths.filter((p) => selected.has(p));

  if (paramPaths.length === 0) {
    return <p className="hint">Нет числовых параметров для среза.</p>;
  }

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
      {chosen.length === 0 ? (
        <p className="hint">Выберите хотя бы один параметр.</p>
      ) : (
        <div className="chart-slice-grid">
          {chosen.map((path) => (
            <div key={path} className="chart-slice-cell">
              <h5>{paramLabels.get(path) ?? path}</h5>
              <SliceChartCell trials={trials} metric={metric} path={path} paramLabels={paramLabels} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SliceChartCell({
  trials,
  metric,
  path,
  paramLabels,
}: {
  trials: api.Trial[];
  metric: string;
  path: string;
  paramLabels: Map<string, string>;
}) {
  const complete = trials.filter((t) => t.state === "TRIAL_STATE_COMPLETE" && t.values?.[metric] != null && t.params?.[path] != null);
  const numbers = complete.map((t) => t.number);

  const wrapRef = useECharts([trials, metric, path, paramLabels], (chart) => {
    chart.setOption({
      backgroundColor: "transparent",
      textStyle: { color: COLOR.text, fontFamily: FONT_FAMILY },
      grid: { left: 64, right: 72, top: 44, bottom: 44 },
      tooltip: {
        trigger: "item",
        ...tooltipStyle,
        formatter: (p: any) => {
          const t = p.data.trial as api.Trial;
          return `#${t.number}<br/>${paramLabels.get(path) ?? path}: ${t.params![path]}<br/>${metric}: ${t.values![metric].toFixed(4)}`;
        },
      },
      visualMap: {
        show: numbers.length > 1,
        dimension: 2,
        min: numbers.length ? Math.min(...numbers) : 0,
        max: numbers.length ? Math.max(...numbers) : 1,
        orient: "vertical",
        right: 4,
        top: "middle",
        itemWidth: 10,
        itemHeight: 80,
        text: ["новее", "раньше"],
        textStyle: { color: COLOR.muted, fontSize: 9 },
        inRange: { color: SLICE_COLORS },
      },
      toolbox: {
        right: 8,
        top: 8,
        iconStyle: { borderColor: COLOR.muted },
        feature: { saveAsImage: {}, dataZoom: { yAxisIndex: "none" }, restore: {} },
      },
      dataZoom: [{ type: "inside", xAxisIndex: 0, yAxisIndex: 0 }],
      xAxis: { type: "value", name: paramLabels.get(path) ?? path, nameTextStyle: { color: COLOR.muted, fontSize: 10 }, nameLocation: "middle", nameGap: 26, scale: true, ...axisCommon },
      yAxis: { type: "value", name: metric, nameTextStyle: { color: COLOR.muted, fontSize: 10 }, scale: true, ...axisCommon },
      series: [
        {
          type: "scatter",
          symbolSize: 7,
          itemStyle: { opacity: 0.85 },
          data: complete.map((t) => ({ value: [t.params![path], t.values![metric], t.number], trial: t })),
        },
      ],
    });
  });

  const empty = complete.length === 0;

  return (
    <div style={{ position: "relative" }}>
      {empty ? <p className="hint">Пока нет завершённых трайлов с этим параметром.</p> : null}
      <div ref={wrapRef} className="chart-echarts" aria-label={`Срез по параметру ${path}`} style={{ display: empty ? "none" : undefined }} />
    </div>
  );
}
