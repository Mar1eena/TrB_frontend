import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { EquityPoint } from "../../api/strategy";

function toSec(iso: string): UTCTimestamp {
  return Math.floor(Date.parse(iso) / 1000) as UTCTimestamp;
}

export default function EquityChart({
  points,
}: {
  points: EquityPoint[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#efe8f8",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(200, 180, 230, 0.08)" },
        horzLines: { color: "rgba(200, 180, 230, 0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(200, 180, 230, 0.18)" },
      timeScale: {
        borderColor: "rgba(200, 180, 230, 0.18)",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: { locale: "ru-RU" },
    });
    chartRef.current = chart;

    const equity = chart.addSeries(AreaSeries, {
      lineColor: "#3dba7a",
      topColor: "rgba(61, 186, 122, 0.28)",
      bottomColor: "rgba(61, 186, 122, 0.02)",
      lineWidth: 2,
      priceScaleId: "right",
    });
    const drawdown = chart.addSeries(LineSeries, {
      color: "rgba(232, 140, 140, 0.75)",
      lineWidth: 1,
      priceScaleId: "dd",
      priceFormat: { type: "percent" },
    });
    chart.priceScale("dd").applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
      borderColor: "rgba(200, 180, 230, 0.18)",
    });

    const seen = new Set<number>();
    const eqData: { time: UTCTimestamp; value: number }[] = [];
    const ddData: { time: UTCTimestamp; value: number }[] = [];
    for (const p of points) {
      const t = toSec(p.time);
      if (!Number.isFinite(t) || seen.has(t)) continue;
      seen.add(t);
      eqData.push({ time: t, value: p.equity });
      ddData.push({ time: t, value: -(p.drawdown ?? 0) * 100 });
    }
    equity.setData(eqData);
    drawdown.setData(ddData);

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [points]);

  return <div ref={wrapRef} className="strategy-equity-chart" />;
}
