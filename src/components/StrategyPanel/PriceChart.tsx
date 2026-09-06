import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  type IChartApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { fetchHistoricCandles, intervalMeta, type CandleBar } from "../../api/tinvest/candles";
import type { BacktestConfig, TradeRecord } from "../../api/strategy";

const MAX_BARS = 16000;

function toSec(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

/** Ближайшая по времени свеча (индекс) для проставления маркера сделки. */
function nearestBarTime(times: number[], target: number): number | null {
  if (times.length === 0) return null;
  let lo = 0;
  let hi = times.length - 1;
  if (target <= times[0]) return times[0];
  if (target >= times[hi]) return times[hi];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const after = times[lo];
  const before = times[lo - 1] ?? after;
  return target - before <= after - target ? before : after;
}

async function loadRange(config: BacktestConfig): Promise<CandleBar[]> {
  const step = Math.max(1, intervalMeta(config.interval).seconds);
  const nowSec = Math.floor(Date.now() / 1000);
  const endSec = Math.min(nowSec, toSec(config.end));
  let cursor = toSec(config.start);
  if (!Number.isFinite(cursor) || !Number.isFinite(endSec)) return [];

  const out: CandleBar[] = [];
  let guard = 0;
  while (cursor < endSec && out.length < MAX_BARS && guard < 40) {
    guard += 1;
    const batch = await fetchHistoricCandles({
      instrumentId: config.uid,
      interval: config.interval,
      fromSec: cursor,
      toSec: endSec,
      limit: 4000,
      newestFirst: false,
    });
    if (batch.length === 0) break;
    for (const bar of batch) {
      const t = bar.time as number;
      if (out.length && t <= (out[out.length - 1].time as number)) continue;
      out.push(bar);
    }
    const last = batch[batch.length - 1].time as number;
    if (last <= cursor) break;
    cursor = last + step;
    if (batch.length < 4000) break;
  }
  return out;
}

export default function PriceChart({
  config,
  trades,
}: {
  config: BacktestConfig;
  trades: TradeRecord[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState<CandleBar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);

  const cfgKey = `${config.uid}:${config.interval}:${config.start}:${config.end}`;

  useEffect(() => {
    let cancelled = false;
    setBars(null);
    setError(null);
    void (async () => {
      try {
        const rows = await loadRange(config);
        if (cancelled) return;
        setBars(rows);
        setCapped(rows.length >= MAX_BARS);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Не удалось загрузить свечи");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey]);

  const markerStats = useMemo(() => {
    const wins = trades.filter((t) => t.pnl >= 0).length;
    return { wins, losses: trades.length - wins };
  }, [trades]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !bars || bars.length === 0) return;

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
    }) as IChartApi;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#3dba7a",
      downColor: "#e0637d",
      wickUpColor: "rgba(61, 186, 122, 0.8)",
      wickDownColor: "rgba(224, 99, 125, 0.8)",
      borderVisible: false,
      priceScaleId: "right",
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      color: "rgba(140, 130, 180, 0.4)",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    candles.setData(
      bars.map((b) => ({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    volume.setData(
      bars.map((b) => ({
        time: b.time,
        value: b.volume,
        color: b.close >= b.open ? "rgba(61, 186, 122, 0.28)" : "rgba(224, 99, 125, 0.28)",
      })),
    );

    const times = bars.map((b) => b.time as number);
    const markers: SeriesMarker<Time>[] = [];
    for (const tr of trades) {
      const entry = nearestBarTime(times, toSec(tr.entryTime));
      const exit = nearestBarTime(times, toSec(tr.exitTime));
      if (entry != null) {
        markers.push({
          time: entry as UTCTimestamp as Time,
          position: "belowBar",
          color: tr.isLong ? "#3dba7a" : "#e0a13d",
          shape: "arrowUp",
          text: tr.isLong ? "BUY" : "SHORT",
        });
      }
      if (exit != null) {
        markers.push({
          time: exit as UTCTimestamp as Time,
          position: "aboveBar",
          color: tr.pnl >= 0 ? "#7fd6a3" : "#e0637d",
          shape: "arrowDown",
          text: `SELL ${tr.pnl >= 0 ? "+" : ""}${tr.pnl.toFixed(0)}`,
        });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    if (markers.length) createSeriesMarkers(candles, markers);

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [bars, trades]);

  if (error) {
    return <p className="strategy-error">График цены: {error}</p>;
  }
  if (bars === null) {
    return (
      <div className="strategy-price-status">
        <span className="strategy-spinner" /> Загрузка свечей…
      </div>
    );
  }
  if (bars.length === 0) {
    return <p className="hint">Свечи для этого инструмента и периода не найдены.</p>;
  }

  return (
    <>
      <div className="strategy-chart-legend">
        <span className="strategy-chart-legend-item">
          <i className="dot buy" /> вход {markerStats.wins + markerStats.losses}
        </span>
        <span className="strategy-chart-legend-item">
          <i className="dot win" /> выход в плюс {markerStats.wins}
        </span>
        <span className="strategy-chart-legend-item">
          <i className="dot loss" /> выход в минус {markerStats.losses}
        </span>
        <span className="strategy-chart-legend-item muted">
          {bars.length.toLocaleString("ru-RU")} свечей
          {capped ? " (показаны первые)" : ""}
        </span>
      </div>
      <div className="strategy-chart-wrap">
        <div ref={wrapRef} className="strategy-equity-chart" />
      </div>
    </>
  );
}
