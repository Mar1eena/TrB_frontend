// Общая обвязка ECharts для графиков поиска: цвета зеркалят CSS-переменные
// темы (см. index.css), т.к. echarts не умеет читать var(--x) в опциях серий
// (тот же приём, что и в EquityChart.tsx для lightweight-charts). Плюс общий
// хук жизненного цикла инстанса — во всех графиках поиска один и тот же
// паттерн init/setOption/resize/dispose, есть смысл не дублировать 6 раз.

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import type { ECharts } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { BarChart, HeatmapChart, LineChart, ParallelChart, ScatterChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  ParallelComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";

// Модульная сборка echarts/core — регистрируем только используемые графиками
// поиска типы серий/компонентов один раз при первом импорте этого файла,
// чтобы не тащить в бандл всю библиотеку целиком (~1MB) ради 6 графиков.
echarts.use([
  SVGRenderer,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  ParallelComponent,
  ToolboxComponent,
  MarkLineComponent,
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  ParallelChart,
]);

export const COLOR = {
  text: "#efe8f8",
  muted: "#a99bb8",
  accent: "#3dba7a",
  accentDim: "rgba(61, 186, 122, 0.18)",
  line: "rgba(200, 180, 230, 0.16)",
  lineSoft: "rgba(200, 180, 230, 0.08)",
  pruned: "#e8b56c",
  fail: "#e88c8c",
  bestLine: "#8fc7e8",
} as const;

// Отдельные палитры для градиентов visualMap.inRange.color по графикам —
// заданы не через COLOR.muted/accent, чтобы каждую можно было подбирать
// независимо от остальных графиков.
export const CONTOUR_COLORS: string[] = ["#d21313", "#3dba7a"];
export const PARALLEL_COLORS: string[] = ["#d21313", "#3dba7a"];
export const SLICE_COLORS: string[] = ["#d21313", "#3dba7a"];

export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export const tooltipStyle = {
  backgroundColor: "rgba(20, 16, 32, 0.92)",
  borderColor: COLOR.line,
  textStyle: { color: COLOR.text, fontSize: 11 },
  extraCssText: "box-shadow: 0 4px 16px rgba(0,0,0,0.35);",
};

export const axisCommon = {
  axisLine: { lineStyle: { color: COLOR.line } },
  axisLabel: { color: COLOR.muted, fontSize: 10 },
  splitLine: { lineStyle: { color: COLOR.lineSoft } },
  axisTick: { lineStyle: { color: COLOR.line } },
};

// Переносит длинное название оси по словам на несколько строк ("\n" — echarts
// рендерит имя оси как обычный многострочный текст) вместо обрезания —
// полное название остаётся читаемым, а место под него зарезервировано
// заранее фиксированными grid-отступами графика, поэтому сетка не «съезжает».
export function wrapAxisName(label: string, maxLineLen = 22): string {
  if (label.length <= maxLineLen) return label;
  const words = label.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxLineLen && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

// ResizeObserver живёт всё время, пока смонтирован компонент, и не зависит
// от пересоздания инстанса графика ниже.
export function useECharts(deps: React.DependencyList, buildOption: (chart: ECharts) => void) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => chartRef.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Инстанс графика пересоздаётся при каждом изменении зависимостей (а не
  // переиспользуется через chart.setOption), иначе toolbox.restore ломается:
  // echarts помнит option только с САМОГО ПЕРВОГО setOption для инстанса
  // (см. OptionManager.mountOption в echarts) и откатывает к нему, а не к
  // текущим данным. Первый вызов у нас часто приходится на ещё не
  // загруженные трайлы (пустые данные) — без пересоздания «Restore» откатывал
  // график к этому пустому состоянию, то есть визуально «удалял» график.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: "svg" });
    chartRef.current = chart;
    buildOption(chart);
    return () => {
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return wrapRef;
}
